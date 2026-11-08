import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

describe('AuthService.requestPasswordReset email delivery feedback', () => {
  const genericMessage =
    'Если адрес привязан к подтверждённому аккаунту USD, мы попробуем отправить ссылку для восстановления пароля. Проверьте «Входящие» и «Спам».';

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

  it('keeps an existing unexpired password-reset link when SMTP is unavailable', async () => {
    const user = { id: 'user-1', email: 'person@example.com', isActive: true, emailVerifiedAt: new Date() };
    const old = { id: 'old-link', userId: user.id, expiresAt: new Date(Date.now() + 20 * 60 * 1000) };
    const stored: Array<{id:string;userId:string;expiresAt:Date}> = [old];
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(user) },
      passwordResetToken: {
        deleteMany: jest.fn(async ({where}:any) => {
          if(!where.expiresAt){const count=stored.length;stored.length=0;return {count};}
          let count=0;
          for(let i=stored.length-1;i>=0;i--)if(stored[i].expiresAt<where.expiresAt.lt){stored.splice(i,1);count++;}
          return {count};
        }),
        create: jest.fn(async ({data}:any) => {
          const item={...data,id:'new-link'};
          stored.push(item);return item;
        }),
      },
    };
    const mail={sendPasswordResetEmail:jest.fn().mockRejectedValue(new Error('offline'))};
    const service=new AuthService(prisma as any,{} as any,mail as any);
    await expect(service.requestPasswordReset(user.email)).resolves.toMatchObject({success:true,message:genericMessage});
    expect(stored.some(token=>token.id===old.id)).toBe(true);
    expect(stored.some(token=>token.id==='new-link')).toBe(true);
    expect(mail.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
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
