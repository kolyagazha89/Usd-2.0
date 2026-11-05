import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('password reset one-time token atomic claim', () => {
  it('only the winning request changes the password in a concurrent redemption', async () => {
    let claimed = false;
    const passwordWrites: string[] = [];
    const token = { id: 'reset-1', userId: 'user-1', usedAt: null, expiresAt: new Date(Date.now() + 60_000) };
    const tx = {
      passwordResetToken: {
        updateMany: jest.fn(async () => {
          if (claimed) return { count: 0 };
          claimed = true;
          return { count: 1 };
        }),
        deleteMany: jest.fn(async () => ({ count: 0 })),
      },
      user: {
        update: jest.fn(async ({ data }: any) => {
          passwordWrites.push(data.passwordHash);
          return {};
        }),
      },
      refreshSession: { updateMany: jest.fn(async () => ({ count: 0 })) },
    };
    const prisma = {
      passwordResetToken: { findUnique: jest.fn(async () => token) },
      $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new AuthService(prisma as any, {} as any, {} as any);
    const outcomes = await Promise.allSettled([
      service.resetPassword('a'.repeat(64), 'Password-one-2026'),
      service.resetPassword('a'.repeat(64), 'Password-two-2026'),
    ]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(x => x.status === 'rejected')).toHaveLength(1);
    const rejected = outcomes.find(x => x.status === 'rejected');
    expect(rejected).toMatchObject({ reason: expect.any(BadRequestException) });
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledTimes(2);
    expect(passwordWrites).toHaveLength(1);
    expect(tx.refreshSession.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.passwordResetToken.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('claims only a valid, unexpired, unused token before changing any password', async () => {
    const tx = {
      passwordResetToken: { updateMany: jest.fn(async () => ({ count: 0 })) },
      user: { update: jest.fn() },
      refreshSession: { updateMany: jest.fn() },
    };
    const prisma = {
      passwordResetToken: {
        findUnique: jest.fn(async () => ({
          id: 'reset-1', userId: 'user-1', usedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        })),
      },
      $transaction: jest.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new AuthService(prisma as any, {} as any, {} as any);
    await expect(service.resetPassword('a'.repeat(64), 'Secure-pass-2026'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        usedAt: null, expiresAt: { gt: expect.any(Date) },
      }),
    }));
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
