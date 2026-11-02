import { jest } from '@jest/globals';
import { BadGatewayException } from '@nestjs/common';
import { MailService } from './mail.service';

describe('USD release SMTP diagnostics', () => {
  const keys = ['MAIL_PROVIDER', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_FROM', 'SMTP_PASSWORD', 'SMTP_EGRESS_ALLOWED'];
  const originals: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of keys) {
      originals[key] = process.env[key];
      delete process.env[key];
    }
    process.env.MAIL_PROVIDER = 'smtp';
    process.env.SMTP_HOST = 'smtp.yandex.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_SECURE = 'true';
    process.env.SMTP_USER = 'usd-russia';
    process.env.SMTP_FROM = 'USD <usd-russia@yandex.com>';
    process.env.SMTP_PASSWORD = 'test-app-password';
    process.env.SMTP_EGRESS_ALLOWED = 'true';
  });
  afterEach(() => {
    for (const key of keys) {
      if (originals[key] === undefined) delete process.env[key];
      else process.env[key] = originals[key];
    }
    jest.restoreAllMocks();
  });

  it('verifies SMTP credentials without sending mail or claiming delivery', async () => {
    const service = new MailService();
    const transporter = (service as any).transporter;
    const verify = jest.spyOn(transporter, 'verify').mockResolvedValue(true as never);
    const send = jest.spyOn(transporter, 'sendMail');
    await expect(service.checkConnection()).resolves.toMatchObject({
      success: true, connected: true, deliveryConfirmed: false,
    });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns an actionable 503 on SMTP auth failure without exposing secrets', async () => {
    const service = new MailService();
    jest.spyOn((service as any).transporter, 'sendMail').mockRejectedValue(
      Object.assign(new Error('private provider response'), { code: 'EAUTH', responseCode: 535 }) as never,
    );
    try {
      await service.runAdminMailTest(() => service.sendTestAuthTemplate('admin@example.com', 'AUTH_PASSWORD_RESET'));
      throw new Error('Expected mail diagnostic to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(BadGatewayException);
      const result = (error as BadGatewayException).getResponse();
      expect(result).toMatchObject({ code: 'MAIL_AUTH_FAILED' });
      expect(JSON.stringify(result)).not.toContain('private provider response');
      expect(JSON.stringify(result)).not.toContain('test-app-password');
    }
  });

  it('explains missing SMTP parameters without attempting a connection', async () => {
    delete process.env.SMTP_EGRESS_ALLOWED;
    const service = new MailService();
    const send = jest.spyOn((service as any).transporter, 'sendMail');
    await expect(service.sendTestEmail('admin@example.com')).rejects.toMatchObject({
      status: 503,
    });
    expect(send).not.toHaveBeenCalled();
  });
});
