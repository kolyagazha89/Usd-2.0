import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

describe('AuthService own-session identification', () => {
  const token = 'a'.repeat(64);
  const tokenHash = 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb';
  const rows = [
    { id: 'own-current', familyId: 'family-one', userAgent: 'Synthetic browser', ipAddress: '192.0.2.1', createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-29'), expiresAt: new Date('2099-01-01') },
    { id: 'own-other', familyId: 'family-two', userAgent: null, ipAddress: null, createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-28'), expiresAt: new Date('2099-01-01') },
  ];
  let prisma: any;
  let service: AuthService;

  beforeEach(() => {
    prisma = { refreshSession: {
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest.fn().mockResolvedValue({ id: 'own-current' }),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    } };
    service = new AuthService(prisma, {} as never, {} as never);
  });

  it('marks only the active same-user session proved by the cookie hash and returns no secret fields', async () => {
    const result = await service.listMySessions('user-one', token);

    expect(result).toEqual([{ ...rows[0], isCurrent: true }, rows[1]]);
    expect(prisma.refreshSession.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-one', tokenHash, revokedAt: null, expiresAt: { gt: expect.any(Date) } },
      select: { id: true },
    });
    const listing = prisma.refreshSession.findMany.mock.calls[0][0];
    expect(listing.where).toEqual({ userId: 'user-one', revokedAt: null, expiresAt: { gt: expect.any(Date) } });
    expect(listing.select).not.toHaveProperty('tokenHash');
    expect(JSON.stringify(result)).not.toContain(token);
    expect(JSON.stringify(result)).not.toContain(tokenHash);
    expect(result.every((session: object) => !('tokenHash' in session) && !('refreshToken' in session))).toBe(true);
  });

  it.each([undefined, '', 'broken', 'x'.repeat(64), ['a'.repeat(64)]])(
    'returns the existing list without a current marker or lookup for an absent/malformed cookie (%j)',
    async (cookie) => {
      await expect(service.listMySessions('user-one', cookie as string | undefined)).resolves.toEqual(rows);
      expect(prisma.refreshSession.findFirst).not.toHaveBeenCalled();
    },
  );

  it('does not mark a cookie that fails the same-user active lookup', async () => {
    prisma.refreshSession.findFirst.mockResolvedValue(null);
    const result = await service.listMySessions('user-one', token);
    expect(result).toEqual(rows);
    expect(prisma.refreshSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-one', tokenHash, revokedAt: null, expiresAt: { gt: expect.any(Date) } },
    }));
  });

  it('does not label a session that disappeared from the active list during refresh rotation', async () => {
    prisma.refreshSession.findFirst.mockResolvedValue({ id: 'rotated-away' });
    await expect(service.listMySessions('user-one', token)).resolves.toEqual(rows);
  });

  it('keeps revocation authorization scoped to the authenticated user without trusting any current marker', async () => {
    await expect(service.revokeMySession('user-one', 'other-user-session')).rejects.toThrow('Сессия не найдена или уже завершена');
    expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
      where: { id: 'other-user-session', userId: 'user-one', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
