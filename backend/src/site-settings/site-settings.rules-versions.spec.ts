import { jest } from '@jest/globals';
import { SiteSettingsService } from './site-settings.service';

describe('SiteSettingsService published rules immutability', () => {
  const prisma: any = {
    siteSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const oldPublished = {
    id: 'rules-v1',
    fileName: 'usd-rules-v1.docx',
    url: '/media/rules-v1.docx',
    publishedAt: '2026-09-01T10:00:00.000Z',
    blocks: [{ id: 'intro', type: 'paragraph', text: 'Original approved wording' }],
  };
  let service: SiteSettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SiteSettingsService(prisma);
    prisma.siteSettings.findUnique.mockResolvedValue({
      id: 'default',
      registration: { enabled: true, rulesDocument: { published: oldPublished, publishedVersions: [], drafts: [] } },
    });
    prisma.siteSettings.upsert.mockImplementation(async (args: any) => ({ id: 'default', ...args.update }));
    prisma.auditLog.create.mockResolvedValue({});
  });

  it('does not overwrite a published revision when the same id is submitted with changed content', async () => {
    await service.update({
      registration: {
        rulesDocument: {
          published: { ...oldPublished, blocks: [{ id: 'intro', type: 'paragraph', text: 'tampered wording' }] },
          publishedVersions: [],
          drafts: [],
        },
      },
    } as any, 'admin-1');

    const saved = prisma.siteSettings.upsert.mock.calls[0][0].update.registration.rulesDocument;
    expect(saved.published.blocks[0].text).toBe('Original approved wording');
    expect(saved.published.id).toBe('rules-v1');
  });

  it('archives the previous revision when a new version is published', async () => {
    const nextPublished = {
      id: 'rules-v2',
      fileName: 'usd-rules-v2.docx',
      url: '/media/rules-v2.docx',
      publishedAt: '2026-10-14T10:00:00.000Z',
      blocks: [{ id: 'intro', type: 'paragraph', text: 'New approved wording' }],
    };
    await service.update({
      registration: {
        rulesDocument: { published: nextPublished, publishedVersions: [], drafts: [] },
      },
    } as any, 'admin-1');

    const saved = prisma.siteSettings.upsert.mock.calls[0][0].update.registration.rulesDocument;
    expect(saved.published.id).toBe('rules-v2');
    expect(saved.publishedVersions).toContainEqual(oldPublished);
  });

  it('keeps the active published revision when only draft structure changes', async () => {
    await service.update({
      registration: {
        rulesDocument: {
          drafts: [{ id: 'draft-1', blocks: [{ id: 'new', type: 'heading', text: 'Draft only' }] }],
        },
      },
    } as any, 'admin-1');

    const saved = prisma.siteSettings.upsert.mock.calls[0][0].update.registration.rulesDocument;
    expect(saved.published).toEqual(oldPublished);
    expect(saved.drafts).toHaveLength(1);
  });
});
