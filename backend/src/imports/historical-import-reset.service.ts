import { BadRequestException, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const RESET_CONFIRMATION = 'RESET_HISTORICAL_IMPORT_TEST_DATA';
const HISTORICAL_SOURCE = 'HISTORICAL_XLSX';

@Injectable()
export class HistoricalImportResetService {
  constructor(private readonly prisma: PrismaService) {}

  private async plan() {
    const jobs = await this.prisma.importJob.findMany({
      where: { metadata: { path: ['source'], equals: HISTORICAL_SOURCE } },
      select: { id: true, stageId: true, status: true, metadata: true, stage: { select: { id: true, name: true, stageNumber: true, season: { select: { year: true } } } } },
    });
    const stageIds = [...new Set(jobs.map((job) => job.stageId))];
    const registrations = stageIds.length
      ? await this.prisma.registration.findMany({
          where: { stageId: { in: stageIds }, source: 'IMPORT' },
          select: { id: true, participantId: true, carId: true, stageId: true },
        })
      : [];
    const registrationIds = registrations.map((registration) => registration.id);
    const resultRows = registrationIds.length
      ? await this.prisma.result.findMany({ where: { registrationId: { in: registrationIds } }, select: { id: true } })
      : [];
    const importOnlyParticipantIds = [...new Set(registrations.map((registration) => registration.participantId))];
    const importCarIds = [...new Set(registrations.map((registration) => registration.carId))];

    const removableCars = importCarIds.length
      ? await this.prisma.car.findMany({
          where: { id: { in: importCarIds }, registrations: { none: { id: { notIn: registrationIds } } } },
          select: { id: true, participantId: true },
        })
      : [];
    const removableCarIds = removableCars.map((car) => car.id);
    const removableParticipants = importOnlyParticipantIds.length
      ? await this.prisma.participant.findMany({
          where: {
            id: { in: importOnlyParticipantIds },
            registrations: { none: { id: { notIn: registrationIds } } },
            user: { is: null },
            disqualifications: { none: {} },
            stageInspections: { none: {} },
          },
          select: { id: true },
        })
      : [];

    return {
      jobs,
      stageIds,
      registrations,
      registrationIds,
      resultIds: resultRows.map((result) => result.id),
      removableCarIds,
      removableParticipantIds: removableParticipants.map((participant) => participant.id),
      stages: jobs.map((job) => ({ id: job.stage.id, seasonYear: job.stage.season.year, stageNumber: job.stage.stageNumber, name: job.stage.name, importJobId: job.id, importStatus: job.status })),
    };
  }

  async preview() {
    const plan = await this.plan();
    return {
      success: true,
      mode: 'DRY_RUN',
      readOnly: true,
      confirmationRequired: RESET_CONFIRMATION,
      scope: 'Только ImportJob с metadata.source=HISTORICAL_XLSX и регистрации source=IMPORT на связанных этапах.',
      counts: {
        historicalImportJobs: plan.jobs.length,
        affectedStages: plan.stageIds.length,
        importedRegistrations: plan.registrations.length,
        results: plan.resultIds.length,
        recordsLinkedToThoseResults: plan.resultIds.length,
        orphanCarsEligibleForRemoval: plan.removableCarIds.length,
        orphanParticipantsEligibleForRemoval: plan.removableParticipantIds.length,
      },
      stages: plan.stages,
      protections: [
        'Этапы, сезоны, классы, настройки сайта, справочники и аккаунты не удаляются.',
        'Регистрации с источником PRE_REGISTRATION или ON_SITE не удаляются.',
        'Автомобили с другими регистрациями и участники с аккаунтом, дисквалификацией или инспекцией сохраняются.',
        'Удаление результатов и связанных рекордов выполняется в транзакции.',
      ],
    };
  }

  async execute(confirmation: string) {
    if (process.env.ALLOW_HISTORICAL_IMPORT_RESET !== 'true') {
      throw new ForbiddenException('Очистка отключена. Для тестового окружения явно установите ALLOW_HISTORICAL_IMPORT_RESET=true после проверки базы.');
    }
    if (confirmation !== RESET_CONFIRMATION) {
      throw new BadRequestException(`Для подтверждения передайте confirmation=${RESET_CONFIRMATION}`);
    }

    const before = await this.plan();
    const removed = await this.prisma.$transaction(async (tx) => {
      // Remove record rows before their linked results; never delete unrelated/manual records.
      const deletedRecords = before.resultIds.length
        ? await tx.record.deleteMany({ where: { resultId: { in: before.resultIds } } })
        : { count: 0 };
      const deletedRegistrations = before.registrationIds.length
        ? await tx.registration.deleteMany({ where: { id: { in: before.registrationIds }, source: 'IMPORT' } })
        : { count: 0 };
      const deletedJobs = before.jobs.length
        ? await tx.importJob.deleteMany({ where: { id: { in: before.jobs.map((job) => job.id) } } })
        : { count: 0 };

      // Cars are removed only if no registrations remain. Car configurations cascade with the car.
      const carsStillUsed = before.removableCarIds.length
        ? await tx.registration.findMany({ where: { carId: { in: before.removableCarIds } }, select: { carId: true }, distinct: ['carId'] })
        : [];
      const usedCarIds = new Set(carsStillUsed.map((row) => row.carId));
      const safeCarIds = before.removableCarIds.filter((id) => !usedCarIds.has(id));
      const deletedCars = safeCarIds.length ? await tx.car.deleteMany({ where: { id: { in: safeCarIds } } }) : { count: 0 };

      const participantCandidates = before.removableParticipantIds;
      const safeParticipants = participantCandidates.length
        ? await tx.participant.findMany({
            where: {
              id: { in: participantCandidates },
              registrations: { none: {} },
              user: { is: null },
              disqualifications: { none: {} },
              stageInspections: { none: {} },
            },
            select: { id: true },
          })
        : [];
      const deletedParticipants = safeParticipants.length
        ? await tx.participant.deleteMany({ where: { id: { in: safeParticipants.map((p) => p.id) } })
        : { count: 0 };

      return {
        deletedImportJobs: deletedJobs.count,
        deletedImportedRegistrations: deletedRegistrations.count,
        deletedRecords: deletedRecords.count,
        deletedOrphanCars: deletedCars.count,
        deletedOrphanParticipants: deletedParticipants.count,
      };
    });

    return {
      success: true,
      mode: 'RESET_HISTORICAL_IMPORT',
      ...removed,
      stagesKept: before.stageIds.length,
      message: 'Исторические импорты и связанные импортированные данные очищены. Этапы и системные справочники сохранены; можно заново подготовить исходные XLSX.',
    };
  }
}
