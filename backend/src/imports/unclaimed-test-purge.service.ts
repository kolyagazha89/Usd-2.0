import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

type Client = PrismaService | Prisma.TransactionClient;

/**
 * TEST-ONLY data reset. ImportJob provenance is gone after an earlier reset:
 * this selects every unclaimed, unregistered participant, NOT only imports.
 * No automated cleanup or production startup path calls this service.
 */
@Injectable()
export class UnclaimedTestPurgeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly records: RecordsService,
  ) {}

  private async plan(db: Client = this.prisma) {
    const people = await db.participant.findMany({
      where: {
        user: { is: null },
        registrations: { none: {} },
      },
      select: {
        id: true, firstName: true, lastName: true, middleName: true, photoUrl: true,
        cars: {
          select: {
            id: true, photoUrl: true,
            registrations: { select: { id: true } },
            configurations: {
              select: {
                versions: {
                  select: { registrations: { select: { id: true } } },
                },
              },
            },
          },
        },
        disqualifications: { select: { id: true } },
        stageInspections: { select: { id: true } },
      },
      orderBy: { id: 'asc' },
    });
    const participantIds = people.map((p) => p.id).sort();
    const carIds = people.flatMap((p) => p.cars.map((c) => c.id)).sort();
    const idSet = new Set(participantIds);
    const carSet = new Set(carIds);

    const recordRows = participantIds.length
      ? await db.record.findMany({
          where: {
            OR: [
              { participantId: { in: participantIds } },
              { carId: { in: carIds } },
            ],
          },
          select: {
            id: true, participantId: true, carId: true, resultId: true,
            classId: true, isManualOverride: true,
          },
        })
      : [];
    const importRowReferences = participantIds.length
      ? await db.importRow.findMany({
          where: { participantId: { in: participantIds } },
          select: { id: true, participantId: true, registrationId: true },
        })
      : [];
    const crossLinkedRecords = recordRows.filter((r) =>
      (r.participantId !== null && !idSet.has(r.participantId)) ||
      (r.carId !== null && !carSet.has(r.carId)));
    const resultLinkedRecords = recordRows.filter((r) => r.resultId !== null);
    const registeredCars = people.flatMap((person) => person.cars).filter((car) =>
      car.registrations.length > 0 ||
      car.configurations.some((config) => config.versions.some((version) =>
        version.registrations.length > 0)));
    const blocking = {
      recordsWithLiveResults: resultLinkedRecords.length,
      recordsLinkingOtherParticipantsOrCars: crossLinkedRecords.length,
      carOrConfigurationRegistrations: registeredCars.length,
      activeImportRowReferences: importRowReferences.length,
    };
    const allowed = Object.values(blocking).every((v) => v === 0);
    const disqualificationIds = people.flatMap((person) => person.disqualifications.map((d) => d.id)).sort();
    const stageInspectionIds = people.flatMap((person) => person.stageInspections.map((i) => i.id)).sort();
    const recordIds = recordRows.map((r) => r.id).sort();
    const affectedClassIds = [...new Set(recordRows.map((r) => r.classId))].sort();
    const snapshot = {
      participantIds, carIds, recordRows: recordRows
        .map((r) => ({
          id: r.id, participantId: r.participantId, carId: r.carId,
          resultId: r.resultId, classId: r.classId, isManualOverride: r.isManualOverride,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
      disqualificationIds, stageInspectionIds,
      importedRowIds: importRowReferences.map((r) => r.id).sort(),
      registeredCarIds: registeredCars.map((r) => r.id).sort(),
    };
    const fingerprint = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    return {
      participantIds, carIds, recordIds, disqualificationIds, stageInspectionIds,
      affectedClassIds, fingerprint, blocking, allowed,
      counts: {
        participants: participantIds.length,
        cars: carIds.length,
        linkedRecords: recordIds.length,
        manualRecordOverrides: recordRows.filter((r) => r.isManualOverride).length,
        disqualifications: disqualificationIds.length,
        stageInspections: stageInspectionIds.length,
        mediaLinksNotDeleted: people.filter((p) => p.photoUrl).length +
          people.flatMap((p) => p.cars).filter((c) => c.photoUrl).length,
      },
      examples: people.slice(0, 25).map((p) => ({
        name: [p.lastName, p.firstName, p.middleName].filter(Boolean).join(' '),
        cars: p.cars.length,
      })),
    };
  }

  async preview() {
    const p = await this.plan();
    return {
      success: true,
      readOnly: true,
      mode: 'TEST_UNCLAIMED_PARTICIPANT_PURGE',
      fingerprint: p.fingerprint,
      allowed: p.allowed,
      confirmationRequired: `DROP ${p.counts.participants} UNCLAIMED PROFILES`,
      counts: p.counts,
      blocking: p.blocking,
      examples: p.examples,
      warnings: [
        'Это ВСЕ участники без аккаунтов и регистраций, включая созданных вручную; подтверждения исторического происхождения больше нет.',
        'Удаляются записи рекордов, принадлежащие только этой группе, включая ручные overrides; после очистки рекорды классов пересчитываются.',
        'Также удаляются связанные тестовые дисквалификации, инспекции этапа, автомобили и версии конфигураций. Аккаунты и зарегистрированные участники сохраняются.',
        'Файлы фотографий во внешнем S3 и аудитные журналы не удаляются. Перед выполнением обязательна проверенная внешняя резервная копия базы.',
      ],
    };
  }

  async execute(
    confirmation: string,
    fingerprint: string,
    expectedParticipants: number,
    request?: AuthenticatedRequest,
  ) {
    if (
      process.env.ALLOW_HISTORICAL_IMPORT_RESET !== 'true' ||
      process.env.ALLOW_TEST_UNCLAIMED_PROFILE_PURGE !== 'true'
    ) {
      throw new ForbiddenException(
        'Массовая очистка отключена. Только после резервной копии тестовой БД включите ALLOW_HISTORICAL_IMPORT_RESET=true и ALLOW_TEST_UNCLAIMED_PROFILE_PURGE=true.',
      );
    }
    if (
      !/^[a-f0-9]{64}$/.test(fingerprint) ||
      !Number.isSafeInteger(expectedParticipants) ||
      expectedParticipants < 1 ||
      confirmation !== `DROP ${expectedParticipants} UNCLAIMED PROFILES`
    ) {
      throw new BadRequestException('Укажите fingerprint и точную фразу из свежего предпросмотра.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('USD_TEST_UNCLAIMED_PROFILE_PURGE'))::text AS locked`;
      const plan = await this.plan(tx);
      if (
        plan.fingerprint !== fingerprint ||
        plan.counts.participants !== expectedParticipants ||
        !plan.allowed
      ) {
        throw new BadRequestException(
          'Состав базы изменился либо обнаружены защищённые связи. Обновите предпросмотр, ничего не удалено.',
        );
      }
      const deletedRecords = await tx.record.deleteMany({ where: { id: { in: plan.recordIds } } });
      if (deletedRecords.count !== plan.recordIds.length) throw new BadRequestException('Изменились записи рекордов; транзакция отменена.');

      const deletedDisqualifications = await tx.disqualification.deleteMany({
        where: { id: { in: plan.disqualificationIds }, participantId: { in: plan.participantIds } },
      });
      if (deletedDisqualifications.count !== plan.disqualificationIds.length) throw new BadRequestException('Изменились дисквалификации; транзакция отменена.');

      const deletedStageInspections = await tx.participantStageInspection.deleteMany({
        where: { id: { in: plan.stageInspectionIds }, participantId: { in: plan.participantIds } },
      });
      if (deletedStageInspections.count !== plan.stageInspectionIds.length) throw new BadRequestException('Изменились инспекции; транзакция отменена.');

      const deletedCars = await tx.car.deleteMany({
        where: {
          id: { in: plan.carIds },
          participantId: { in: plan.participantIds },
          registrations: { none: {} },
        },
      });
      if (deletedCars.count !== plan.carIds.length) throw new BadRequestException('Изменились автомобили; транзакция отменена.');

      const deletedLegacyEmails = await tx.participantLegacyEmail.deleteMany({
        where: { participantId: { in: plan.participantIds } },
      });
      const deletedParticipants = await tx.participant.deleteMany({
        where: {
          id: { in: plan.participantIds },
          user: { is: null },
          registrations: { none: {} },
          cars: { none: {} },
          disqualifications: { none: {} },
          stageInspections: { none: {} },
        },
      });
      if (deletedParticipants.count !== plan.participantIds.length) throw new BadRequestException('Изменились профили; транзакция отменена.');

      const report = {
        deletedParticipants: deletedParticipants.count,
        deletedCars: deletedCars.count,
        deletedRecords: deletedRecords.count,
        deletedDisqualifications: deletedDisqualifications.count,
        deletedStageInspections: deletedStageInspections.count,
        deletedLegacyEmails: deletedLegacyEmails.count,
      };
      await tx.auditLog.create({
        data: {
          userId: request?.user?.sub ?? null,
          action: 'TEST_UNCLAIMED_PROFILES_PURGE',
          entity: 'Participant',
          metadata: { ...report, previewFingerprint: fingerprint },
          ipAddress: request?.ip ?? null,
        },
      });
      return { report, affectedClassIds: plan.affectedClassIds };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 15000,
      timeout: 120000,
    });

    const recordWarnings: string[] = [];
    for (const classId of result.affectedClassIds) {
      try {
        await this.records.recalculateCurrentRecord(classId);
      } catch {
        recordWarnings.push(`Не удалось пересчитать рекорд класса ${classId}`);
      }
    }
    return {
      success: true,
      mode: 'TEST_UNCLAIMED_PARTICIPANT_PURGE',
      ...result.report,
      recalculatedRecordClasses: result.affectedClassIds.length - recordWarnings.length,
      recordWarnings,
    };
  }
}
