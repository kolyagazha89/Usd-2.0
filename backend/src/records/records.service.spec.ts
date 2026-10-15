import { jest } from '@jest/globals';
import { RecordsService } from './records.service';

describe('RecordsService', () => {
  const prisma: any = {
    record: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    class: {
      findUnique: jest.fn(),
    },
    siteSettings: { findUnique: jest.fn().mockResolvedValue({ catalogs: {} }) },
    $transaction: jest.fn(),
  };

  const service = new RecordsService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function setupRecalc(results: any[], existingRecord: any = null) {
    const tx: any = {
      class: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'class-1',
          name: 'Limited 2.0',
          unit: 'DB',
        }),
      },
      result: {
        findMany: jest.fn().mockResolvedValue(
          [...results].sort((a, b) =>
            Number(b.value) - Number(a.value) ||
            a.registration.stage.date.getTime() - b.registration.stage.date.getTime() ||
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.localeCompare(b.id),
          ),
        ),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      registration: {
        findUnique: jest.fn(),
      },
      record: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockImplementation(
          async ({ where }: { where: { resultId?: string } }) =>
            existingRecord && where?.resultId === existingRecord.resultId
              ? existingRecord
              : null,
        ),
        update: jest.fn().mockResolvedValue({
          id: 'record-1',
          resultId: 'result-1',
          isCurrent: true,
        }),
        create: jest.fn().mockResolvedValue({
          id: 'record-1',
          resultId: 'result-1',
          isCurrent: true,
        }),
      },
      disqualification: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    return tx;
  }

  const result = (id: string, value: number, createdAt: string, extra: any = {}) => ({
    id,
    value,
    unit: 'DB',
    createdAt: new Date(createdAt),
    notes: null,
    registrationClass: {
      id: `rc-${id}`,
      classId: 'class-1',
      class: {
        id: 'class-1',
        name: 'Limited 2.0',
        unit: 'DB',
        direction: { name: 'SPL' },
      },
    },
    registration: {
      id: `reg-${id}`,
      participantId: `participant-${id}`,
      stageId: `stage-${id}`,
      source: extra.source ?? 'PRE_REGISTRATION',
      status: extra.status ?? 'ACTIVE',
      carId: `car-${id}`,
      participant: {},
      car: {},
      stage: {
        seasonId: extra.seasonId ?? 'season-1',
        date: new Date(createdAt),
      },
    },
  });

  it('keeps the higher result as the current all-time class record', async () => {
    const tx = setupRecalc([
      result('1', 150, '2026-01-01T10:00:00.000Z'),
      result('2', 155, '2026-02-01T10:00:00.000Z'),
    ]);

    const records = await service.recalculateCurrentRecord('class-1');

    expect(records).toHaveLength(1);
    expect(tx.result.update).toHaveBeenCalledWith({
      where: { id: '2' },
      data: { isBest: true },
    });
    expect(tx.record.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultId: '2',
          value: 155,
          isCurrent: true,
        }),
      }),
    );
  });

  it('keeps the earlier result when values are equal', async () => {
    const tx = setupRecalc([
      result('later', 155, '2026-02-01T10:00:00.000Z'),
      result('earlier', 155, '2026-01-01T10:00:00.000Z'),
    ]);

    await service.recalculateCurrentRecord('class-1');

    expect(tx.result.update).toHaveBeenCalledWith({
      where: { id: 'earlier' },
      data: { isBest: true },
    });
  });

  it('preserves an old record when a new record takes over', async () => {
    const old = {
      id: 'old-record',
      resultId: 'old',
      isCurrent: true,
    };
    const tx = setupRecalc([
      result('new', 160, '2026-03-01T10:00:00.000Z'),
      result('old', 155, '2026-02-01T10:00:00.000Z'),
    ]);

    await service.recalculateCurrentRecord('class-1');

    expect(tx.record.updateMany).toHaveBeenCalledWith({
      where: { classId: 'class-1', isCurrent: true },
      data: { isCurrent: false },
    });
    expect(tx.record.create).toHaveBeenCalled();
    expect(tx.record.create.mock.calls[0][0].data.resultId).toBe('new');
  });

  it('excludes an actively disqualified result and recalculates the next record', async () => {
    const tx = setupRecalc([
      result('bad', 170, '2026-04-01T10:00:00.000Z', { seasonId: 'season-1' }),
      result('good', 160, '2026-03-01T10:00:00.000Z', { seasonId: 'season-1' }),
    ]);
    tx.disqualification.findFirst
      .mockResolvedValueOnce({ id: 'dq-1' })
      .mockResolvedValueOnce(null);

    await service.recalculateCurrentRecord('class-1');

    expect(tx.result.update).toHaveBeenCalledWith({
      where: { id: 'good' },
      data: { isBest: true },
    });
  });

  it('includes imported historical results in the all-time record', async () => {
    const tx = setupRecalc([
      result('imported', 180, '2020-01-01T10:00:00.000Z', { source: 'IMPORT' }),
      result('normal', 170, '2026-01-01T10:00:00.000Z'),
    ]);

    await service.recalculateCurrentRecord('class-1');

    expect(tx.result.update).toHaveBeenCalledWith({
      where: { id: 'imported' },
      data: { isBest: true },
    });
  });

  it('does not create records for BassRace classes', async () => {
    const tx = setupRecalc([
      result('bassrace', 159.9, '2026-05-01T10:00:00.000Z'),
    ]);
    tx.class.findUnique.mockResolvedValue({
      id: 'class-1',
      name: '159.9',
      unit: 'DB',
      direction: { name: 'BassRace' },
    });

    const records = await service.recalculateCurrentRecord('class-1');

    expect(records).toEqual([]);
    expect(tx.record.updateMany).toHaveBeenCalledWith({
      where: { classId: 'class-1', isCurrent: true },
      data: { isCurrent: false },
    });
    expect(tx.result.updateMany).toHaveBeenCalledWith({
      where: {
        registrationClass: { classId: 'class-1' },
        isBest: true,
      },
      data: { isBest: false },
    });
    expect(tx.result.findMany).not.toHaveBeenCalled();
    expect(tx.record.create).not.toHaveBeenCalled();
  });

  it('allows record recalculation for Storm Wall classes', async () => {
    const tx = setupRecalc([result('storm', 18.4, '2026-05-01T10:00:00.000Z')]);
    tx.class.findUnique.mockResolvedValue({
      id: 'class-1', code: 'STORM_WALL', name: 'Storm Wall', unit: 'MPS',
      direction: { name: 'Storm Wall' },
    });
    await service.recalculateCurrentRecord('class-1');
    expect(tx.result.findMany).toHaveBeenCalled();
    expect(tx.record.create).toHaveBeenCalled();
  });

  it('respects per-class public record visibility and always hides BassRace', async () => {
    prisma.siteSettings.findUnique.mockResolvedValue({ catalogs: { recordVisibility: { hidden: false, enabled: true, bass: true } } });
    const records = [
      { class: { id: 'hidden', name: 'Limited 2.0', direction: { name: 'SPL' } } },
      { class: { id: 'enabled', name: '1x2', direction: { name: 'SPL' } } },
      { class: { id: 'bass', name: '159.9', direction: { name: 'BassRace' } } },
      { class: { id: 'storm', name: 'Storm Wall', direction: { name: 'Storm Wall' } } },
    ];
    await expect((service as any).filterPublicRecordVisibility(records)).resolves.toEqual([records[1], records[3]]);
  });

  it('limits public current records to published or completed, non-deleted stages', async () => {
    prisma.record.findMany.mockResolvedValue([]);

    await service.findCurrent();

    expect(prisma.record.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        isCurrent: true,
        result: expect.objectContaining({
          registration: expect.objectContaining({
            stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] }, resultsPublishedAt: { not: null } },
          }),
        }),
      }),
    }));
  });

  it('does not expose car registration number in public records', () => {
    const includeText = JSON.stringify(service['publicInclude']);
    expect(includeText).not.toContain('registrationNumber');
  });
});
