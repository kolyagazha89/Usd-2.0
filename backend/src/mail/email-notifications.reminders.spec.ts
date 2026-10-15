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

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-15T09:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the three-day trigger on the third calendar day before the stage', async () => {
    prisma.stage.findMany.mockResolvedValue([{
      id: 'stage-1', name: 'Этап 1', stageNumber: 1, date: new Date('2026-10-18T12:00:00.000Z'),
      city: 'Тюмень', venue: 'Площадка', address: null,
    }]);
    await service.processReminders();
    expect(prisma.emailNotificationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'STAGE_REMINDER_3D' }),
    }));
    const message = mail.sendNotificationEmail.mock.calls[0][0];
    expect(message.text).toContain('Дата:');
    expect(message.text).not.toMatch(/\\b\\d{1,2}:\\d{2}\\b/);
  });

  it('does not label a stage two calendar days away as a three-day reminder', async () => {
    prisma.stage.findMany.mockResolvedValue([{
      id: 'stage-2', name: 'Этап 2', stageNumber: 2, date: new Date('2026-10-17T12:00:00.000Z'),
      city: 'Тюмень', venue: 'Площадка', address: null,
    }]);
    await service.processReminders();
    expect(prisma.emailNotificationLog.create).not.toHaveBeenCalled();
    expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('uses the one-day trigger on the day before the stage', async () => {
    prisma.stage.findMany.mockResolvedValue([{
      id: 'stage-3', name: 'Этап 3', stageNumber: 3, date: new Date('2026-10-16T12:00:00.000Z'),
      city: 'Тюмень', venue: 'Площадка', address: null,
    }]);
    await service.processReminders();
    expect(prisma.emailNotificationLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'STAGE_REMINDER_1D' }),
    }));
  });
});
