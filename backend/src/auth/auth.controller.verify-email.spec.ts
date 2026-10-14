import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { AuthController } from './auth.controller';

describe('AuthController email verification link', () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;
  let authService: { verifyEmail: ReturnType<typeof jest.fn> };
  let controller: AuthController;
  let response: { redirect: ReturnType<typeof jest.fn> };

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://usd-russia.ru/';
    authService = { verifyEmail: jest.fn() };
    response = { redirect: jest.fn() };
    controller = new AuthController(authService as never);
  });

  afterAll(() => {
    if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = originalFrontendUrl;
  });

  it('confirms the token and redirects to the success page', async () => {
    authService.verifyEmail.mockResolvedValue({ success: true, message: 'Email успешно подтверждён' });

    await controller.verifyEmailFromLink('valid-token', response as never);

    expect(authService.verifyEmail).toHaveBeenCalledWith('valid-token');
    expect(response.redirect).toHaveBeenCalledWith(302, 'https://usd-russia.ru/verify-email?status=success');
  });

  it('redirects expired tokens to an explanatory page state', async () => {
    authService.verifyEmail.mockRejectedValue(new BadRequestException('Срок действия токена подтверждения истёк'));

    await controller.verifyEmailFromLink('expired-token', response as never);

    expect(response.redirect).toHaveBeenCalledWith(302, 'https://usd-russia.ru/verify-email?status=expired');
  });

  it('does not report success for invalid tokens', async () => {
    authService.verifyEmail.mockRejectedValue(new BadRequestException('Недействительный токен подтверждения'));

    await controller.verifyEmailFromLink('invalid-token', response as never);

    expect(response.redirect).toHaveBeenCalledWith(302, 'https://usd-russia.ru/verify-email?status=error');
  });
});
