import { jest } from '@jest/globals';
import { EmailNotificationsService } from './email-notifications.service';

describe('EmailNotificationsService', () => {
  const prisma: any = {
    stage: { findFirst: jest.fn(), findMany: jest.fn() },
    siteSettings: { findUnique: jest.fn() },
    user: { findMany: jest.fn(), findFirst: jest.fn() },
    registration: { findMany: jest.fn() },
    emailNotificationLog: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const mail: any = { sendNotificationEmail: jest.fn() };
  let service: EmailNotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.siteSettings.findUnique.mockResolvedValue({ branding: { logoUrl: '/media/public-file/SITE_ASSET/branding-logoUrl' }, registration: { price: 2000, additionalClassPrice: 2000 } });
    service = new EmailNotificationsService(prisma, mail);
    prisma.emailNotificationLog.findUnique.mockResolvedValue(null);
    prisma.emailNotificationLog.create.mockResolvedValue({
      id: 'log-1', status: 'PENDING', attempts: 0, updatedAt: new Date(),
    });
    prisma.emailNotificationLog.updateMany.mockResolvedValue({ count: 1 });
    prisma.emailNotificationLog.update.mockResolvedValue({});
    mail.sendNotificationEmail.mockResolvedValue(undefined);
  });

  it('sends stage-opening news only through the explicit newsletter-consent audience', async () => {
    prisma.stage.findFirst.mockResolvedValue({
      id: 'stage-1', status: 'PUBLISHED', registrationOpen: true, isDeleted: false,
      name: 'Этап 1', stageNumber: 1, date: new Date('2026-11-10T10:00:00Z'),
      city: 'Тюмень', venue: 'Площадка', address: null, updatedAt: new Date('2026-10-14T10:00:00Z'),
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'opted-in@example.com' }]);

    await service.registrationOpened('stage-1');

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: {
        isActive: true,
        emailVerifiedAt: { not: null },
        newsletterConsentAt: { not: null },
        newsletterConsentRevokedAt: null,
      },
      select: { id: true, email: true },
    });
    expect(mail.sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(mail.sendNotificationEmail.mock.calls[0][0]).toMatchObject({
      to: 'opted-in@example.com',
      subject: expect.stringContaining('Этап 1'),
    });
    expect(String(mail.sendNotificationEmail.mock.calls[0][0].html)).toContain('border-bottom:4px solid #ed2638');
    expect(prisma.emailNotificationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'STAGE_REGISTRATION_OPEN', status: 'PENDING' }),
    }));
  });

  it('does not send or create logs for a stage that is not currently open', async () => {
    prisma.stage.findFirst.mockResolvedValue(null);
    await service.registrationOpened('stage-closed');
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(prisma.emailNotificationLog.create).not.toHaveBeenCalled();
    expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('does not resend an event already accepted by the provider', async () => {
    prisma.stage.findFirst.mockResolvedValue({
      id: 'stage-1', status: 'PUBLISHED', registrationOpen: true, isDeleted: false,
      name: 'Этап 1', stageNumber: 1, date: new Date('2026-11-10T10:00:00Z'),
      updatedAt: new Date('2026-10-14T10:00:00Z'),
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'opted-in@example.com' }]);
    prisma.emailNotificationLog.findUnique.mockResolvedValue({ id: 'log-sent', status: 'PROVIDER_ACCEPTED', attempts: 1, updatedAt: new Date() });

    await service.registrationOpened('stage-1');

    expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
    expect(prisma.emailNotificationLog.create).not.toHaveBeenCalled();
  });

  it('sends a registration confirmation only to the verified account linked to the participant', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', email: 'driver@example.com', emailVerifiedAt: null });
    const registration = {
      id: 'reg-1', participantId: 'participant-1', participantNumber: 17,
      stageId: 'stage-1', stage: { id: 'stage-1', name: 'Этап 1', stageNumber: 4, date: new Date('2026-11-10T10:00:00Z'), city: 'Тюмень', venue: 'Площадка', address: 'ул. Примерная, 1' },
      car: { brand: 'Lada', model: '<script>', registrationNumber: 'А123АА72' },
      classes: [{ class: { name: 'Limited 2.0' } }],
    };

    await service.registrationConfirmed(registration);

    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { participantId: 'participant-1', isActive: true },
    }));
    expect(mail.sendNotificationEmail).toHaveBeenCalledTimes(1);
    const message = mail.sendNotificationEmail.mock.calls[0][0];
    expect(message.to).toBe('driver@example.com');
    expect(message.text).toContain('Номер участника: 17');
    expect(message.text).toContain('Limited 2.0');
    expect(message.text).toContain('Оплата участия: 2 000 ₽ на месте');
    expect(message.text).toContain('Государственный номер автомобиля: А123АА72');
    expect(message.html).toContain('branding-logoUrl');
    expect(message.html).toContain('&lt;script&gt;');
    expect(message.html).not.toContain('<li style="margin:0 0 8px"><script>');
  });

  it('records provider failures without claiming delivery', async () => {
    prisma.stage.findFirst.mockResolvedValue({
      id: 'stage-1', status: 'PUBLISHED', registrationOpen: true, isDeleted: false,
      name: 'Этап 1', stageNumber: 1, date: new Date('2026-11-10T10:00:00Z'),
      updatedAt: new Date('2026-10-14T10:00:00Z'),
    });
    prisma.user.findMany.mockResolvedValue([{ id: 'user-1', email: 'opted-in@example.com' }]);
    mail.sendNotificationEmail.mockRejectedValue(new Error('provider down'));

    await service.registrationOpened('stage-1');

    expect(prisma.emailNotificationLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', attempts: { increment: 1 }, lastError: 'Error' }),
    }));
    expect(prisma.emailNotificationLog.update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ deliveryConfirmed: true }),
    }));
  });
});
