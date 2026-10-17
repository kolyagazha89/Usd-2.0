import { jest } from '@jest/globals';
import { ResultDeletionService } from './result-deletion.service';

describe('ResultDeletionService', () => {
  const prisma: any = { $transaction: jest.fn() };
  const records: any = { recalculateCurrentRecord: jest.fn() };
  const ranking: any = { recalculateByStageClass: jest.fn() };
  const service = new ResultDeletionService(prisma, records, ranking);
  const adminRequest: any = {
    user: { sub: 'admin-1', role: 'ADMIN' },
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    records.recalculateCurrentRecord.mockResolvedValue([]);
    ranking.recalculateByStageClass.mockResolvedValue([]);
  });

  it('rejects deletion for non-admin users before touching the database', async () => {
    await expect(service.delete(
      'result-1',
      { confirmed: true, reason: 'Ошибка ввода' },
      { user: { sub: 'judge-1', role: 'PARTICIPANT' } } as any,
    )).rejects.toThrow('Удаление результатов доступно только ADMIN');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires explicit confirmation and a reason', async () => {
    await expect(service.delete(
      'result-1',
      { confirmed: false, reason: 'Ошибка ввода' },
      adminRequest,
    )).rejects.toThrow('Необходимо подтвердить удаление результата');
    await expect(service.delete(
      'result-1',
      { confirmed: true, reason: '   ' },
      adminRequest,
    )).rejects.toThrow('Укажите причину удаления результата');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('audits deletion, preserves record history, and recalculates records and rankings', async () => {
    const tx: any = {
      result: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'result-1',
          registrationId: 'registration-1',
          registrationClassId: 'registration-class-1',
          value: { toString: () => '152.500' },
          unit: 'DB',
          place: 1,
          notes: 'test',
          isHistorical: false,
          registration: { id: 'registration-1', stageId: 'stage-1', participantId: 'participant-1' },
          registrationClass: { classId: 'class-1', class: { name: 'Limited 2.0' } },
        }),
        delete: jest.fn().mockResolvedValue({ id: 'result-1' }),
      },
      record: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    const response = await service.delete(
      'result-1',
      { confirmed: true, reason: 'Дублирующий результат' },
      adminRequest,
    );

    expect(tx.record.updateMany).toHaveBeenCalledWith({
      where: { resultId: 'result-1' },
      data: { resultId: null, isCurrent: false, isManualOverride: false },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'RESULT_DELETED',
        entityId: 'result-1',
        metadata: expect.objectContaining({ reason: 'Дублирующий результат', value: '152.500' }),
      }),
    }));
    expect(tx.result.delete).toHaveBeenCalledWith({ where: { id: 'result-1' } });
    expect(records.recalculateCurrentRecord).toHaveBeenCalledWith('class-1');
    expect(ranking.recalculateByStageClass).toHaveBeenCalledWith('stage-1', 'class-1');
    expect(response).toEqual({ success: true, deletedResultId: 'result-1', postProcessingWarnings: [] });
  });

  it('does not allow regular deletion of historical results', async () => {
    const tx: any = {
      result: {
        findUnique: jest.fn().mockResolvedValue({ id: 'result-1', isHistorical: true }),
        delete: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));

    await expect(service.delete(
      'result-1',
      { confirmed: true, reason: 'Нужно удалить' },
      adminRequest,
    )).rejects.toThrow('Исторический результат удаляется через специальный административный workflow');
    expect(tx.result.delete).not.toHaveBeenCalled();
  });
});
