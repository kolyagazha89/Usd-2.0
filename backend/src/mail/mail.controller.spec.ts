import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/roles.decorator';
import { MailController } from './mail.controller';

describe('MailController', () => {
  it('requires ADMIN for test mail and validates the recipient', async () => {
    const mailService = { sendTestEmail: jest.fn().mockResolvedValue({ success: true }) };
    const controller = new MailController(mailService as any);

    expect(Reflect.getMetadata(ROLES_KEY, MailController.prototype.sendTestEmail)).toEqual(['ADMIN']);
    await expect(controller.sendTestEmail({ email: 'not-an-email' })).rejects.toBeInstanceOf(BadRequestException);
    expect(mailService.sendTestEmail).not.toHaveBeenCalled();
  });

  it('returns provider acceptance without claiming inbox delivery', async () => {
    const response = { success: true, providerAccepted: true, deliveryConfirmed: false, message: 'Accepted' };
    const mailService = { sendTestEmail: jest.fn().mockResolvedValue(response) };
    const controller = new MailController(mailService as any);

    await expect(controller.sendTestEmail({ email: 'admin@example.com' })).resolves.toEqual(response);
    expect(mailService.sendTestEmail).toHaveBeenCalledWith('admin@example.com');
  });
});
