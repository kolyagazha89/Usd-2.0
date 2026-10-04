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
        findMany: jest.fn().mockResolvedValue(results),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({}),
      },
      registration: {
        findUnique: jest.fn(),
      },
      record: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(existingRecord),
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
      where: { id: 'result-2' },
      data: { isBest: true },
    });
    expect(tx.record.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultId: 'result-2',
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
      where: { id: 'result-earlier' },
      data: { isBest: true },
    });
  });

  it('preserves an old record when a new record takes over', async () => {
    const old = {
      id: 'old-record',
      resultId: 'result-old',
      isCurrent: true,
    };
    const tx = setupRecalc([
      result('new', 160, '2026-03-01T10:00:00.000Z'),
      result('old', 155, '2026-02-01T10:00:00.000Z'),
    ], old);

    await service.recalculateCurrentRecord('class-1');

    expect(tx.record.updateMany).toHaveBeenCalledWith({
      where: { classId: 'class-1', isCurrent: true },
      data: { isCurrent: false },
    });
    expect(tx.record.create).toHaveBeenCalled();
    expect(tx.record.create.mock.calls[0][0].data.resultId).toBe('result-new');
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
      where: { id: 'result-good' },
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
      where: { id: 'result-imported' },
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

  it('does not expose car registration number in public records', () => {
    const includeText = JSON.stringify(service['publicInclude']);
    expect(includeText).not.toContain('registrationNumber');
  });
});
