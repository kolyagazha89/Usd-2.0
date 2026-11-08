import { jest } from '@jest/globals';
import { AuthController } from './auth.controller';

describe('AuthController email verification link', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  let authService: { verifyEmail: jest.Mock<(token: string) => Promise<unknown>> };
  let controller: AuthController;
  let response: {
    redirect: jest.Mock<(status: number, url: string) => unknown>;
    setHeader: jest.Mock<(name: string, value: string) => unknown>;
  };

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.usd-russia.ru/';
    authService = { verifyEmail: jest.fn<(token: string) => Promise<unknown>>() };
    response = {
      redirect: jest.fn<(status: number, url: string) => unknown>(),
      setHeader: jest.fn<(name: string, value: string) => unknown>(),
    };
    controller = new AuthController(authService as never);
  });

  afterAll(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it('GET only forwards a valid link to the explicit-confirmation page, without consuming it', async () => {
    const token = 'a'.repeat(64);
    await controller.verifyEmailFromLink(token, response as never);
    expect(authService.verifyEmail).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(302, 'https://app.usd-russia.ru/verify-email#token=' + token);
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(response.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer');
  });

  it('does not consume expired-but-well-formed links on GET, leaving validity checks to explicit POST', async () => {
    const token='b'.repeat(64);
    await controller.verifyEmailFromLink(token,response as never);
    expect(authService.verifyEmail).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(302,'https://app.usd-russia.ru/verify-email#token='+token);
  });

  it.each(['', 'not-a-token', 'a'.repeat(5000), '\r\nX-Foo: injected', ['a'.repeat(64)] as unknown as string])(
    'rejects malformed GET tokens without a database read or token-bearing redirect (%j)',
    async token => {
      await controller.verifyEmailFromLink(token,response as never);
      expect(authService.verifyEmail).not.toHaveBeenCalled();
      expect(response.redirect).toHaveBeenCalledWith(302,'https://app.usd-russia.ru/verify-email?status=error');
    },
  );

  it('only the explicit POST endpoint consumes a submitted verification token', async () => {
    const token='c'.repeat(64);
    authService.verifyEmail.mockResolvedValue({success:true});
    await expect(controller.verifyEmail({token} as never)).resolves.toEqual({success:true});
    expect(authService.verifyEmail).toHaveBeenCalledWith(token);
  });
});
