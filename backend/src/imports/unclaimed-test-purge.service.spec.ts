import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { UnclaimedTestPurgeService } from './unclaimed-test-purge.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';

function fixture() {
  const people: any[] = [
    {
      id: 'unclaimed-a', lastName: 'Неверное', firstName: 'Фио', middleName: null, photoUrl: null,
      cars: [{
        id: 'car-a', photoUrl: null, registrations: [],
        configurations: [{ versions: [{ registrations: [] }] }],
      }],
      disqualifications: [{ id: 'dq-a' }],
      stageInspections: [{ id: 'inspection-a' }],
    },
    {
      id: 'unclaimed-b', lastName: 'Ошибка', firstName: 'Истории', middleName: null, photoUrl: null,
      cars: [{
        id: 'car-b', photoUrl: null, registrations: [],
        configurations: [{ versions: [{ registrations: [] }] }],
      }],
      disqualifications: [], stageInspections: [],
    },
  ];
  const rows: any[] = [
    { id: 'record-a', participantId: 'unclaimed-a', carId: 'car-a', resultId: null, classId: 'class-1', isManualOverride: true },
    { id: 'record-b', participantId: 'unclaimed-b', carId: 'car-b', resultId: null, classId: 'class-1', isManualOverride: false },
  ];
  const db: any = {
    participant: {
      findMany: jest.fn(async () => people),
      deleteMany: jest.fn(async () => ({ count: people.length })),
    },
    record: {
      findMany: jest.fn(async () => rows),
      deleteMany: jest.fn(async () => ({ count: rows.length })),
    },
    importRow: { findMany: jest.fn(async () => []) },
    disqualification: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    participantStageInspection: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    car: { deleteMany: jest.fn(async () => ({ count: 2 })) },
    participantLegacyEmail: { deleteMany: jest.fn(async () => ({ count: 2 })) },
    auditLog: { create: jest.fn(async () => ({ id: 'audit-1' })) },
    $queryRaw: jest.fn(async () => []),
  };
  db.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) => cb(db));
  const records: any = { recalculateCurrentRecord: jest.fn(async () => []) };
  const service = new UnclaimedTestPurgeService(
    db as PrismaService, records as RecordsService,
  );
  return { db, people, rows, records, service };
}

describe('UnclaimedTestPurgeService', () => {
  const flag = process.env.ALLOW_HISTORICAL_IMPORT_RESET;
  const otherFlag = process.env.ALLOW_TEST_UNCLAIMED_PROFILE_PURGE;
  afterEach(() => {
    if (flag === undefined) delete process.env.ALLOW_HISTORICAL_IMPORT_RESET;
    else process.env.ALLOW_HISTORICAL_IMPORT_RESET = flag;
    if (otherFlag === undefined) delete process.env.ALLOW_TEST_UNCLAIMED_PROFILE_PURGE;
    else process.env.ALLOW_TEST_UNCLAIMED_PROFILE_PURGE = otherFlag;
  });

  it('previews all unclaimed unregistered people including ones protected by old standalone records', async () => {
    const { db, service } = fixture();
    const preview = await service.preview();
    expect(preview.readOnly).toBe(true);
    expect(preview.allowed).toBe(true);
    expect(preview.counts).toMatchObject({
      participants: 2, cars: 2, linkedRecords: 2,
      manualRecordOverrides: 1, disqualifications: 1, stageInspections: 1,
    });
    expect(preview.confirmationRequired).toBe('DROP 2 UNCLAIMED PROFILES');
    expect(db.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { user: { is: null }, registrations: { none: {} } },
    }));
    expect(db.participant.deleteMany).not.toHaveBeenCalled();
  });

  it('requires two temporary server flags, exact number, phrase and fingerprint', async () => {
    const { db, service } = fixture();
    const preview = await service.preview();
    delete process.env.ALLOW_HISTORICAL_IMPORT_RESET;
    delete process.env.ALLOW_TEST_UNCLAIMED_PROFILE_PURGE;
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint, 2))
      .rejects.toThrow(ForbiddenException);
    expect(db.$transaction).not.toHaveBeenCalled();
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    process.env.ALLOW_TEST_UNCLAIMED_PROFILE_PURGE = 'true';
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint, 3))
      .rejects.toThrow(BadRequestException);
    await expect(service.execute('wrong phrase', preview.fingerprint, 2))
      .rejects.toThrow(BadRequestException);
    await expect(service.execute(preview.confirmationRequired, 'bad', 2))
      .rejects.toThrow(BadRequestException);
    expect(db.participant.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes dependent stale records first then disqualifications, inspections, cars and profiles', async () => {
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    process.env.ALLOW_TEST_UNCLAIMED_PROFILE_PURGE = 'true';
    const { db, service, records } = fixture();
    const preview = await service.preview();
    const result = await service.execute(preview.confirmationRequired, preview.fingerprint, 2);
    expect(result).toMatchObject({
      success: true, deletedRecords: 2, deletedParticipants: 2, deletedCars: 2,
      deletedDisqualifications: 1, deletedStageInspections: 1,
      recalculatedRecordClasses: 1,
    });
    expect(db.record.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['record-a', 'record-b'] } } });
    expect(db.participant.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        user: { is: null }, registrations: { none: {} }, cars: { none: {} },
      }),
    }));
    expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'TEST_UNCLAIMED_PROFILES_PURGE' }),
    }));
    expect(records.recalculateCurrentRecord).toHaveBeenCalledWith('class-1');
  });

  it('blocks record references to existing results or other participants without deletion', async () => {
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    process.env.ALLOW_TEST_UNCLAIMED_PROFILE_PURGE = 'true';
    const { db, service, rows } = fixture();
    rows[0].resultId = 'real-result';
    rows[1].carId = 'car-owned-by-account';
    const preview = await service.preview();
    expect(preview.allowed).toBe(false);
    expect(preview.blocking.recordsWithLiveResults).toBe(1);
    expect(preview.blocking.recordsLinkingOtherParticipantsOrCars).toBe(1);
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint, 2))
      .rejects.toThrow(BadRequestException);
    expect(db.record.deleteMany).not.toHaveBeenCalled();
  });

  it('blocks cars whose configuration versions belong to registrations and referenced import rows', async () => {
    const { db, service, people } = fixture();
    people[0].cars[0].configurations[0].versions[0].registrations.push({ id: 'external-registration' });
    db.importRow.findMany.mockResolvedValue([{ id: 'committed-row', participantId: 'unclaimed-a', registrationId: null }]);
    const preview = await service.preview();
    expect(preview.allowed).toBe(false);
    expect(preview.blocking.carOrConfigurationRegistrations).toBe(1);
    expect(preview.blocking.activeImportRowReferences).toBe(1);
  });

  it('requires an unchanged snapshot and rolls back if any delete count differs', async () => {
    process.env.ALLOW_HISTORICAL_IMPORT_RESET = 'true';
    process.env.ALLOW_TEST_UNCLAIMED_PROFILE_PURGE = 'true';
    const { db, service, rows } = fixture();
    const preview = await service.preview();
    rows.push({ id: 'new-record', participantId: 'unclaimed-a', carId: 'car-a', resultId: null, classId: 'class-2', isManualOverride: false });
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint, 2))
      .rejects.toThrow(BadRequestException);
    expect(db.record.deleteMany).not.toHaveBeenCalled();
    rows.pop();
    db.record.deleteMany.mockResolvedValueOnce({ count: 1 });
    await expect(service.execute(preview.confirmationRequired, preview.fingerprint, 2))
      .rejects.toThrow(BadRequestException);
    expect(db.participant.deleteMany).not.toHaveBeenCalled();
  });
});
