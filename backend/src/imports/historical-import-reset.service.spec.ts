import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { HistoricalImportResetService } from './historical-import-reset.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';

const historicalJob = {
  id: 'job-historical',
  stageId: 'stage-1',
  status: 'COMMITTED',
  rows: [{ registrationId: 'reg-historical' }],
  stage: { id: 'stage-1', name: 'Архив', stageNumber: 1, season: { year: 2026 } },
};

function fixture(shared = false) {
  const client: any = {
    importJob: {
      findMany: jest.fn(async () => [historicalJob]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    importRow: {
      findMany: jest.fn(async () => shared ? [{ registrationId: 'reg-historical' }] : []),
    },
    registration: {
      findMany: jest.fn(async () => [{
        id: 'reg-historical',
        stageId: 'stage-1',
        carId: 'car-imported',
        participantId: 'participant-imported',
      }]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    result: {
      findMany: jest.fn(async () => [{ id: 'result-historical', registrationClass: { classId: 'class-1' } }]),
    },
    record: {
      count: jest.fn(async () => 1),
      findMany: jest.fn(async () => [{ id: 'record-1', resultId: 'result-historical', carId: 'car-imported', participantId: 'participant-imported' }]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    car: {
      findMany: jest.fn(async () => [{ id: 'car-imported' }]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    participant: {
      findMany: jest.fn(async () => [{ id: 'participant-imported' }]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    emailNotificationLog: {
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    participantLegacyEmail: {
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    auditLog: {
      create: jest.fn(async () => ({ id: 'audit-1' })),
    },
    $queryRaw: jest.fn(async () => []),
  };
  client.$transaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(client));
  return {
    client,
    service: new HistoricalImportResetService(
      client as PrismaService,
      { recalculateCurrentRecord: jest.fn(async () => []) } as unknown as RecordsService,
    ),
  };
}

describe('HistoricalImportResetService', () => {
  const priorFlag = process.env.ALLOW_HISTORICAL_IMPORT_RESET;

  afterEach(() => {
    if (priorFlag === undefined) delete process.env.ALLOW_HISTORICAL_IMPORT_RESET;
    else process.env.ALLOW_HISTORICAL_IMPORT_RESET = priorFlag;
  });

  it('previews only registrations backed by committed historical import rows, not all registrations on the stage', async () => {
    const { service, client } = fixture();
    const report = await service.preview();
    expect(report.readOnly).toBe(true);
    expect(report.counts.importedRegistrations).toBe(1);
    expect(report.counts.orphanParticipantsEligibleForRemoval).toBe(1);
    expect(client.registration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['reg-historical'] },
          source: 'IMPORT',
        }),
      }),
    );
    expect(client.registration.deleteMany).not.toHaveBeenCalled();
    expect(client.importJob.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
    );
  });

  it('preserves a registration also linked to a non-historical import', async () => {
    const { service } = fixture(true);
    const report = await service.preview();
    expect(report.counts.importedRegistrations).toBe(0);
    expect(report.counts.registrationsProtectedByOtherImportsOrManualResults).toBe(1);
  });

  it('refuses destructive execution unless explicitly enabled for the test database', async () => {
    delete process.env.ALLOW_HISTORICAL_IMPORT_RESET;
    const { service, client } = fixture();
    await expect(service.execute('RESET_HISTORICAL_IMPORT_TEST_DATA')).rejects.toThrow(ForbiddenException);
    expect(client.$transaction).not.toHaveBeenCalled();
  });

  it('deletes scoped data transactionally and keeps the stage itself', async () => {
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    const { service, client } = fixture();
    await expect(service.execute('invalid')).rejects.toThrow(BadRequestException);
    const report = await service.execute('RESET_HISTORICAL_IMPORT_TEST_DATA');
    expect(report).toMatchObject({
      success: true,
      deletedImportedRegistrations: 1,
      deletedRecords: 1,
      deletedOrphanCars: 1,
      deletedOrphanParticipants: 1,
      stagesKept: 1,
    });
    expect(client.car.deleteMany).toHaveBeenCalled();
    expect(client.participantLegacyEmail.deleteMany).toHaveBeenCalled();
    expect(client.importJob.deleteMany).toHaveBeenCalled();
    expect(client.auditLog.create).toHaveBeenCalled();
  });
});
