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
    expect(response.settings.partners).toEqual([{ id: 'active', name: 'Активный', isActive: true }]);
    expect(response.settings.registration).toMatchObject({
      rulesText: 'Официальные правила',
      price: 2000,
    });
  });
  it('exposes attached legal DOCX files only after organizer approval', async () => {
    const document = { targetId: 'legal-document-privacyPolicy-test', fileName: 'privacy.docx', url: 'https://api.example.test/media/public-file/SITE_ASSET/legal-document-privacyPolicy-test' };
    const prisma = {
      siteSettings: { findUnique: jest.fn().mockResolvedValue({ legal: { legalApproved: true, legalVersion: '2', documents: { privacyPolicy: document } } }) },
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

});
