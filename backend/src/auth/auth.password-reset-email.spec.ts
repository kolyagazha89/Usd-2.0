import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

describe('AuthService.requestPasswordReset email delivery feedback', () => {
  const genericMessage =
    'Если аккаунт существует, запрос на восстановление обработан. Этот ответ не подтверждает доставку письма; проверьте папку «Спам» и попробуйте позже.';

  it('returns a generic response when the mail provider fails', async () => {
    const user = {
      id: 'user-1',
      email: 'person@example.com',
      isActive: true,
      emailVerifiedAt: new Date(),
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      passwordResetToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'token-1' }),
      },
    };
    const mail = {
      sendPasswordResetEmail: jest.fn().mockRejectedValue(new Error('SMTP unavailable')),
    };
    const service = new AuthService(prisma as any, {} as any, mail as any);

    await expect(service.requestPasswordReset('person@example.com')).resolves.toEqual({
      success: true,
      message: genericMessage,
    });
    expect(mail.sendPasswordResetEmail).toHaveBeenCalledWith('person@example.com', expect.any(String));
  });

  it('returns the same response for an unknown account', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      passwordResetToken: {
        deleteMany: jest.fn(),
        create: jest.fn(),
      },
    };
    const mail = { sendPasswordResetEmail: jest.fn() };
    const service = new AuthService(prisma as any, {} as any, mail as any);

    await expect(service.requestPasswordReset('missing@example.com')).resolves.toEqual({
      success: true,
      message: genericMessage,
    });
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
