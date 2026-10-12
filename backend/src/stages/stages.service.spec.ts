import { jest } from '@jest/globals';
import { StagesService } from './stages.service';

describe('StagesService public visibility', () => {
  const prisma: any = {
    stage: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const audit: any = {};
  const siteSettings: any = { getPublishedRulesSnapshot: async () => null };
  let service: StagesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StagesService(prisma, audit, siteSettings);
  });

  it('lists only non-deleted published and completed stages publicly', async () => {
    prisma.stage.findMany.mockResolvedValue([]);

    await service.findPublished();

    expect(prisma.stage.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        isDeleted: false,
        status: { in: ['PUBLISHED', 'COMPLETED'] },
      },
      orderBy: [{ date: 'desc' }, { stageNumber: 'asc' }],
      include: { season: true },
    }));
  });

  it('does not return unpublished or deleted stages by public ID', async () => {
    prisma.stage.findFirst.mockResolvedValue(null);

    await expect(service.findPublishedOne('private-stage')).rejects.toThrow(
      'Этап не найден или не опубликован',
    );

    expect(prisma.stage.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: 'private-stage',
        isDeleted: false,
        status: { in: ['PUBLISHED', 'COMPLETED'] },
      },
    }));
  });
});
