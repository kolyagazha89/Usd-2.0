import { jest } from '@jest/globals';
import { EmailNotificationsService } from './email-notifications.service';

describe('EmailNotificationsService retry policy', () => {
  const prisma: any = {
    stage: { findFirst: jest.fn() },
    user: { findFirst: jest.fn() },
    emailNotificationLog: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  };
  const mail: any = { sendNotificationEmail: jest.fn() };
  let service: EmailNotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmailNotificationsService(prisma, mail);
    prisma.emailNotificationLog.findMany.mockResolvedValue([{
      id: 'log-1', eventKey: 'stage-registration-open:stage-1:2026-10-14T10:00:00.000Z:user-1',
      type: 'STAGE_REGISTRATION_OPEN', recipient: 'driver@example.com', stageId: 'stage-1',
      status: 'FAILED', attempts: 1, updatedAt: new Date(Date.now() - 20 * 60 * 1000),
    }]);
    prisma.stage.findFirst.mockResolvedValue({
      id: 'stage-1', status: 'PUBLISHED', registrationOpen: true, isDeleted: false,
      name: 'Этап 1', stageNumber: 1, date: new Date('2026-11-10T10:00:00Z'),
      city: 'Тюмень', venue: 'Площадка', address: null, updatedAt: new Date(),
    });
    prisma.user.findFirst.mockResolvedValue({ id: 'user-1', email: 'driver@example.com' });
    prisma.emailNotificationLog.findUnique.mockResolvedValue({
      id: 'log-1', status: 'FAILED', attempts: 1, updatedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    prisma.emailNotificationLog.updateMany.mockResolvedValue({ count: 1 });
    prisma.emailNotificationLog.update.mockResolvedValue({});
    mail.sendNotificationEmail.mockResolvedValue(undefined);
  });

  it('retries a failed opening campaign only after checking consent again', async () => {
    await (service as any).retryFailedOpeningNotifications();
    expect(prisma.emailNotificationLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: 'STAGE_REGISTRATION_OPEN', status: 'FAILED', attempts: { lt: 5 }, updatedAt: { lte: expect.any(Date) } },
    }));
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ newsletterConsentAt: { not: null }, newsletterConsentRevokedAt: null }),
    }));
    expect(mail.sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(prisma.emailNotificationLog.update).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SENT', providerAcceptedAt: expect.any(Date) }),
    }));
  });

  it('marks a failed campaign SKIPPED if consent has been revoked before retry', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await (service as any).retryFailedOpeningNotifications();
    expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
    expect(prisma.emailNotificationLog.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'log-1' }, data: { status: 'SKIPPED', lastError: null },
    }));
  });
});
