import { jest } from '@jest/globals';
import { ResultsRankingService } from './results-ranking.service';

describe('ResultsRankingService', () => {
  it('does not clear places from unverified historical results during recalculation', async () => {
    const tx: any = {
      stageClass: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'stage-class-1',
          class: { id: 'class-1', name: 'Limited 2.0' },
        }),
      },
      stage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'stage-1',
          seasonId: 'season-1',
        }),
      },
      disqualification: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      registrationClass: {
        findMany: jest.fn().mockResolvedValue([{ id: 'registration-class-1' }]),
      },
      result: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn(),
      },
    };
    const prisma: any = {
      $transaction: jest.fn().mockImplementation(async (callback: any) => callback(tx)),
    };
    const service = new ResultsRankingService(prisma);

    await service.recalculateByStageClass('stage-1', 'class-1');

    expect(tx.result.updateMany).toHaveBeenCalledWith({
      where: {
        registrationClassId: { in: ['registration-class-1'] },
        OR: [
          { isHistorical: false },
          { isHistorical: true, verificationStatus: 'VERIFIED' },
        ],
      },
      data: { place: null },
    });
  });
});
