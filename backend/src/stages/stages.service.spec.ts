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
  const siteSettings: any = { getPublishedRulesSnapshot: jest.fn().mockResolvedValue({ revisionId: 'rules-1', blocks: [{ type: 'paragraph', text: 'Rule' }] }) };
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

describe('StagesService rules snapshots', () => {
  const prisma: any = {
    result: { count: jest.fn() },
    stage: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    season: { findUnique: jest.fn() },
  };
  const audit: any = { log: jest.fn() };
  const siteSettings: any = { getPublishedRulesSnapshot: jest.fn() };
  const emailNotifications: any = { registrationOpened: jest.fn().mockResolvedValue(undefined), stageChanged: jest.fn().mockResolvedValue(undefined) };
  const request: any = { user: { sub: 'admin-1', role: 'ADMIN' }, ip: '127.0.0.1' };
  let service: StagesService;

  beforeEach(() => {
    jest.clearAllMocks();
    siteSettings.getPublishedRulesSnapshot.mockResolvedValue({ revisionId: 'rules-v1', blocks: [{ type: 'paragraph', text: 'Rule v1' }] });
    service = new StagesService(prisma, audit, siteSettings, emailNotifications);
  });

  it('triggers stage-opening notifications only on a closed-to-open transition', async () => {
    const stage = {
      id: 'stage-1', seasonId: 'season-1', status: 'PUBLISHED',
      rulesSnapshot: { revisionId: 'rules-v1' }, registrationOpen: false,
      registrationStartsAt: null, registrationEndsAt: null, stageNumber: 1,
      updatedAt: new Date('2026-10-14T10:00:00Z'),
    };
    prisma.stage.findFirst.mockResolvedValue(stage);
    prisma.season.findUnique.mockResolvedValue({ id: 'season-1', status: 'ACTIVE' });
    prisma.stage.update.mockImplementation(async ({ data }: any) => ({ ...stage, ...data, updatedAt: new Date() }));

    await service.update('stage-1', { registrationOpen: true } as any, request);

    expect(emailNotifications.registrationOpened).toHaveBeenCalledTimes(1);
    expect(emailNotifications.registrationOpened).toHaveBeenCalledWith('stage-1');
  });

  it('refuses to open registration when no general regulation is published', async () => {
    const stage = {
      id: 'stage-1', seasonId: 'season-1', status: 'PUBLISHED',
      rulesSnapshot: null, registrationOpen: false,
      registrationStartsAt: null, registrationEndsAt: null, stageNumber: 1,
    };
    prisma.stage.findFirst.mockResolvedValue(stage);
    prisma.season.findUnique.mockResolvedValue({ id: 'season-1', status: 'ACTIVE' });
    siteSettings.getPublishedRulesSnapshot.mockResolvedValueOnce(null);

    await expect(service.update('stage-1', { registrationOpen: true } as any, request)).rejects.toThrow('сначала опубликуйте действующий общий регламент соревнований');
    expect(prisma.stage.update).not.toHaveBeenCalled();
  });

  it('does not resend stage-opening notifications when an already-open stage is edited', async () => {
    const stage = {
      id: 'stage-1', seasonId: 'season-1', status: 'PUBLISHED',
      rulesSnapshot: { revisionId: 'rules-v1' }, registrationOpen: true,
      registrationStartsAt: null, registrationEndsAt: null, stageNumber: 1,
      name: 'Old name',
    };
    prisma.stage.findFirst.mockResolvedValue(stage);
    prisma.season.findUnique.mockResolvedValue({ id: 'season-1', status: 'ACTIVE' });
    prisma.stage.update.mockImplementation(async ({ data }: any) => ({ ...stage, ...data, updatedAt: new Date() }));

    await service.update('stage-1', { name: 'New name' } as any, request);

    expect(emailNotifications.registrationOpened).not.toHaveBeenCalled();
  });

  it('requires confirmation and audits results publication', async () => {
    const stage = { id: 'stage-1', status: 'PUBLISHED', resultsPublishedAt: null };
    prisma.stage.findFirst.mockResolvedValue(stage);
    prisma.result.count.mockResolvedValue(1);
    prisma.stage.update.mockImplementation(async ({ data }: any) => ({ ...stage, ...data }));
    await expect(service.setResultsPublication('stage-1', true, false, request)).rejects.toThrow('Подтвердите изменение публикации результатов');
    expect(prisma.stage.update).not.toHaveBeenCalled();
    await service.setResultsPublication('stage-1', true, true, request);
    expect(prisma.stage.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'stage-1' }, data: expect.objectContaining({ resultsPublishedAt: expect.any(Date) }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAGE_RESULTS_PUBLISHED', entityId: 'stage-1' }));
  });

  it('notifies participants once when the direct remove action cancels an active stage', async () => {
    const stage = {
      id: 'stage-1', seasonId: 'season-1', status: 'PUBLISHED', registrationOpen: true,
      isDeleted: false, name: 'Этап 1', date: new Date('2026-11-10T10:00:00Z'),
    };
    const updated = { ...stage, status: 'CANCELLED', registrationOpen: false };
    prisma.stage.findFirst.mockResolvedValue(stage);
    prisma.stage.update.mockResolvedValue(updated);

    await service.remove('stage-1', request);
    expect(emailNotifications.stageChanged).toHaveBeenCalledWith(stage, updated);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'STAGE_CANCELLED', entityId: 'stage-1' }));
  });

  it('does not send duplicate cancellation notices for an already cancelled stage', async () => {
    const stage = { id: 'stage-1', status: 'CANCELLED', isDeleted: false, registrationOpen: false };
    prisma.stage.findFirst.mockResolvedValue(stage);
    prisma.stage.update.mockResolvedValue(stage);

    await service.remove('stage-1', request);
    expect(emailNotifications.stageChanged).not.toHaveBeenCalled();
  });

  it('captures published rules when a stage is created as published', async () => {
    const season = { id: 'season-1', year: 2026, status: 'ACTIVE' };
    const snapshot = { revisionId: 'rules-v1', fileName: 'rules.docx', blocks: [{ type: 'paragraph', text: 'Rule v1' }] };
    prisma.season.findUnique.mockResolvedValue(season);
    prisma.stage.findUnique.mockResolvedValue(null);
    siteSettings.getPublishedRulesSnapshot.mockResolvedValue(snapshot);
    prisma.stage.create.mockImplementation(async ({ data }: any) => ({ id: 'stage-1', ...data, season }));

    await service.create({ seasonId: 'season-1', stageNumber: 1, name: 'Stage 1', date: '2026-07-01', status: 'PUBLISHED' } as any, request);

    expect(prisma.stage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ rulesSnapshot: snapshot }) }));
  });

  it('does not overwrite an existing snapshot when an already published stage is edited', async () => {
    const existing = { id: 'stage-1', seasonId: 'season-1', status: 'PUBLISHED', rulesSnapshot: { revisionId: 'rules-v1' }, registrationOpen: false, registrationStartsAt: null, registrationEndsAt: null, stageNumber: 1 };
    prisma.stage.findFirst.mockResolvedValue(existing);
    prisma.season.findUnique.mockResolvedValue({ id: 'season-1', status: 'ACTIVE' });
    prisma.stage.update.mockImplementation(async ({ data }: any) => ({ ...existing, ...data }));
    siteSettings.getPublishedRulesSnapshot.mockResolvedValue({ revisionId: 'rules-v2' });

    await service.update('stage-1', { name: 'Renamed' } as any, request);

    expect(prisma.stage.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ rulesSnapshot: expect.anything() }) }));
    expect(siteSettings.getPublishedRulesSnapshot).not.toHaveBeenCalled();
  });
});
