import { jest } from '@jest/globals';

import { HistoricalResultsService } from './historical-results.service';

describe('HistoricalResultsService', () => {
  const prisma: any = { $transaction: jest.fn(), result: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn() } };
  const records: any = {
    createFromResultIfEligible: jest.fn(),
    syncAfterResultUpdate: jest.fn(),
  };
  const ranking: any = { recalculateByStageClass: jest.fn() };

  const admin1: any = { user: { sub: 'admin-1', role: 'ADMIN' }, ip: '127.0.0.1' };
  const admin2: any = { user: { sub: 'admin-2', role: 'ADMIN' }, ip: '127.0.0.2' };
  const judge: any = { user: { sub: 'judge-1', role: 'JUDGE' }, ip: '127.0.0.3' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('orders bulk archive verification by competition date to preserve chronological record history', async () => {
    prisma.result.findMany.mockResolvedValue([]);
    const service = new HistoricalResultsService(prisma, records, ranking);

    await expect(service.verifyAll(admin1)).resolves.toEqual({
      success: true,
      processed: 0,
      total: 0,
      remaining: 0,
    });

    expect(prisma.result.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { isHistorical: true, verificationStatus: 'PENDING' },
      orderBy: [
        { registration: { stage: { date: 'asc' } } },
        { registrationClass: { classId: 'asc' } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    }));
  });

  it('allows creation only for ADMIN', async () => {
    const service = new HistoricalResultsService(prisma, records, ranking);

    await expect(service.create({
      stageId: 'stage-1',
      participantId: 'participant-1',
      participantNumber: 10,
      classId: 'class-1',
      value: 150,
    } as any, judge)).rejects.toThrow('Исторические результаты может вносить только администратор');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows the same ADMIN to verify a pending historical result', async () => {
    const verified = {
      id: 'result-1',
      isHistorical: true,
      verificationStatus: 'VERIFIED',
      createdByUserId: 'admin-1',
      registration: { stageId: 'stage-2019' },
      registrationClass: { classId: 'class-1' },
    };
    const tx: any = {
      result: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'result-1',
          isHistorical: true,
          verificationStatus: 'PENDING',
          createdByUserId: 'admin-1',
        }),
        update: jest.fn().mockResolvedValue(verified),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));
    prisma.result.findFirst.mockResolvedValue(verified);
    const service = new HistoricalResultsService(prisma, records, ranking);

    await service.verify('result-1', admin1);

    expect(tx.result.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'result-1' },
      data: expect.objectContaining({
        verificationStatus: 'VERIFIED',
        verifiedByUserId: 'admin-1',
      }),
    }));
    expect(records.createFromResultIfEligible).toHaveBeenCalledWith('result-1');
    expect(ranking.recalculateByStageClass).toHaveBeenCalledWith('stage-2019', 'class-1');
  });

  it('verifies a historical result and immediately recalculates records and ranking', async () => {
    const verified = {
      id: 'result-1',
      isHistorical: true,
      verificationStatus: 'VERIFIED',
      createdByUserId: 'admin-1',
      registration: { stageId: 'stage-2019' },
      registrationClass: { classId: 'class-1' },
    };
    const tx: any = {
      result: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'result-1',
          isHistorical: true,
          verificationStatus: 'PENDING',
          createdByUserId: 'admin-1',
        }),
        update: jest.fn().mockResolvedValue(verified),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));
    prisma.result.findFirst.mockResolvedValue(verified);
    const service = new HistoricalResultsService(prisma, records, ranking);

    await service.verify('result-1', admin2);

    expect(tx.result.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'result-1' },
      data: expect.objectContaining({
        verificationStatus: 'VERIFIED',
        verifiedByUserId: 'admin-2',
      }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'HISTORICAL_RESULT_VERIFIED' }),
    }));
    expect(records.createFromResultIfEligible).toHaveBeenCalledWith('result-1');
    expect(ranking.recalculateByStageClass).toHaveBeenCalledWith('stage-2019', 'class-1');
  });

  it('does not allow editing a pending historical result', async () => {
    const tx: any = {
      result: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'result-1',
          isHistorical: true,
          verificationStatus: 'PENDING',
          value: 150,
          registration: { stage: { id: 'stage-1' } },
        }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));
    const service = new HistoricalResultsService(prisma, records, ranking);

    await expect(service.update('result-1', { value: 151 }, admin2)).rejects.toThrow(
      'Редактировать можно только подтверждённый исторический результат',
    );
  });

  it('puts a corrected verified historical result back into pending and recalculates immediately', async () => {
    const tx: any = {
      result: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'result-1',
          isHistorical: true,
          verificationStatus: 'VERIFIED',
          value: { toString: () => '150.000' },
          place: 1,
          notes: 'old',
          registration: { stage: { stageId: 'stage-2019' } },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'result-1',
          value: { toString: () => '152.300' },
          place: 1,
          notes: 'corrected',
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));
    prisma.result.findUniqueOrThrow = jest.fn().mockResolvedValue({
      registration: { stageId: 'stage-2019' },
      registrationClass: { classId: 'class-1' },
    });
    prisma.result.findFirst.mockResolvedValue({
      id: 'result-1',
      isHistorical: true,
      verificationStatus: 'PENDING',
    });
    const service = new HistoricalResultsService(prisma, records, ranking);

    await service.update('result-1', { value: 152.3, notes: 'corrected' }, admin2);

    expect(tx.result.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        value: 152.3,
        verificationStatus: 'PENDING',
        verifiedByUserId: null,
        verifiedAt: null,
      }),
    }));
    expect(records.syncAfterResultUpdate).toHaveBeenCalledWith('result-1');
    expect(ranking.recalculateByStageClass).toHaveBeenCalledWith('stage-2019', 'class-1');
  });
});
