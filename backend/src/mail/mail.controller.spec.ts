import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/roles.decorator';
import { MailController } from './mail.controller';

describe('MailController', () => {
  it('requires ADMIN for test mail and validates the recipient', async () => {
    const mailService = { sendTestEmail: jest.fn().mockResolvedValue({ success: true }) };
    const controller = new MailController(mailService as any);

    expect(Reflect.getMetadata(ROLES_KEY, MailController.prototype.sendTestEmail)).toEqual(['ADMIN']);
    expect(() => controller.sendTestEmail({ email: 'not-an-email' })).toThrow(BadRequestException);
    expect(mailService.sendTestEmail).not.toHaveBeenCalled();
  });

  it('returns provider acceptance without claiming inbox delivery', async () => {
    const response = { success: true, providerAccepted: true, deliveryConfirmed: false, message: 'Accepted' };
    const mailService = { sendTestEmail: jest.fn().mockResolvedValue(response) };
    const controller = new MailController(mailService as any);

    await expect(controller.sendTestEmail({ email: 'admin@example.com' })).resolves.toEqual(response);
    expect(mailService.sendTestEmail).toHaveBeenCalledWith('admin@example.com');
  });
  it('accepts a normal email for the dedicated test-trigger endpoint', async () => {
    const mailService = { sendTestEmail: jest.fn() };
    const emailNotifications = { sendTestTrigger: jest.fn().mockResolvedValue({ success: true, providerAccepted: true, deliveryConfirmed: false }) };
    const controller = new MailController(mailService as any, emailNotifications as any);

    await expect(controller.sendTestTrigger({ email: 'admin@example.com', type: 'STAGE_REGISTRATION_OPEN' })).resolves.toMatchObject({ success: true });
    expect(emailNotifications.sendTestTrigger).toHaveBeenCalledWith('STAGE_REGISTRATION_OPEN', 'admin@example.com', undefined);
  });

  it('rejects malformed email for the dedicated test-trigger endpoint', async () => {
    const controller = new MailController({} as any, { sendTestTrigger: jest.fn() } as any);
    await expect(controller.sendTestTrigger({ email: 'not-an-email', type: 'STAGE_REGISTRATION_OPEN' })).rejects.toThrow(BadRequestException);
  });

  it('normalizes invisible formatting characters before validating both test endpoints', async () => {
    const mailService = { sendTestEmail: jest.fn().mockResolvedValue({ success: true }) };
    const emailNotifications = { sendTestTrigger: jest.fn().mockResolvedValue({ success: true }) };
    const controller = new MailController(mailService as any, emailNotifications as any);
    const pastedAddress = '\u200Badmin@example.com\uFEFF ';

    await expect(controller.sendTestEmail({ email: pastedAddress })).resolves.toEqual({ success: true });
    expect(mailService.sendTestEmail).toHaveBeenCalledWith('admin@example.com');
    await expect(controller.sendTestTrigger({ email: pastedAddress, type: 'STAGE_REGISTRATION_OPEN' })).resolves.toEqual({ success: true });
    expect(emailNotifications.sendTestTrigger).toHaveBeenCalledWith('STAGE_REGISTRATION_OPEN', 'admin@example.com', undefined);
  });

});
