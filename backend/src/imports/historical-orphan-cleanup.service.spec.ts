import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { HistoricalOrphanCleanupService } from './historical-orphan-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';

function fixture() {
  const participants = [
    {
      id: 'orphan-a', firstName: 'Иван', lastName: 'Иванов', middleName: null,
      cars: [{ id: 'car-a', isPublic: true, configurations: [{ name: 'MANUAL' }], registrations: [] }],
    },
    {
      id: 'orphan-with-record', firstName: 'Пётр', lastName: 'Петров', middleName: null,
      cars: [{ id: 'car-record', isPublic: false, configurations: [], registrations: [] }],
    },
    {
      id: 'orphan-with-car-registration', firstName: 'Сидор', lastName: 'Сидоров', middleName: null,
      cars: [{ id: 'car-in-use', isPublic: false, configurations: [], registrations: [{ id: 'registration-other' }] }],
    },
  ];
  const db: any = {
    participant: {
      findMany: jest.fn(async () => participants),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    car: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    record: {
      findMany: jest.fn(async () => [{ participantId: 'orphan-with-record', carId: null }]),
    },
    participantLegacyEmail: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    auditLog: { create: jest.fn(async () => ({ id: 'audit' })) },
    $queryRaw: jest.fn(async () => []),
  };
  db.$transaction = jest.fn(async (fn: (tx: any) => Promise<unknown>) => fn(db));
  return { db, service: new HistoricalOrphanCleanupService(db as PrismaService), participants };
}

describe('HistoricalOrphanCleanupService', () => {
  const original = process.env.ALLOW_HISTORICAL_IMPORT_RESET;
  afterEach(() => {
    if (original === undefined) delete process.env.ALLOW_HISTORICAL_IMPORT_RESET;
    else process.env.ALLOW_HISTORICAL_IMPORT_RESET = original;
  });

  it('previews orphan accounts without deleting records and explicitly warns about manual profiles', async () => {
    const { db, service } = fixture();
    const report = await service.preview();
    expect(report.readOnly).toBe(true);
    expect(report.counts).toEqual({
      orphanParticipantsEligibleForRemoval: 1,
      orphanCarsEligibleForRemoval: 1,
      publicCarsAmongCandidates: 1,
      carsWithNonLegacyConfigurations: 1,
      orphanProfilesProtectedByRecords: 1,
    });
    expect(report.scope).toContain('включая созданных вручную');
    expect(report.examples[0]?.name).toBe('Иванов Иван');
    expect(db.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        user: { is: null },
        registrations: { none: {} },
        disqualifications: { none: {} },
        stageInspections: { none: {} },
      }),
    }));
    expect(db.car.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects destructive operations without flag, exact phrase or fresh fingerprint', async () => {
    const { db, service, participants } = fixture();
    const preview = await service.preview();
    delete process.env.ALLOW_HISTORICAL_IMPORT_RESET;
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint)).rejects.toThrow(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    await expect(service.execute('WRONG', preview.fingerprint)).rejects.toThrow(BadRequestException);
    await expect(service.execute(preview.confirmationRequired, 'bad')).rejects.toThrow(BadRequestException);
    participants[0]!.cars[0]!.id = 'different-car';
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint)).rejects.toThrow(BadRequestException);
    expect(db.car.deleteMany).not.toHaveBeenCalled();
  });

  it('removes only eligible orphan cars and participants and audits the operation', async () => {
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    const { db, service } = fixture();
    const preview = await service.preview();
    const result = await service.execute(preview.confirmationRequired, preview.fingerprint);
    expect(result).toMatchObject({ deletedParticipants: 1, deletedCars: 1 });
    expect(db.car.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['car-a'] },
        registrations: { none: {} },
      }),
    }));
    expect(db.participant.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: { in: ['orphan-a'] },
        user: { is: null },
        registrations: { none: {} },
      }),
    }));
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'TEST_ORPHAN_PARTICIPANT_CLEANUP' }),
    }));
  });

  it('rolls back when the number of deleted cars differs from the snapshot', async () => {
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    const { db, service } = fixture();
    db.car.deleteMany.mockResolvedValueOnce({ count: 0 });
    const preview = await service.preview();
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint)).rejects.toThrow(BadRequestException);
    expect(db.participant.deleteMany).not.toHaveBeenCalled();
  });
});
