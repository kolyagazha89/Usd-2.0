import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

describe('AuthService refresh/logout family serialization', () => {
  const token = 'a'.repeat(64);
  const user = { id: 'user-one', email: 'synthetic@example.test', role: 'PARTICIPANT', isActive: true, emailVerifiedAt: new Date(), customRole: null };
  const session = { id: 'old-session', userId: user.id, familyId: 'family-one', revokedAt: null, expiresAt: new Date('2099-01-01'), user };
  let prisma: any, tx: any, service: AuthService, operations: string[];

  beforeEach(() => {
    operations = [];
    tx = {
      $queryRaw: jest.fn(async () => { operations.push('family-lock'); return []; }),
      refreshSession: {
        findUnique: jest.fn(async () => { operations.push('read-session'); return session; }),
        updateMany: jest.fn(async () => { operations.push('revoke'); return { count: 1 }; }),
        create: jest.fn(async () => { operations.push('create'); return {}; }),
      },
    };
    prisma = {
      refreshSession: { findUnique: jest.fn(async () => ({ familyId: session.familyId, userId: user.id })) },
      $transaction: jest.fn(async (action: any) => action(tx)),
    };
    service = new AuthService(prisma, { signAsync: async () => 'synthetic-access' } as never, {} as never);
  });

  it('locks the token family before refreshing from a new read-committed snapshot', async () => {
    await service.refresh(token);
    expect(operations).toEqual(['family-lock', 'read-session', 'revoke', 'create']);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock');
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toContain(session.familyId);
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'ReadCommitted' });
  });

  it('revokes active successors using a rotated/revoked ancestor token under the same family lock', async () => {
    await service.logout(token);
    expect(operations).toEqual(['family-lock', 'revoke']);
    expect(tx.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { familyId: session.familyId, userId: user.id, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(tx.$queryRaw.mock.calls[0].slice(1)).toContain(session.familyId);
    expect(prisma.refreshSession.findUnique).toHaveBeenCalledWith({ where: { tokenHash: expect.any(String) }, select: { familyId: true, userId: true } });
  });

  it('commits replay-family revocation before reporting an unauthorized refresh', async () => {
    tx.refreshSession.findUnique.mockImplementation(async () => ({ ...session, revokedAt: new Date() }));
    let committed = false;
    prisma.$transaction.mockImplementation(async (action: any) => { const result = await action(tx); committed = true; return result; });
    await expect(service.refresh(token)).rejects.toThrow('Обнаружено повторное использование');
    expect(committed).toBe(true);
    expect(tx.refreshSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { familyId: session.familyId, userId: user.id, revokedAt: null } }));
    expect(tx.refreshSession.create).not.toHaveBeenCalled();
  });

  it('keeps empty and unknown-token logout idempotent without opening a transaction', async () => {
    await expect(service.logout('')).resolves.toEqual({ success: true });
    prisma.refreshSession.findUnique.mockResolvedValue(null);
    await expect(service.logout(token)).resolves.toEqual({ success: true });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
