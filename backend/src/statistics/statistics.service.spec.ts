import { StatisticsService } from './statistics.service';

describe('StatisticsService dashboard stage selection', () => {
  it('shows the nearest upcoming stage when no stage is scheduled for today', async () => {
    const nearestStage = {
      id: 'nearest-stage',
      stageNumber: 4,
      name: 'Следующий этап',
      city: 'Тюмень',
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      registrationOpen: false,
      status: 'PUBLISHED',
      season: { id: 'season-1', name: 'Сезон', year: 2026 },
    };
    const prisma: any = {
      stage: {
        findFirst: jest.fn().mockResolvedValue(nearestStage),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      registration: { findMany: jest.fn().mockResolvedValue([]) },
      participantStageInspection: { count: jest.fn().mockResolvedValue(0) },
      result: { count: jest.fn().mockResolvedValue(0) },
      disqualification: { count: jest.fn().mockResolvedValue(0) },
      importJob: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new StatisticsService(prisma);
    jest.spyOn(service, 'getOverview').mockResolvedValue({
      stats: {
        participants: 0,
        cars: 0,
        seasons: 0,
        stages: 0,
        activeRegistrations: 0,
        appearances: 0,
        currentRecords: 0,
      },
      topParticipants: [],
    } as any);

    const dashboard = await service.getDashboard();

    expect(dashboard.currentStage).toEqual(nearestStage);
    const stageQuery = prisma.stage.findFirst.mock.calls[0][0];
    expect(stageQuery.where.date.gte).toBeInstanceOf(Date);
    expect(stageQuery.where.date).not.toHaveProperty('lt');
  });
});
