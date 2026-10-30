import { jest } from '@jest/globals';
import { AuthController } from './auth.controller';

describe('AuthController own-session identification', () => {
  const originalCookieName = process.env.AUTH_COOKIE_NAME;
  let listMySessions: jest.Mock<(userId: string, token?: string) => Promise<unknown>>;
  let controller: AuthController;

  beforeEach(() => {
    delete process.env.AUTH_COOKIE_NAME;
    listMySessions = jest.fn<(userId: string, token?: string) => Promise<unknown>>().mockResolvedValue([]);
    controller = new AuthController({ listMySessions } as never);
  });

  afterEach(() => {
    if (originalCookieName === undefined) delete process.env.AUTH_COOKIE_NAME;
    else process.env.AUTH_COOKIE_NAME = originalCookieName;
  });

  it('uses the authenticated user and configured refresh cookie, ignoring body and query claims', async () => {
    process.env.AUTH_COOKIE_NAME = 'custom_refresh';
    const token = 'a'.repeat(64);
    await controller.listSessions({
      user: { sub: 'user-one' },
      cookies: { custom_refresh: token, usd_refresh_token: 'b'.repeat(64) },
      body: { userId: 'other-user', isCurrent: true, refreshToken: 'forged' },
      query: { userId: 'other-user', refreshToken: 'forged' },
    } as never);

    expect(listMySessions).toHaveBeenCalledWith('user-one', token);
  });

  it('uses the default HttpOnly cookie name when it is not overridden', async () => {
    await controller.listSessions({ user: { sub: 'user-one' }, cookies: { usd_refresh_token: 'b'.repeat(64) } } as never);
    expect(listMySessions).toHaveBeenCalledWith('user-one', 'b'.repeat(64));
  });

  it.each([undefined, {}, { usd_refresh_token: ['forged'] }, { usd_refresh_token: { token: 'forged' } }])(
    'keeps clients without a string cookie working (%j)',
    async (cookies) => {
      await expect(controller.listSessions({ user: { sub: 'user-one' }, cookies } as never)).resolves.toEqual([]);
      expect(listMySessions).toHaveBeenCalledWith('user-one', undefined);
    },
  );
});
