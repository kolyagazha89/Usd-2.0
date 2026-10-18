import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

const CONFIRMATION = 'DELETE_TEST_ORPHAN_PARTICIPANTS';

@Injectable()
export class HistoricalOrphanCleanupService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Historical ImportJob/ImportRow provenance is no longer available after a
   * reset. This plan intentionally selects only *unclaimed and entirely
   * unregistered* profiles. It must NOT be described as "imported only":
   * admin-created orphan profiles can also match.
   */
  private async plan(client: PrismaService | Prisma.TransactionClient = this.prisma) {
    const unclaimed = await client.participant.findMany({
      where: {
        user: { is: null },
        registrations: { none: {} },
        disqualifications: { none: {} },
        stageInspections: { none: {} },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        cars: {
          select: {
            id: true,
            isPublic: true,
            configurations: { select: { name: true } },
            registrations: { select: { id: true } },
          },
        },
      },
      orderBy: { id: 'asc' },
    });

    // Cars can theoretically have registrations belonging to another profile.
    const candidates = unclaimed.filter((person) =>
      person.cars.every((car) => car.registrations.length === 0),
    );
    const candidateIds = candidates.map((person) => person.id);
    const candidateCarIds = candidates.flatMap((person) => person.cars.map((car) => car.id));

    // Records have soft references rather than foreign keys. Preserve every
    // profile/car mentioned by any historical or manually set record.
    const records = candidateIds.length
      ? await client.record.findMany({
          where: {
            OR: [
              { participantId: { in: candidateIds } },
              { carId: { in: candidateCarIds } },
            ],
          },
          select: { participantId: true, carId: true },
        })
      : [];
    const protectedParticipantIds = new Set(
      records.map((record) => record.participantId).filter((id): id is string => Boolean(id)),
    );
    const protectedCarIds = new Set(
      records.map((record) => record.carId).filter((id): id is string => Boolean(id)),
    );
    const eligible = candidates.filter((person) =>
      !protectedParticipantIds.has(person.id) &&
      person.cars.every((car) => !protectedCarIds.has(car.id)),
    );

    const participantIds = eligible.map((person) => person.id).sort();
    const carIds = eligible.flatMap((person) => person.cars.map((car) => car.id)).sort();
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ participantIds, carIds }))
      .digest('hex');
    return {
      participantIds,
      carIds,
      fingerprint,
      counts: {
        orphanParticipantsEligibleForRemoval: participantIds.length,
        orphanCarsEligibleForRemoval: carIds.length,
        publicCarsAmongCandidates: eligible.flatMap((person) => person.cars).filter((car) => car.isPublic).length,
        carsWithNonLegacyConfigurations: eligible.flatMap((person) => person.cars).filter((car) =>
          car.configurations.some((config) => config.name !== 'LEGACY_IMPORT'),
        ).length,
        orphanProfilesProtectedByRecords: candidates.length - eligible.length,
      },
      examples: eligible.slice(0, 20).map((person) => ({
        name: [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' '),
        cars: person.cars.length,
      })),
    };
  }

  async preview() {
    const plan = await this.plan();
    return {
      success: true,
      mode: 'DRY_RUN',
      readOnly: true,
      confirmationRequired: CONFIRMATION,
      fingerprint: plan.fingerprint,
      counts: plan.counts,
      examples: plan.examples,
      scope: 'Незарегистрированные участники без аккаунта и защищённых связей, включая созданных вручную. Происхождение после предыдущей очистки нельзя определить точно.',
      protections: [
        'Аккаунты пользователей и связанные с ними участники не удаляются.',
        'Участники и машины с регистрациями, инспекциями, дисквалификациями или рекордами не удаляются.',
        'Сезоны, этапы, классы, настройки, справочники и журналы аудита сохраняются.',
        'Удаление доступно только администратору при временно включённом флаге тестовой очистки.',
      ],
    };
  }

  async execute(confirmation: string, fingerprint: string, request?: AuthenticatedRequest) {
    if (process.env.ALLOW_HISTORICAL_IMPORT_RESET !== 'true') {
      throw new ForbiddenException('Очистка отключена. Разрешите её только на тестовой базе после резервного копирования.');
    }
    if (confirmation !== CONFIRMATION || !/^[a-f0-9]{64}$/.test(fingerprint)) {
      throw new BadRequestException('Требуется новая контрольная фраза и fingerprint из предпросмотра.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('USD_TEST_ORPHAN_PROFILE_CLEANUP'))::text AS locked`;
      const plan = await this.plan(tx);
      if (plan.fingerprint !== fingerprint) {
        throw new BadRequestException('Состав участников изменился. Повторите предпросмотр очистки.');
      }
      if (plan.participantIds.length === 0) {
        return { success: true, deletedParticipants: 0, deletedCars: 0, deletedLegacyEmails: 0 };
      }

      const deletedCars = plan.carIds.length
        ? await tx.car.deleteMany({
            where: {
              id: { in: plan.carIds },
              registrations: { none: {} },
              participant: {
                id: { in: plan.participantIds },
                user: { is: null },
                registrations: { none: {} },
                disqualifications: { none: {} },
                stageInspections: { none: {} },
              },
            },
          })
        : { count: 0 };
      if (deletedCars.count !== plan.carIds.length) {
        throw new BadRequestException('Связи автомобилей изменились; удаление отменено целиком.');
      }

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
      if (deletedParticipants.count !== plan.participantIds.length) {
        throw new BadRequestException('Связи участников изменились; удаление отменено целиком.');
      }

      const summary = {
        deletedParticipants: deletedParticipants.count,
        deletedCars: deletedCars.count,
        deletedLegacyEmails: deletedLegacyEmails.count,
      };
      await tx.auditLog.create({
        data: {
          userId: request?.user?.sub ?? null,
          action: 'TEST_ORPHAN_PARTICIPANT_CLEANUP',
          entity: 'Participant',
          metadata: { ...summary, previewFingerprint: fingerprint },
          ipAddress: request?.ip ?? null,
        },
      });
      return { success: true, mode: 'TEST_ORPHAN_PARTICIPANT_CLEANUP', ...summary };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 15000,
      timeout: 120000,
    });
  }
}
