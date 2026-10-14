import { jest } from '@jest/globals';
import { GoogleService } from './google.service';

describe('GoogleService Gmail sending', () => {
  const envKeys = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_OAUTH_REDIRECT_URI',
    'GOOGLE_TOKEN_ENCRYPTION_KEY',
    'SMTP_USER',
  ] as const;
  const originalEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));

  afterEach(() => {
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://usd.example/google/callback';
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
    process.env.SMTP_USER = 'sender@example.com';
  });

  it('requests Gmail send permission during Google reconnection', async () => {
    const prisma = {
      googleOAuthState: { create: jest.fn().mockResolvedValue({ id: 'state-1' }) },
    };
    const service = new GoogleService(prisma as any);

    const url = await service.createAuthorizationUrl('admin-1');
    const scopes = new URL(url).searchParams.get('scope') ?? '';

    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.send');
    expect(scopes).toContain('https://www.googleapis.com/auth/drive.readonly');
    expect(scopes).toContain('https://www.googleapis.com/auth/spreadsheets.readonly');
  });

  it('sends through Gmail HTTPS API using the configured sender account', async () => {
    const prisma = {
      googleConnection: {
        findUnique: jest.fn(),
      },
    };
    const service = new GoogleService(prisma as any);
    const encryptedRefreshToken = (service as any).encrypt('refresh-token');
    prisma.googleConnection.findUnique.mockResolvedValue({
      id: 'default',
      email: 'sender@example.com',
      refreshTokenEncrypted: encryptedRefreshToken,
    });

    const fetchMock = jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'access-token', expires_in: 3600 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 'gmail-message-id' }),
      } as Response);

    await service.sendEmail(
      'participant@example.com',
      'Подтверждение email — USD',
      'Проверочный текст',
      '<p>Проверочный текст</p>',
    );

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer access-token' }),
      }),
    );
    const payload = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(payload.raw).toEqual(expect.any(String));
    expect(Buffer.from(payload.raw, 'base64url').toString('utf8')).toContain('participant@example.com');
    expect(Buffer.from(payload.raw, 'base64url').toString('utf8')).toContain('Проверочный текст');
  });

  it('rejects sending from a Google account different from the configured sender', async () => {
    const prisma = {
      googleConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'default',
          email: 'other@example.com',
          refreshTokenEncrypted: 'unused',
        }),
      },
    };
    const service = new GoogleService(prisma as any);

    await expect(
      service.sendEmail('participant@example.com', 'Subject', 'Text', '<p>Text</p>'),
    ).rejects.toThrow('не совпадает с почтовым адресом отправителя');
  });
});
