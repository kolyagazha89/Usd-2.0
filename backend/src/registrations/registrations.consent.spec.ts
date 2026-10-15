import { jest } from '@jest/globals';
import { RegistrationsService } from './registrations.service';

describe('RegistrationsService rules consent', () => {
  const prisma: any = { $transaction: jest.fn(), siteSettings: { findUnique: jest.fn() }, user: { findUnique: jest.fn() } };
  const request: any = { user: { id: 'user-1', sub: 'user-1', role: 'PARTICIPANT', participantId: 'participant-1' } };
  const body = {
    stageId: 'stage-1',
    participantId: 'participant-1',
    carId: 'car-1',
    classIds: ['class-1'],
    configurationVersionId: 'configuration-version-1',
    rulesAccepted: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.siteSettings.findUnique.mockResolvedValue({ legal: { legalApproved: true, legalVersion: '1', ipName: 'USD', privacyText: 'policy', consentText: 'consent', termsText: 'terms' }, contacts: { email: 'legal@example.com' }, footer: {} });
    prisma.user.findUnique.mockResolvedValue({ privacyConsentAt: null, privacyConsentVersion: null, termsAcceptedAt: null, termsVersion: null });
  });

  it('requires explicit legal and rules attestations for judge-created registration', async () => {
    const service = new RegistrationsService(prisma);
    await expect(service.create({ user: { sub: 'judge-1', role: 'PARTICIPANT', customRoleId: 'judge-role' } } as any, {
      ...body, source: 'ON_SITE', rulesAccepted: false, privacyConsent: false, termsAccepted: false,
    })).rejects.toThrow('Для регистрации участника подтвердите согласие на обработку данных');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires legal and rules attestations for judge-created pre-registrations too', async () => {
    const service = new RegistrationsService(prisma);
    await expect(service.create({ user: { sub: 'judge-1', role: 'PARTICIPANT', customRoleId: 'judge-role' } } as any, {
      ...body, source: 'PRE_REGISTRATION', rulesAccepted: true, privacyConsent: false, termsAccepted: false,
    })).rejects.toThrow('Для регистрации участника подтвердите согласие на обработку данных');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects participant registration when current legal consent versions are missing', async () => {
    const service = new RegistrationsService(prisma);
    await expect(service.create(request, { ...body, rulesAccepted: true }))
      .rejects.toThrow('Перед регистрацией примите актуальные юридические документы в форме регистрации');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects participant registration unless the rules checkbox was explicitly accepted', async () => {
    const service = new RegistrationsService(prisma);
    await expect(service.create(request, body)).rejects.toThrow('Подтвердите ознакомление с регламентом выбранного этапа');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
