import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type DataQualitySeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface DataQualityIssue {
  code: string;
  severity: DataQualitySeverity;
  entity: string;
  entityId: string;
  message: string;
  context?: Record<string, unknown>;
}

@Injectable()
export class DataQualityService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport() {
    const issues: DataQualityIssue[] = [];

    const [
      registrationsWithoutInspection,
      registrationsWithoutClasses,
      failedInspectionsWithResults,
      resultsForCancelledRegistrations,
      resultsForFailedInspections,
      pendingHistoricalResults,
      resultUnitMismatches,
      orphanRecords,
      recordUnitMismatches,
      carsWithoutConfigurations,
      importJobsWithWarnings,
    ] = await Promise.all([
      this.prisma.registration.findMany({
        where: {
          status: 'ACTIVE',
          inspection: null,
        },
        select: {
          id: true,
          participantId: true,
          participantNumber: true,
          stageId: true,
        },
        take: 200,
      }),
      this.prisma.registration.findMany({
        where: {
          status: 'ACTIVE',
          classes: { none: {} },
        },
        select: {
          id: true,
          participantId: true,
          participantNumber: true,
          stageId: true,
        },
        take: 200,
      }),
      this.prisma.inspection.findMany({
        where: {
          status: 'FAILED',
          registration: {
            results: { some: {} },
          },
        },
        select: {
          id: true,
          registrationId: true,
        },
        take: 200,
      }),
      this.prisma.result.findMany({
        where: {
          registration: { status: 'CANCELLED' },
        },
        select: {
          id: true,
          registrationId: true,
        },
        take: 200,
      }),
      this.prisma.result.findMany({
        where: {
          registration: {
            inspection: { status: 'FAILED' },
          },
        },
        select: {
          id: true,
          registrationId: true,
        },
        take: 200,
      }),
      this.prisma.result.findMany({
        where: {
          isHistorical: true,
          verificationStatus: 'PENDING',
        },
        select: {
          id: true,
          registrationId: true,
        },
        take: 200,
      }),
      this.prisma.result.findMany({
        where: {
          OR: [
            { unit: 'DB', registrationClass: { class: { unit: { not: 'DB' } } } },
            { unit: 'MPS', registrationClass: { class: { unit: { not: 'MPS' } } } },
            { unit: 'OTHER', registrationClass: { class: { unit: { not: 'OTHER' } } } },
          ],
        },
        select: {
          id: true,
          registrationClassId: true,
          unit: true,
          registrationClass: {
            select: {
              classId: true,
              class: { select: { code: true, unit: true } },
            },
          },
        },
        take: 200,
      }),
      this.prisma.record.findMany({
        where: { result: null },
        select: {
          id: true,
          classId: true,
          resultId: true,
        },
        take: 200,
      }),
      this.prisma.record.findMany({
        where: {
          OR: [
            { unit: 'DB', class: { unit: { not: 'DB' } } },
            { unit: 'MPS', class: { unit: { not: 'MPS' } } },
            { unit: 'OTHER', class: { unit: { not: 'OTHER' } } },
          ],
        },
        select: {
          id: true,
          classId: true,
          unit: true,
        },
        take: 200,
      }),
      this.prisma.car.findMany({
        where: {
          isActive: true,
          configurations: { none: {} },
        },
        select: {
          id: true,
          participantId: true,
          brand: true,
          model: true,
        },
        take: 200,
      }),
      this.prisma.importJob.findMany({
        where: {
          status: { in: ['DRAFT', 'READY'] },
          rows: { some: { status: 'WARNING' } },
        },
        select: {
          id: true,
          stageId: true,
          status: true,
          rows: {
            where: { status: 'WARNING' },
            select: { id: true, rowNumber: true },
            take: 200,
          },
        },
        take: 200,
      }),
    ]);

    const add = (
      code: string,
      severity: DataQualitySeverity,
      entity: string,
      entityId: string,
      message: string,
      context?: Record<string, unknown>,
    ) => issues.push({ code, severity, entity, entityId, message, context });

    registrationsWithoutInspection.forEach((item) =>
      add(
        'REGISTRATION_WITHOUT_INSPECTION',
        'WARNING',
        'Registration',
        item.id,
        'Активная регистрация не прошла техническую проверку.',
        {
          participantId: item.participantId,
          participantNumber: item.participantNumber,
          stageId: item.stageId,
        },
      ),
    );

    registrationsWithoutClasses.forEach((item) =>
      add(
        'REGISTRATION_WITHOUT_CLASSES',
        'ERROR',
        'Registration',
        item.id,
        'Активная регистрация не содержит ни одного класса.',
        {
          participantId: item.participantId,
          participantNumber: item.participantNumber,
          stageId: item.stageId,
        },
      ),
    );

    failedInspectionsWithResults.forEach((item) =>
      add(
        'FAILED_INSPECTION_WITH_RESULT',
        'ERROR',
        'Inspection',
        item.id,
        'Для регистрации с FAILED-инспекцией существует результат.',
        { registrationId: item.registrationId },
      ),
    );

    resultsForCancelledRegistrations.forEach((item) =>
      add(
        'RESULT_FOR_CANCELLED_REGISTRATION',
        'ERROR',
        'Result',
        item.id,
        'Результат привязан к отменённой регистрации.',
        { registrationId: item.registrationId },
      ),
    );

    resultsForFailedInspections.forEach((item) =>
      add(
        'RESULT_FOR_FAILED_INSPECTION',
        'ERROR',
        'Result',
        item.id,
        'Результат существует при FAILED-инспекции.',
        { registrationId: item.registrationId },
      ),
    );

    pendingHistoricalResults.forEach((item) =>
      add(
        'HISTORICAL_RESULT_PENDING',
        'WARNING',
        'Result',
        item.id,
        'Исторический результат ещё не подтверждён администратором.',
        { registrationId: item.registrationId },
      ),
    );

    resultUnitMismatches.forEach((item) =>
      add(
        'RESULT_UNIT_MISMATCH',
        'ERROR',
        'Result',
        item.id,
        'Единица результата не совпадает с единицей класса.',
        {
          classId: item.registrationClass.classId,
          classCode: item.registrationClass.class.code,
          resultUnit: item.unit,
          classUnit: item.registrationClass.class.unit,
        },
      ),
    );

    orphanRecords.forEach((item) =>
      add(
        'ORPHAN_RECORD',
        'ERROR',
        'Record',
        item.id,
        'Рекорд не связан с результатом.',
        {
          classId: item.classId,
          resultId: item.resultId,
        },
      ),
    );

    recordUnitMismatches.forEach((item) =>
      add(
        'RECORD_UNIT_MISMATCH',
        'ERROR',
        'Record',
        item.id,
        'Единица рекорда не совпадает с единицей класса.',
        {
          classId: item.classId,
          recordUnit: item.unit,
        },
      ),
    );

    carsWithoutConfigurations.forEach((item) =>
      add(
        'CAR_WITHOUT_CONFIGURATION',
        'WARNING',
        'Car',
        item.id,
        'Активный автомобиль не имеет ни одной конфигурации.',
        {
          participantId: item.participantId,
          brand: item.brand,
          model: item.model,
        },
      ),
    );

    importJobsWithWarnings.forEach((item) =>
      add(
        'IMPORT_WITH_UNRESOLVED_WARNINGS',
        'ERROR',
        'ImportJob',
        item.id,
        'Импорт содержит строки с нерешёнными предупреждениями.',
        {
          stageId: item.stageId,
          status: item.status,
          warningRows: item.rows.map((row) => row.rowNumber),
        },
      ),
    );

    const counts = {
      total: issues.length,
      error: issues.filter((issue) => issue.severity === 'ERROR').length,
      warning: issues.filter((issue) => issue.severity === 'WARNING').length,
      info: issues.filter((issue) => issue.severity === 'INFO').length,
    };

    return {
      success: true,
      generatedAt: new Date(),
      counts,
      healthy: counts.error === 0 && counts.warning === 0,
      issues,
    };
  }
}
