import { jest } from '@jest/globals';
import { EmailNotificationsService } from './email-notifications.service';

describe('personal Yandex account-only email mode', () => {
  const previous = process.env.MAIL_ACCOUNT_ONLY;
  afterAll(() => {
    if (previous === undefined) delete process.env.MAIL_ACCOUNT_ONLY;
    else process.env.MAIL_ACCOUNT_ONLY = previous;
  });

  it('does not start the automatic stage reminder timer', () => {
    process.env.MAIL_ACCOUNT_ONLY = 'true';
    const prisma = { stage: { findMany: jest.fn() }, emailNotificationLog: { findMany: jest.fn() } };
    const service = new EmailNotificationsService(prisma as any, {} as any);
    service.onModuleInit();
    expect((service as any).timer).toBeUndefined();
    expect(prisma.stage.findMany).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('skips all stage notifications before writing a log or sending a message', async () => {
    process.env.MAIL_ACCOUNT_ONLY = 'true';
    const prisma = {
      emailNotificationLog: { findUnique: jest.fn(), create: jest.fn() },
      siteSettings: { findUnique: jest.fn() },
    };
    const mail = { sendNotificationEmail: jest.fn() };
    const service = new EmailNotificationsService(prisma as any, mail as any);
    for (const type of ['STAGE_REGISTRATION_OPEN','STAGE_REMINDER_3D','STAGE_REMINDER_1D','REGISTRATION_CONFIRMED','STAGE_RESULTS_PUBLISHED']) {
      await (service as any).dispatch({
        eventKey: 'mail-account-only:' + type, type, recipient:'recipient@test.invalid',
        stageId:'stage1', subject:'test', heading:'test', intro:'test', details:[], href:'https://app.usd-russia.ru',
      });
    }
    expect(prisma.emailNotificationLog.findUnique).not.toHaveBeenCalled();
    expect(prisma.emailNotificationLog.create).not.toHaveBeenCalled();
    expect(prisma.siteSettings.findUnique).not.toHaveBeenCalled();
    expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
  });
});
