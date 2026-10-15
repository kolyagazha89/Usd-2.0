import { jest } from '@jest/globals';
import { EmailNotificationsService } from './email-notifications.service';

describe('EmailNotificationsService reminder timing', () => {
  const prisma: any = {
    stage: { findMany: jest.fn() },
    registration: { findMany: jest.fn() },
    emailNotificationLog: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
  };
  const mail: any = { sendNotificationEmail: jest.fn() };
  let service: EmailNotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new EmailNotificationsService(prisma, mail);
    prisma.emailNotificationLog.findUnique.mockResolvedValue(null);
    prisma.emailNotificationLog.create.mockResolvedValue({ id: 'log-1', status: 'PENDING', attempts: 0, updatedAt: new Date() });
    prisma.emailNotificationLog.updateMany.mockResolvedValue({ count: 1 });
    prisma.emailNotificationLog.update.mockResolvedValue({});
    prisma.registration.findMany.mockResolvedValue([{
      id: 'reg-1',
      participant: { user: { id: 'user-1', email: 'driver@example.com', isActive: true, emailVerifiedAt: new Date() } },
      car: { brand: 'Lada', model: 'Vesta' },
      classes: [{ class: { name: 'Limited 2.0' } }],
    }]);
    mail.sendNotificationEmail.mockResolvedValue(undefined);
  });

  it('uses the three-day trigger when the stage is 71 hours away', async () => {
    const now = Date.now();
    prisma.stage.findMany.mockResolvedValue([{
      id: 'stage-1', name: 'Этап 1', stageNumber: 1, date: new Date(now + 71 * 3600000),
      city: 'Тюмень', venue: 'Площадка', address: null,
    }]);
    await service.processReminders();
    expect(prisma.emailNotificationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'STAGE_REMINDER_3D' }),
    }));
    const message = mail.sendNotificationEmail.mock.calls[0][0];
    expect(message.text).toContain('Дата:');
    expect(message.text).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  });

  it('uses the one-day trigger when the stage is 23 hours away', async () => {
    const now = Date.now();
    prisma.stage.findMany.mockResolvedValue([{
      id: 'stage-1', name: 'Этап 1', stageNumber: 1, date: new Date(now + 23 * 3600000),
      city: 'Тюмень', venue: 'Площадка', address: null,
    }]);
    await service.processReminders();
    expect(prisma.emailNotificationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'STAGE_REMINDER_1D' }),
    }));
  });
});
