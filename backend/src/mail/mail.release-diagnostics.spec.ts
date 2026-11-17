import { jest } from '@jest/globals';
import { BadGatewayException, Logger } from '@nestjs/common';
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


  it('records a safe DATA-stage spam classification for rejected real Gmail verification', async () => {
    const create = jest.fn<(...args:any[]) => Promise<any>>().mockResolvedValue({});
    const service = new MailService({ emailNotificationLog: { create } } as any);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn((service as any).transporter, 'sendMail').mockRejectedValue(
      Object.assign(new Error('Private SMTP rejection'), {
        code: 'EMESSAGE',
        responseCode: 554,
        command: 'DATA',
        response: '554 5.7.1 Message rejected under suspicion of SPAM: https://api.usd-russia.ru/auth/verify-email?token=private-token victim@gmail.com',
      }) as never,
    );

    await expect(service.sendVerificationEmail('victim@gmail.com', 'private-token')).rejects.toThrow();
    const entry = (create.mock.calls[0][0] as any).data;
    expect(entry.status).toBe('FAILED');
    expect(entry.lastError).toBe('MAIL_TRANSPORT_ERROR code=EMESSAGE smtp=554 http=NONE stage=DATA reason=SPAM_POLICY');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('stage=DATA reason=SPAM_POLICY'));
    expect(JSON.stringify(entry)).not.toContain('private-token');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-token');
    expect(JSON.stringify(log.mock.calls)).not.toContain('victim@gmail.com');
  });

  it('does not expose arbitrary SMTP response, recipients, commands, or links', () => {
    const service = new MailService();
    const safe = (service as any).safeMailFailure({
      code: 'EMESSAGE', responseCode: 554,
      command: 'DATA malicious-token https://private.invalid',
      response: '554 https://private.invalid/?token=private-token recipient@gmail.com',
    });
    expect(safe).toBe('MAIL_TRANSPORT_ERROR code=EMESSAGE smtp=554 http=NONE stage=UNKNOWN reason=UNSPECIFIED');
  });

  it('classifies rate-limited SMTP failures without leaking SMTP response text', () => {
    const service = new MailService();
    const safe = (service as any).safeMailFailure({
      code: 'EMESSAGE', responseCode: 554,
      command: 'DATA',
      response: '554 Too many messages sent today. Retry later. recipient@gmail.com',
    });
    expect(safe).toBe('MAIL_TRANSPORT_ERROR code=EMESSAGE smtp=554 http=NONE stage=DATA reason=RATE_LIMIT');
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
