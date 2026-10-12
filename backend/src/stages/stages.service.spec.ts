import { jest } from '@jest/globals';
import { StagesService } from './stages.service';

describe('StagesService public visibility', () => {
  const prisma: any = {
    stage: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit: any = {};
  const snapshot = { revisionId: 'rules-v1', fileName: 'USD Rules.docx', url: 'https://usd-russia.ru/rules.docx', publishedAt: '2026-10-13T10:00:00.000Z', capturedAt: '2026-10-13T10:01:00.000Z', blocks: [{ type: 'heading', level: 1, text: 'Rules' }] };
  const siteSettings: any = { getPublishedRulesSnapshot: () => Promise.resolve(snapshot) };
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

  it('captures the active regulation once when a draft stage is published', async () => {
    prisma.stage.findFirst.mockResolvedValue({
      id: 'stage-1', seasonId: 'season-1', stageNumber: 1, status: 'DRAFT',
      rulesSnapshot: null, registrationStartsAt: null, registrationEndsAt: null,
    });
    prisma.season.findUnique.mockResolvedValue({ id: 'season-1', status: 'ACTIVE' });
    prisma.stage.update.mockResolvedValue({ id: 'stage-1', status: 'PUBLISHED', rulesSnapshot: snapshot });
    prisma.auditLog = { create: jest.fn() };
    const auditService: any = { log: jest.fn() };
    service = new StagesService(prisma, auditService, siteSettings);

    await service.update('stage-1', { status: 'PUBLISHED' } as any, {
      user: { sub: 'admin-1', role: 'ADMIN' }, ip: '127.0.0.1',
    } as any);

    expect(prisma.stage.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'stage-1' },
      data: expect.objectContaining({ status: 'PUBLISHED', rulesSnapshot: snapshot }),
    }));
  });

  it('does not replace an existing stage regulation snapshot on later edits', async () => {
    const original = { revisionId: 'rules-old', fileName: 'Old rules.docx', blocks: [{ type: 'paragraph', text: 'Old rule' }] };
    prisma.stage.findFirst.mockResolvedValue({
      id: 'stage-1', seasonId: 'season-1', stageNumber: 1, status: 'DRAFT',
      rulesSnapshot: original, registrationStartsAt: null, registrationEndsAt: null,
    });
    prisma.season.findUnique.mockResolvedValue({ id: 'season-1', status: 'ACTIVE' });
    prisma.stage.update.mockResolvedValue({ id: 'stage-1', status: 'PUBLISHED', rulesSnapshot: original });
    const auditService: any = { log: jest.fn() };
    service = new StagesService(prisma, auditService, siteSettings);

    await service.update('stage-1', { status: 'PUBLISHED' } as any, {
      user: { sub: 'admin-1', role: 'ADMIN' }, ip: '127.0.0.1',
    } as any);

    expect(prisma.stage.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.not.objectContaining({ rulesSnapshot: expect.anything() }),
    }));
  });

});
