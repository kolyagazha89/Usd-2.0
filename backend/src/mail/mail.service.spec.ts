import { jest } from '@jest/globals';
import { InternalServerErrorException } from '@nestjs/common';
import { MailService } from './mail.service';

describe('MailService Resend delivery', () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM_EMAIL;
  const originalSmtpHost = process.env.SMTP_HOST;
  const originalSmtpUser = process.env.SMTP_USER;
  const originalSmtpPassword = process.env.SMTP_PASSWORD;
  const originalGmailClientId = process.env.GMAIL_CLIENT_ID;
  const originalGmailClientSecret = process.env.GMAIL_CLIENT_SECRET;
  const originalGmailRefreshToken = process.env.GMAIL_REFRESH_TOKEN;
  const originalGmailSenderEmail = process.env.GMAIL_SENDER_EMAIL;

  afterEach(() => {
    for (const [key, value] of Object.entries({
      RESEND_API_KEY: originalApiKey,
      RESEND_FROM_EMAIL: originalFrom,
      SMTP_HOST: originalSmtpHost,
      SMTP_USER: originalSmtpUser,
      SMTP_PASSWORD: originalSmtpPassword,
      GMAIL_CLIENT_ID: originalGmailClientId,
      GMAIL_CLIENT_SECRET: originalGmailClientSecret,
      GMAIL_REFRESH_TOKEN: originalGmailRefreshToken,
      GMAIL_SENDER_EMAIL: originalGmailSenderEmail,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  it('sends verification mail through the HTTPS API when configured', async () => {
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.RESEND_FROM_EMAIL = 'USD <no-reply@example.com>';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);
    const service = new MailService();

    await service.sendVerificationEmail('person@example.com', 'token-123');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      from: 'USD <no-reply@example.com>',
      to: ['person@example.com'],
      subject: 'Подтверждение email — USD',
    });
    expect(body.text).toContain('/verify-email?token=token-123');
  });

  it('fails clearly instead of pretending an email was sent when no provider is configured', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;

    const service = new MailService();

    await expect(
      service.sendVerificationEmail('person@example.com', 'token-123'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('does not treat a provider rejection as a successful send', async () => {
    process.env.RESEND_API_KEY = 'test-api-key';
    process.env.RESEND_FROM_EMAIL = 'USD <no-reply@example.com>';
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
    } as Response);
    const service = new MailService();

    await expect(
      service.sendVerificationEmail('person@example.com', 'token-123'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('sends verification mail through Gmail API HTTPS when all OAuth settings are configured', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    process.env.GMAIL_CLIENT_ID = 'test-client-id';
    process.env.GMAIL_CLIENT_SECRET = 'test-client-secret';
    process.env.GMAIL_REFRESH_TOKEN = 'test-refresh-token';
    process.env.GMAIL_SENDER_EMAIL = 'usd-sender@example.com';

    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'test-access-token', expires_in: 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'gmail-message-123' }),
      } as Response);
    const service = new MailService();

    await service.sendVerificationEmail('person@example.com', 'token-123');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
    const tokenBody = String(fetchMock.mock.calls[0][1]?.body);
    expect(tokenBody).toContain('client_id=test-client-id');
    expect(tokenBody).toContain('refresh_token=test-refresh-token');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }),
      }),
    );
    const requestBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    const mime = Buffer.from(requestBody.raw, 'base64url').toString('utf8');
    expect(mime).toContain('From: usd-sender@example.com');
    expect(mime).toContain('To: person@example.com');
    expect(mime).toContain('Подтверждение email — USD');
    expect(mime).toContain('/verify-email?token=token-123');
  });

  it('does not silently fall back to SMTP when Gmail configuration is partial', async () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
    process.env.GMAIL_CLIENT_ID = 'test-client-id';
    delete process.env.GMAIL_CLIENT_SECRET;
    delete process.env.GMAIL_REFRESH_TOKEN;
    delete process.env.GMAIL_SENDER_EMAIL;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;

    const service = new MailService();

    await expect(
      service.sendVerificationEmail('person@example.com', 'token-123'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
