import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

describe('AuthService explicit consents', () => {
  const prisma: any = {
    user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    siteSettings: { findUnique: jest.fn() },
    emailVerificationToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const jwt: any = {};
  const mail: any = { sendVerificationEmail: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AuthService(prisma, jwt, mail);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.siteSettings.findUnique.mockResolvedValue({ legal: { legalApproved: true, legalVersion: '1', ipName: 'USD', operatorAddress: 'Test address', personalDataEmail: 'privacy@example.com', privacyText: 'policy', consentText: 'consent', termsText: 'terms' }, contacts: { email: 'legal@example.com' }, footer: {} });
    prisma.user.create.mockResolvedValue({ id: 'user-1', email: 'driver@example.com' });
    prisma.emailVerificationToken.create.mockResolvedValue({});
    mail.sendVerificationEmail.mockResolvedValue(undefined);
  });

  it('rejects registration without explicit privacy consent before writing account data', async () => {
    await expect(service.register('driver@example.com', 'strong-password-123', false, true, false))
      .rejects.toThrow('Необходимо подтвердить согласие на обработку персональных данных');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('rejects registration without explicit terms acceptance', async () => {
    await expect(service.register('driver@example.com', 'strong-password-123', true, false, false))
      .rejects.toThrow('Необходимо принять пользовательское соглашение');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('stores required consent but leaves newsletter opt-in absent unless selected', async () => {
    await service.register('driver@example.com', 'strong-password-123', true, true, false);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.privacyConsentAt).toBeInstanceOf(Date);
    expect(data.privacyConsentVersion).toBe('privacy-v1');
    expect(data.termsAcceptedAt).toBeInstanceOf(Date);
    expect(data.termsVersion).toBe('terms-v1');
    expect(data).not.toHaveProperty('newsletterConsentAt');
    expect(data).not.toHaveProperty('newsletterConsentVersion');
  });

  it('records newsletter consent only when the user explicitly opts in', async () => {
    await service.register('driver@example.com', 'strong-password-123', true, true, true);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.newsletterConsentAt).toBeInstanceOf(Date);
    expect(data.newsletterConsentVersion).toBe('newsletter-v1');
    expect(data.newsletterConsentSource).toBe('signup-form');
  });

  it('blocks account creation until the organizer has approved current legal documents', async () => {
    prisma.siteSettings.findUnique.mockResolvedValue({ legal: { legalApproved: false }, contacts: {}, footer: {} });
    await expect(service.register('driver@example.com', 'strong-password-123', true, true, false))
      .rejects.toThrow('Регистрация временно недоступна: организатор USD ещё не утвердил юридические документы');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('stores the approved legal version and audits renewed consent', async () => {
    const result = await service.updateLegalConsent('user-1', true, true);
    expect(result).toMatchObject({ success: true, legalReady: true, version: '1', privacyAccepted: true, termsAccepted: true });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ privacyConsentVersion: 'privacy-v1', termsVersion: 'terms-v1' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'LEGAL_CONSENT_UPDATED' }),
    }));
  });

  it('stores the source of newsletter opt-in and revocation', async () => {
    await service.register('driver@example.com', 'strong-password-123', true, true, true);
    const data = prisma.user.create.mock.calls[0][0].data;
    expect(data.newsletterConsentSource).toBe('signup-form');

    prisma.user.update.mockResolvedValue({
      newsletterConsentAt: new Date('2026-10-01T00:00:00Z'),
      newsletterConsentVersion: 'newsletter-v1',
      newsletterConsentRevokedAt: new Date('2026-10-14T00:00:00Z'),
      newsletterConsentSource: 'signup-form',
      newsletterConsentRevokedSource: 'account-settings',
    });
    await service.updateNewsletterConsent('user-1', false);
    expect(prisma.user.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ newsletterConsentRevokedSource: 'account-settings' }),
    }));
  });

  it('audits newsletter revocation and excludes the user from the active audience', async () => {
    prisma.user.update.mockResolvedValue({
      newsletterConsentAt: new Date('2026-10-01T00:00:00Z'),
      newsletterConsentVersion: 'newsletter-v1',
      newsletterConsentRevokedAt: new Date('2026-10-14T00:00:00Z'),
    });
    const result = await service.updateNewsletterConsent('user-1', false);
    expect(result).toMatchObject({ success: true, consent: false });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ newsletterConsentRevokedAt: expect.any(Date), newsletterConsentRevokedSource: 'account-settings' }),
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'NEWSLETTER_CONSENT_REVOKED' }),
    }));
  });
});
