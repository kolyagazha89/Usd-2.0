import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { PrismaService } from '../prisma/prisma.service';
import { SiteSettingsService } from './site-settings.service';

describe('SiteSettingsService.getPublic', () => {
  it('exposes only the allowlisted public legal fields', async () => {
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue({
          legal: {
            ipName: 'USD Russia',
            inn: '1234567890',
            rulesUrl: 'https://example.test/rules',
            internalNote: 'must not be exposed',
          },
          registration: {
            rulesText: 'Официальные правила',
            price: 2000,
          },
          news: [
            { id: 'draft', title: 'Черновик', isPublished: false },
            { id: 'public', title: 'Опубликовано', isPublished: true },
          ],
          partners: [
            { id: 'hidden', name: 'Скрытый', isActive: false },
            { id: 'active', name: 'Активный', isActive: true },
            { id: 'draft', name: 'Неопубликованный', isActive: true, isPublished: false },
            { id: 'published', name: 'Опубликованный', isActive: true, isPublished: true },
          ],
        }),
      },
    } as unknown as PrismaService;

    const service = new SiteSettingsService(prisma);
    const response = await service.getPublic();

    expect(response.settings.legal).toEqual({
      legalApproved: false,
      legalVersion: null,
      legalApprovedAt: null,
      ipName: 'USD Russia',
      inn: '1234567890',
      ogrnip: '',
      operatorAddress: '',
      personalDataEmail: '',
      copyrightHolder: '',
      privacyUrl: '',
      consentUrl: '',
      termsUrl: '',
      rulesUrl: 'https://example.test/rules',
      privacyText: '',
      consentText: '',
      termsText: '',
      documents: {},
    });
    expect(response.settings.legal).not.toHaveProperty('internalNote');
    expect(response.settings.news).toEqual([{ id: 'public', title: 'Опубликовано', isPublished: true }]);
    expect(response.settings.partners).toEqual([
      { id: 'active', name: 'Активный', isActive: true },
      { id: 'published', name: 'Опубликованный', isActive: true, isPublished: true },
    ]);
    expect(response.settings.registration).toMatchObject({
      rulesText: 'Официальные правила',
      price: 2000,
    });
  });
  it('exposes attached legal DOCX files only after organizer approval', async () => {
    const document = { targetId: 'legal-document-privacyPolicy-test', fileName: 'privacy.docx', url: 'https://api.example.test/media/public-file/SITE_ASSET/legal-document-privacyPolicy-test' };
    const prisma = {
      siteSettings: { findUnique: jest.fn().mockResolvedValue({ legal: { legalApproved: true, legalVersion: '2', ipName: 'Организатор USD', operatorAddress: 'г. Тюмень, тестовый адрес', personalDataEmail: 'legal@example.com', privacyText: 'Политика', consentText: 'Согласие', termsText: 'Соглашение', documents: { privacyPolicy: document } } }) },
    } as unknown as PrismaService;
    const response = await new SiteSettingsService(prisma).getPublic();
    expect(response.settings.legal.documents).toEqual({ privacyPolicy: document });
  });

});


describe('SiteSettingsService published regulation history', () => {
  it('does not allow rewriting an already published revision with the same ID', async () => {
    const oldRevision = { id: 'rules-v1', fileName: 'old.docx', blocks: [{ type: 'paragraph', text: 'Original rule' }] };
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue({ registration: { rulesDocument: { published: oldRevision, publishedVersions: [], drafts: [] } } }),
        upsert: jest.fn().mockImplementation(async (args: any) => ({ id: 'default', ...args.create })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new SiteSettingsService(prisma);

    await service.update({
      registration: { rulesDocument: { published: { ...oldRevision, blocks: [{ type: 'paragraph', text: 'Tampered rule' }] }, publishedVersions: [], drafts: [] } } as any,
    }, 'admin-1');

    const saved = (prisma as any).siteSettings.upsert.mock.calls[0][0].create.registration.rulesDocument;
    expect(saved.published.blocks[0].text).toBe('Original rule');
  });

  it('archives the previous published revision when a new revision becomes active', async () => {
    const oldRevision = { id: 'rules-v1', fileName: 'old.docx', blocks: [{ type: 'paragraph', text: 'Original rule' }] };
    const nextRevision = { id: 'rules-v2', fileName: 'new.docx', blocks: [{ type: 'paragraph', text: 'Updated rule' }] };
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue({ registration: { rulesDocument: { published: oldRevision, publishedVersions: [], drafts: [] } } }),
        upsert: jest.fn().mockImplementation(async (args: any) => ({ id: 'default', ...args.create })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new SiteSettingsService(prisma);

    await service.update({
      registration: { rulesDocument: { published: nextRevision, publishedVersions: [], drafts: [] } } as any,
    }, 'admin-1');

    const saved = (prisma as any).siteSettings.upsert.mock.calls[0][0].create.registration.rulesDocument;
    expect(saved.published.id).toBe('rules-v2');
    expect(saved.publishedVersions).toContainEqual(oldRevision);
  });

  it('rejects reusing an archived revision ID to publish altered content', async () => {
    const archivedRevision = { id: 'rules-v1', fileName: 'old.docx', blocks: [{ type: 'paragraph', text: 'Original rule' }] };
    const currentRevision = { id: 'rules-v2', fileName: 'current.docx', blocks: [{ type: 'paragraph', text: 'Current rule' }] };
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue({
          registration: { rulesDocument: { published: currentRevision, publishedVersions: [archivedRevision], drafts: [] } },
        }),
        upsert: jest.fn().mockImplementation(async (args: any) => ({ id: 'default', ...args.create })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new SiteSettingsService(prisma);

    await expect(service.update({
      registration: {
        rulesDocument: {
          published: { ...archivedRevision, blocks: [{ type: 'paragraph', text: 'Tampered archived rule' }] },
          publishedVersions: [archivedRevision],
          drafts: [],
        },
      } as any,
    }, 'admin-1')).rejects.toThrow(BadRequestException);
  });
  it('logs the failed persistence phase without logging settings values', async () => {
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockRejectedValue(Object.assign(new Error('sensitive payload should not be logged'), { code: 'P2002' })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new SiteSettingsService(prisma);
    const logSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

    await expect(service.update({ branding: { siteName: 'private test value' } } as any, 'admin-1')).rejects.toThrow();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('phase=upsert, error=Error, code=P2002'));
    expect(logSpy.mock.calls[0][0]).not.toContain('private test value');
    expect(logSpy.mock.calls[0][0]).not.toContain('sensitive payload');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('logs an unexpected settings read failure without exposing payload values', async () => {
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockRejectedValue(new Error('private read failure')),
        upsert: jest.fn(),
      },
      auditLog: { create: jest.fn() },
    } as unknown as PrismaService;
    const service = new SiteSettingsService(prisma);
    const logSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => undefined);

    await expect(service.update({ branding: { siteName: 'private test value' } } as any, 'admin-1')).rejects.toThrow();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('phase=read, error=Error'));
    expect(logSpy.mock.calls[0][0]).not.toContain('private test value');
    expect(logSpy.mock.calls[0][0]).not.toContain('private read failure');
    expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  });

  it('normalizes partial registration and full news settings to JSON before Prisma persistence', async () => {
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue({
          registration: { enabled: true, rulesDocument: { published: null, publishedVersions: [], drafts: [] } },
          news: [],
        }),
        upsert: jest.fn().mockImplementation(async (args: any) => ({ id: 'default', ...args.create })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new SiteSettingsService(prisma);

    await service.update({
      registration: { rulesDocument: { published: null, publishedVersions: [], drafts: [{ id: 'draft-1', blocks: [{ type: 'paragraph', text: 'Rules', optional: undefined }] }] } } as any,
    }, 'admin-1');
    const registrationData = (prisma as any).siteSettings.upsert.mock.calls[0][0].create.registration;
    expect(registrationData.rulesDocument.drafts[0].blocks[0]).not.toHaveProperty('optional');

    await service.update({
      branding: { siteName: 'USD' },
      homepage: {},
      stream: {},
      liveResults: {},
      navigation: {},
      contacts: {},
      social: {},
      seo: {},
      legal: {},
      footer: {},
      registration: { enabled: true },
      catalogs: {},
      partners: [],
      news: [{ id: 'news-1', title: 'News', body: 'Text', file: undefined }],
    } as any, 'admin-1');
    const newsData = (prisma as any).siteSettings.upsert.mock.calls[1][0].create.news;
    expect(newsData).toEqual([{ id: 'news-1', title: 'News', body: 'Text' }]);
  });

});

describe('SiteSettingsService default USD branding', () => {
  it('uses USD consistently in built-in branding and email templates', async () => {
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;

    const response = await new SiteSettingsService(prisma).getAdmin();
    const settings = response.settings;

    expect(settings.branding.siteName).toBe('USD');
    expect(settings.homepage.heroTitle).toBe('USD');

    const builtInTemplates = JSON.stringify(settings.registration.emailTemplates);
    expect(builtInTemplates).not.toContain('ЮСД');
    expect(builtInTemplates).not.toContain('юсд');
  });
});


describe('SiteSettingsService homepage hero CMS', () => {
  const makeService = () => {
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(async (args: any) => ({ id: 'default', ...args.create })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    return { service: new SiteSettingsService(prisma), prisma };
  };

  it('publishes edited hero scene labels and topics without requiring a schema migration', async () => {
    const { service, prisma } = makeService();
    const response = await service.update({ homepage: {
      heroStageLabel: 'USD WORLD',
      heroStageTagline: 'ГРОМЧЕ',
      heroPulseHint: 'Нажмите на эмблему',
      heroWatchLabel: 'О нас',
      heroPrimaryButtonLabel: 'Открыть этап',
      heroCalendarButtonLabel: 'Календарь',
      heroTopics: ['РЕКОРДЫ', 'СПОРТСМЕНЫ'],
    } } as any, 'admin-1');
    expect(response.settings.homepage.heroStageLabel).toBe('USD WORLD');
    expect(response.settings.homepage.heroTopics).toEqual(['РЕКОРДЫ', 'СПОРТСМЕНЫ']);
    expect((prisma as any).siteSettings.upsert).toHaveBeenCalledTimes(1);
    expect((prisma as any).auditLog.create).toHaveBeenCalledTimes(1);
    (prisma as any).siteSettings.findUnique.mockResolvedValueOnce({ homepage: response.settings.homepage });
    const publicSettings = await service.getPublic();
    expect(publicSettings.settings.homepage.heroTopics).toEqual(['РЕКОРДЫ', 'СПОРТСМЕНЫ']);
  });

  it('rejects malformed hero fields before writing any settings or audit log', async () => {
    const { service, prisma } = makeService();
    for (const homepage of [
      { heroTopics: 'not an array' },
      { heroTopics: Array(9).fill('USD') },
      { heroTopics: ['x'.repeat(41)] },
      { heroTopics: [123] },
      { heroStageLabel: 'x'.repeat(161) },
      { heroWatchLabel: 42 },
    ]) {
      await expect(service.update({ homepage } as any, 'admin-1')).rejects.toThrow(BadRequestException);
    }
    expect((prisma as any).siteSettings.upsert).not.toHaveBeenCalled();
    expect((prisma as any).auditLog.create).not.toHaveBeenCalled();
  });
});


describe('SiteSettingsService community teams CMS', () => {
  const makeService = () => {
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(async (args: any) => ({ id: 'default', ...args.create })),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    return { service: new SiteSettingsService(prisma), prisma };
  };

  it('keeps the teams block editable and visible on older saved homepage configurations', async () => {
    const { service, prisma } = makeService();
    (prisma as any).siteSettings.findUnique.mockResolvedValueOnce({
      homepage: { blocks: [{ id: 'hero', enabled: true }] },
    });
    const previous = await service.getAdmin();
    expect(previous.settings.homepage.blocks.find(block => block.id === 'teams')?.enabled).toBe(true);
    const updated = await service.update({ homepage: {
      teamsEmptyTitle: 'Создай свою команду',
      teamsEmptyDescription: 'Первые команды появятся здесь',
      blocks: previous.settings.homepage.blocks.map(block =>
        block.id === 'teams' ? { ...block, enabled: false } : block),
    } } as any, 'admin-1');
    expect(updated.settings.homepage.blocks.find(block => block.id === 'teams')?.enabled).toBe(false);
    (prisma as any).siteSettings.findUnique.mockResolvedValueOnce({ homepage: updated.settings.homepage });
    const publicSettings = await service.getPublic();
    expect(publicSettings.settings.homepage.teamsEmptyTitle).toBe('Создай свою команду');
    expect(publicSettings.settings.homepage.teamsEmptyDescription).toBe('Первые команды появятся здесь');
  });

  it('rejects oversized or non-text team copy without persisting', async () => {
    const { service, prisma } = makeService();
    for (const homepage of [
      { teamsEmptyTitle: 'x'.repeat(161) },
      { teamsEmptyDescription: ['unsafe'] },
    ]) {
      await expect(service.update({ homepage } as any, 'admin-1')).rejects.toThrow(BadRequestException);
    }
    expect((prisma as any).siteSettings.upsert).not.toHaveBeenCalled();
  });
});


describe('SiteSettingsService partner publication lifecycle', () => {
  it('keeps new drafts private, publishes them explicitly and hides inactive partners', async () => {
    let stored: any = null;
    const prisma = {
      siteSettings: {
        findUnique: jest.fn().mockImplementation(async () => stored),
        upsert: jest.fn().mockImplementation(async (args: any) => {
          stored = { id: 'default', ...(stored ? args.update : args.create) };
          return stored;
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    } as unknown as PrismaService;
    const service = new SiteSettingsService(prisma);
    const draft = { id: 'partner-1', name: 'Тестовый партнёр', tier: 'GENERAL', isActive: true, isPublished: false, sortOrder: 0 };

    await service.update({ partners: [draft] }, 'admin-1');
    expect((await service.getAdmin()).settings.partners).toEqual([draft]);
    expect((await service.getPublic()).settings.partners).toEqual([]);

    const published = { ...draft, isPublished: true };
    await service.update({ partners: [published] }, 'admin-1');
    expect((await service.getPublic()).settings.partners).toEqual([published]);

    await service.update({ partners: [{ ...published, isActive: false }] }, 'admin-1');
    expect((await service.getPublic()).settings.partners).toEqual([]);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(3);
  });
});
