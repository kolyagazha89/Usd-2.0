import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

describe('AuthService.resendVerificationEmail', () => {
  const user = { id: 'user-1', email: 'person@example.com', emailVerifiedAt: null };
  let prisma: any;
  let mail: any;
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(user),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      emailVerificationToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'token-1' }),
      },
    };
    mail = { sendVerificationEmail: jest.fn().mockResolvedValue(undefined) };
    service = new AuthService(prisma, {} as any, mail);
  });

  it('reserves a 60-second cooldown atomically before sending', async () => {
    const response = await service.resendVerificationEmail(' PERSON@example.com ');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'person@example.com' },
      select: { id: true, email: true, emailVerifiedAt: true },
    });
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'user-1',
        emailVerifiedAt: null,
        OR: expect.any(Array),
      }),
      data: { lastVerificationResendAt: expect.any(Date) },
    }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'EMAIL_VERIFICATION_RESEND_REQUESTED',
        entity: 'User',
        entityId: 'user-1',
      }),
    }));
    expect(mail.sendVerificationEmail).toHaveBeenCalledWith('person@example.com', expect.any(String));
    expect(response.success).toBe(true);
  });

  it('does not send or rotate tokens while the cooldown is active', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    const response = await service.resendVerificationEmail('person@example.com');

    expect(response).toEqual({
      success: true,
      message: 'Если аккаунт существует и требует подтверждения, запрос обработан. Это сообщение не подтверждает доставку письма.',
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.emailVerificationToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.emailVerificationToken.create).not.toHaveBeenCalled();
    expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('returns the same generic response for unknown and already verified accounts', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    const missing = await service.resendVerificationEmail('missing@example.com');
    expect(missing.message).toBe('Если аккаунт существует и требует подтверждения, запрос обработан. Это сообщение не подтверждает доставку письма.');
    expect(prisma.user.updateMany).not.toHaveBeenCalled();

    prisma.user.findUnique.mockResolvedValueOnce({ ...user, emailVerifiedAt: new Date() });
    const verified = await service.resendVerificationEmail('person@example.com');
    expect(verified).toEqual(missing);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('records mail delivery failure safely without revealing account existence', async () => {
    mail.sendVerificationEmail.mockRejectedValue(new Error('provider failure'));

    const response = await service.resendVerificationEmail('person@example.com');

    expect(response).toEqual({
      success: true,
      message: 'Если аккаунт существует и требует подтверждения, запрос обработан. Это сообщение не подтверждает доставку письма.',
    });
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
    expect(prisma.auditLog.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'EMAIL_VERIFICATION_RESEND_FAILED',
        metadata: { failureCode: 'SMTP_SEND_FAILED' },
      }),
    }));
  });
});
