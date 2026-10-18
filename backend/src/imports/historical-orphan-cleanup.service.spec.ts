import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { HistoricalOrphanCleanupService } from './historical-orphan-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';

function fixture() {
  const participants = [
    {
      id: 'orphan-a', firstName: 'Иван', lastName: 'Иванов', middleName: null,
      cars: [{ id: 'car-a', isPublic: true, configurations: [{ name: 'MANUAL', versions: [{ registrations: [] }] }], registrations: [] }],
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
  const originalOrphans = process.env.ALLOW_TEST_ORPHAN_PARTICIPANT_CLEANUP;
  afterEach(() => {
    if (original === undefined) delete process.env.ALLOW_HISTORICAL_IMPORT_RESET;
    else process.env.ALLOW_HISTORICAL_IMPORT_RESET = original;
    if (originalOrphans === undefined) delete process.env.ALLOW_TEST_ORPHAN_PARTICIPANT_CLEANUP;
    else process.env.ALLOW_TEST_ORPHAN_PARTICIPANT_CLEANUP = originalOrphans;
  });

  it('inventories all participants by registration provenance without deleting or assuming that IMPORT means historical', async () => {
    const { db, service } = fixture();
    const stage = { id: 'stage-1', stageNumber: 1, name: 'Этап', season: { year: 2026 } };
    const person = (id: string, registrations: { id: string; source: string; stage: typeof stage }[], user: any = null) => ({
      id, firstName: 'Имя', lastName: id, middleName: null, user, registrations,
      cars: [{ id: 'car-' + id, registrations: registrations.map((r) => ({ id: r.id })) }],
      disqualifications: [], stageInspections: [],
    });
    const dataset = [
      person('linked', [], { id: 'user-1' }),
      person('unused', []),
      person('imported', [{ id: 'reg-a', source: 'IMPORT', stage }]),
      person('manual', [{ id: 'reg-b', source: 'ONLINE', stage }]),
      person('mixed', [
        { id: 'reg-c', source: 'IMPORT', stage },
        { id: 'reg-d', source: 'ONLINE', stage },
      ]),
    ];
    db.participant.findMany.mockResolvedValueOnce(dataset);
    db.record.findMany.mockResolvedValueOnce([
      { participantId: null, carId: 'car-mixed', isManualOverride: true },
    ]);

    const report = await service.diagnostics();
    expect(report.readOnly).toBe(true);
    expect(report.counts).toEqual({
      totalParticipants: 5,
      linkedToUserAccounts: 1,
      withoutUserAccounts: 4,
      withoutRegistrations: 1,
      withImportOnlyRegistrations: 1,
      withOtherOnlyRegistrations: 1,
      withMixedRegistrations: 1,
      importRegistrationsOnUnclaimedProfiles: 2,
      otherRegistrationsOnUnclaimedProfiles: 2,
      unclaimedWithProtectedHistory: 1,
      unclaimedWithoutProtectedHistory: 3,
    });
    expect(report.examples.importOnly[0].name).toBe('imported Имя');
    expect(report.examples.mixed[0].hasProtectedHistory).toBe(true);
    expect(report.warning).toContain('не доказательство');
    expect(db.participant.deleteMany).not.toHaveBeenCalled();
    expect(db.car.deleteMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
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
    process.env.ALLOW_TEST_ORPHAN_PARTICIPANT_CLEANUP = 'true';
    await expect(service.execute('WRONG', preview.fingerprint)).rejects.toThrow(BadRequestException);
    await expect(service.execute(preview.confirmationRequired, 'bad')).rejects.toThrow(BadRequestException);
    participants[0]!.cars[0]!.id = 'different-car';
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint)).rejects.toThrow(BadRequestException);
    expect(db.car.deleteMany).not.toHaveBeenCalled();
  });

  it('removes only eligible orphan cars and participants and audits the operation', async () => {
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    process.env.ALLOW_TEST_ORPHAN_PARTICIPANT_CLEANUP = 'true';
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
    process.env.ALLOW_TEST_ORPHAN_PARTICIPANT_CLEANUP = 'true';
    const { db, service } = fixture();
    db.car.deleteMany.mockResolvedValueOnce({ count: 0 });
    const preview = await service.preview();
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint)).rejects.toThrow(BadRequestException);
    expect(db.participant.deleteMany).not.toHaveBeenCalled();
  });
});
