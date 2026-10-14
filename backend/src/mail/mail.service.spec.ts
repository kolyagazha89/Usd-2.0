import { jest } from '@jest/globals';
import { InternalServerErrorException } from '@nestjs/common';
import { MailService } from './mail.service';

describe('MailService Resend delivery', () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFrom = process.env.RESEND_FROM_EMAIL;
  const originalSmtpHost = process.env.SMTP_HOST;
  const originalSmtpUser = process.env.SMTP_USER;
  const originalSmtpPassword = process.env.SMTP_PASSWORD;

  afterEach(() => {
    for (const [key, value] of Object.entries({
      RESEND_API_KEY: originalApiKey,
      RESEND_FROM_EMAIL: originalFrom,
      SMTP_HOST: originalSmtpHost,
      SMTP_USER: originalSmtpUser,
      SMTP_PASSWORD: originalSmtpPassword,
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
});
