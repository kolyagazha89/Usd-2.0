import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

const RESET_CONFIRMATION = 'RESET_HISTORICAL_IMPORT_TEST_DATA';

@Injectable()
export class HistoricalImportResetService {
  constructor(private readonly prisma: PrismaService) {}

  private async plan(client: PrismaService | Prisma.TransactionClient = this.prisma) {
    // Both imported XLSX snapshots and the two-Google-Sheets historical flow
    // must be included. Selecting all IMPORT registrations by stage alone is
    // unsafe: a normal import might have used the same stage.
    const jobs = await client.importJob.findMany({
      where: {
        OR: [
          { metadata: { path: ['source'], equals: 'HISTORICAL_XLSX' } },
          { metadata: { path: ['historicalResults'], equals: true } },
        ],
      },
      select: {
        id: true,
        stageId: true,
        status: true,
        rows: {
          where: { status: 'COMMITTED', registrationId: { not: null } },
          select: { registrationId: true },
        },
        stage: {
          select: {
            id: true,
            name: true,
            stageNumber: true,
            season: { select: { year: true } },
          },
        },
      },
    });
    const jobIds = jobs.map((job) => job.id);
    const stageIds = [...new Set(jobs.map((job) => job.stageId))];
    const linkedRegistrationIds = [...new Set(
      jobs.flatMap((job) => job.rows.map((row) => row.registrationId).filter((id): id is string => Boolean(id))),
    )];

    // A registration touched by another committed import is not ours to delete.
    const sharedRows = linkedRegistrationIds.length
      ? await client.importRow.findMany({
          where: {
            registrationId: { in: linkedRegistrationIds },
            importJobId: { notIn: jobIds },
            status: 'COMMITTED',
          },
          select: { registrationId: true },
        })
      : [];
    const sharedIds = new Set(sharedRows.map((row) => row.registrationId).filter(Boolean));

    // Preserve registrations that subsequently received ordinary/manual results.
    const ordinaryResults = linkedRegistrationIds.length
      ? await client.result.findMany({
          where: { registrationId: { in: linkedRegistrationIds }, isHistorical: false },
          select: { registrationId: true },
        })
      : [];
    const ordinaryResultIds = new Set(ordinaryResults.map((row) => row.registrationId));

    const registrations = linkedRegistrationIds.length
      ? await client.registration.findMany({
          where: {
            id: { in: linkedRegistrationIds },
            stageId: { in: stageIds },
            source: 'IMPORT',
          },
          select: { id: true, participantId: true, carId: true, stageId: true },
        })
      : [];
    const eligible = registrations.filter(
      (registration) => !sharedIds.has(registration.id) && !ordinaryResultIds.has(registration.id),
    );
    const registrationIds = eligible.map((item) => item.id);
    const resultRows = registrationIds.length
      ? await client.result.findMany({
          where: { registrationId: { in: registrationIds } },
          select: { id: true },
        })
      : [];
    const resultIds = resultRows.map((row) => row.id);
    const linkedRecordCount = resultIds.length
      ? await client.record.count({ where: { resultId: { in: resultIds } } })
      : 0;

    const candidateCarIds = [...new Set(eligible.map((row) => row.carId))];
    const candidateParticipantIds = [...new Set(eligible.map((row) => row.participantId))];
    const manualRecords = candidateCarIds.length || candidateParticipantIds.length
      ? await client.record.findMany({
          where: {
            OR: [
              { carId: { in: candidateCarIds } },
              { participantId: { in: candidateParticipantIds } },
            ],
          } as any,
          select: { carId: true, participantId: true, resultId: true },
        })
      : [];
    const protectedCarIds = new Set(
      manualRecords.filter((row) => !row.resultId || !resultIds.includes(row.resultId))
        .map((row) => row.carId).filter((id): id is string => Boolean(id)),
    );
    const protectedParticipantIds = new Set(
      manualRecords.filter((row) => !row.resultId || !resultIds.includes(row.resultId))
        .map((row) => row.participantId).filter((id): id is string => Boolean(id)),
    );

    const removableCars = candidateCarIds.length
      ? await client.car.findMany({
          where: {
            id: { in: candidateCarIds },
            isPublic: false,
            participant: { user: { is: null } },
            registrations: { none: { id: { notIn: registrationIds } } },
            // A manually managed configuration is evidence that the car is
            // not an import-only placeholder; leave it alone.
            configurations: { some: { name: 'LEGACY_IMPORT' }, every: { name: 'LEGACY_IMPORT' } },
          },
          select: { id: true },
        })
      : [];
    const removableCarIds = removableCars.map((car) => car.id).filter((id) => !protectedCarIds.has(id));
    const removableParticipants = candidateParticipantIds.length
      ? await client.participant.findMany({
          where: {
            id: { in: candidateParticipantIds },
            registrations: { none: { id: { notIn: registrationIds } } },
            user: { is: null },
            disqualifications: { none: {} },
            stageInspections: { none: {} },
            cars: { none: { id: { notIn: removableCarIds } } },
          },
          select: { id: true },
        })
      : [];
    const removableParticipantIds = removableParticipants.map((row) => row.id)
      .filter((id) => !protectedParticipantIds.has(id));

    return {
      jobs, jobIds, stageIds, registrations, registrationIds, resultIds,
      linkedRecordCount, removableCarIds, removableParticipantIds,
      sharedOrManualRegistrationsPreserved: linkedRegistrationIds.length - registrationIds.length,
      stages: jobs.map((job) => ({
        id: job.stage.id,
        seasonYear: job.stage.season.year,
        stageNumber: job.stage.stageNumber,
        name: job.stage.name,
        importJobId: job.id,
        importStatus: job.status,
      })),
    };
  }

  async preview() {
    const plan = await this.plan();
    return {
      success: true,
      mode: 'DRY_RUN',
      readOnly: true,
      confirmationRequired: RESET_CONFIRMATION,
      scope: 'Только регистрации, связанные с COMMITTED-строками исторических импортов; обычные импорты исключены.',
      counts: {
        historicalImportJobs: plan.jobIds.length,
        affectedStages: plan.stageIds.length,
        importedRegistrations: plan.registrationIds.length,
        results: plan.resultIds.length,
        recordsLinkedToThoseResults: plan.linkedRecordCount,
        orphanCarsEligibleForRemoval: plan.removableCarIds.length,
        orphanParticipantsEligibleForRemoval: plan.removableParticipantIds.length,
        registrationsProtectedByOtherImportsOrManualResults: plan.sharedOrManualRegistrationsPreserved,
      },
      stages: plan.stages,
      protections: [
        'Сохраняются этапы, сезоны, классы, настройки сайта, справочники, аккаунты.',
        'Не удаляются обычные регистрации и регистрации, затронутые сторонними импортами.',
        'Автомобили с другими регистрациями, публичные автомобили и машины с ручными конфигурациями сохраняются.',
        'Все операции удаления выполняются в одной транзакции; доступ разрешён только ADMIN на тестовом окружении.',
      ],
    };
  }

  async execute(confirmation: string, request?: AuthenticatedRequest) {
    if (process.env.ALLOW_HISTORICAL_IMPORT_RESET !== 'true') {
      throw new ForbiddenException('Очистка отключена. Установите ALLOW_HISTORICAL_IMPORT_RESET=true только для тестовой базы.');
    }
    if (confirmation !== RESET_CONFIRMATION) {
      throw new BadRequestException(`Для подтверждения передайте confirmation=${RESET_CONFIRMATION}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Import commit also takes a lock on its job followed by a stage-level
      // advisory lock; use the same ordering to avoid racing a commit.
      const initial = await this.plan(tx);
      for (const jobId of [...initial.jobIds].sort()) {
        await tx.$queryRaw`SELECT id FROM "ImportJob" WHERE id = ${jobId} FOR UPDATE`;
      }
      for (const stageId of [...initial.stageIds].sort()) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${stageId}))::text AS locked`;
      }
      const plan = await this.plan(tx);
      const deletedRecords = plan.resultIds.length
        ? await tx.record.deleteMany({ where: { resultId: { in: plan.resultIds } } })
        : { count: 0 };
      const deletedNotifications = plan.registrationIds.length
        ? await tx.emailNotificationLog.deleteMany({ where: { registrationId: { in: plan.registrationIds } } })
        : { count: 0 };
      const deletedRegistrations = plan.registrationIds.length
        ? await tx.registration.deleteMany({
            where: { id: { in: plan.registrationIds }, source: 'IMPORT' },
          })
        : { count: 0 };

      const safeCarIds = plan.removableCarIds.length
        ? (await tx.car.findMany({
            where: { id: { in: plan.removableCarIds }, registrations: { none: {} } },
            select: { id: true },
          })).map((row) => row.id)
        : [];
      const deletedCars = safeCarIds.length
        ? await tx.car.deleteMany({ where: { id: { in: safeCarIds } } })
        : { count: 0 };

      const safeParticipants = plan.removableParticipantIds.length
        ? await tx.participant.findMany({
            where: {
              id: { in: plan.removableParticipantIds },
              user: { is: null },
              registrations: { none: {} },
              cars: { none: {} },
              disqualifications: { none: {} },
              stageInspections: { none: {} },
            },
            select: { id: true },
          })
        : [];
      const participantIds = safeParticipants.map((row) => row.id);
      const deletedLegacyEmails = participantIds.length
        ? await tx.participantLegacyEmail.deleteMany({ where: { participantId: { in: participantIds } } })
        : { count: 0 };
      const deletedParticipants = participantIds.length
        ? await tx.participant.deleteMany({ where: { id: { in: participantIds } } })
        : { count: 0 };
      const deletedJobs = plan.jobIds.length
        ? await tx.importJob.deleteMany({ where: { id: { in: plan.jobIds } } })
        : { count: 0 };

      const counts = {
        deletedImportJobs: deletedJobs.count,
        deletedImportedRegistrations: deletedRegistrations.count,
        deletedRecords: deletedRecords.count,
        deletedEmailNotificationLogs: deletedNotifications.count,
        deletedOrphanCars: deletedCars.count,
        deletedOrphanParticipants: deletedParticipants.count,
        deletedLegacyParticipantEmails: deletedLegacyEmails.count,
        stagesKept: plan.stageIds.length,
        protectedRegistrationsKept: plan.sharedOrManualRegistrationsPreserved,
      };
      await tx.auditLog.create({
        data: {
          userId: request?.user?.sub ?? null,
          action: 'HISTORICAL_IMPORT_TEST_RESET',
          entity: 'ImportJob',
          metadata: counts,
          ipAddress: request?.ip ?? null,
        },
      });
      return {
        success: true,
        mode: 'RESET_HISTORICAL_IMPORT',
        ...counts,
        message: 'Тестовые исторические импорты очищены; этапы и справочники сохранены для повторного импорта.',
      };
    }, { maxWait: 15000, timeout: 120000 });
  }
}
