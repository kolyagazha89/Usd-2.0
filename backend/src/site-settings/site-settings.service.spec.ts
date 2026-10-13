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
        }),
      },
    } as unknown as PrismaService;

    const service = new SiteSettingsService(prisma);
    const response = await service.getPublic();

    expect(response.settings.legal).toEqual({
      ipName: 'USD Russia',
      inn: '1234567890',
      ogrnip: '',
      copyrightHolder: '',
      privacyUrl: '',
      consentUrl: '',
      termsUrl: '',
      rulesUrl: 'https://example.test/rules',
      privacyText: '',
      consentText: '',
      termsText: '',
    });
    expect(response.settings.legal).not.toHaveProperty('internalNote');
    expect(response.settings.registration).toMatchObject({
      rulesText: 'Официальные правила',
      price: 2000,
    });
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
});
