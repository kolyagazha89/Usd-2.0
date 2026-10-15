import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service';

describe('SiteSettingsService legal approval gate', () => {
  const prisma: any = {
    siteSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const legal = {
    ipName: 'Организатор USD',
    inn: '0000000000',
    ogrnip: '000000000000000',
    operatorAddress: 'г. Тюмень, тестовый адрес',
    personalDataEmail: 'legal@example.com',
    copyrightHolder: 'USD',
    privacyUrl: '/privacy',
    consentUrl: '/consent',
    termsUrl: '/terms',
    rulesUrl: '/rules',
    privacyText: 'Утверждённая политика.',
    consentText: 'Утверждённое согласие.',
    termsText: 'Утверждённое соглашение.',
    legalApproved: false,
    legalVersion: '0',
  };
  let service: SiteSettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SiteSettingsService(prisma);
    prisma.siteSettings.findUnique.mockResolvedValue({
      id: 'default', legal, contacts: { email: 'legal@example.com' }, footer: {}, registration: {},
    });
    prisma.siteSettings.upsert.mockImplementation(async (args: any) => ({ id: 'default', ...args.update }));
    prisma.auditLog.create.mockResolvedValue({});
  });

  it('does not publish document text before explicit organizer approval', async () => {
    const result = await service.getPublic();
    expect(result.settings.legal.legalApproved).toBe(false);
    expect(result.settings.legal.privacyText).toBe('');
    expect(result.settings.legal.consentText).toBe('');
    expect(result.settings.legal.termsText).toBe('');
  });

  it('requires operator details, all required documents and a contact before approval', async () => {
    prisma.siteSettings.findUnique.mockResolvedValue({ id: 'default', legal: {}, contacts: {}, footer: {}, registration: {} });
    await expect(service.update({ legal: { legalApproved: true } as any }, 'admin-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  });

  it('records an approval version and actor after document content was saved', async () => {
    await service.update({ legal: { ...legal, legalApproved: true } as any }, 'admin-1');
    const saved = prisma.siteSettings.upsert.mock.calls[0][0].update.legal;
    expect(saved).toMatchObject({
      legalApproved: true,
      legalApprovedBy: 'admin-1',
      legalVersion: '1',
    });
    expect(saved.legalApprovedAt).toEqual(expect.any(String));
  });

  it('revokes approval automatically when any legal document content changes', async () => {
    prisma.siteSettings.findUnique.mockResolvedValue({
      id: 'default',
      legal: { ...legal, legalApproved: true, legalVersion: '2', legalApprovedAt: '2026-10-14T10:00:00.000Z', legalApprovedBy: 'admin-1' },
      contacts: { email: 'legal@example.com' }, footer: {}, registration: {},
    });
    await service.update({ legal: { ...legal, privacyText: 'Новый текст', legalApproved: true } as any }, 'admin-1');
    const saved = prisma.siteSettings.upsert.mock.calls[0][0].update.legal;
    expect(saved.legalApproved).toBe(false);
    expect(saved.legalApprovedAt).toBeNull();
    expect(saved.legalApprovedBy).toBeNull();
  });
});
