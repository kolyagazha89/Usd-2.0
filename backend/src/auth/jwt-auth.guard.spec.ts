import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';

describe('access token family revocation', () => {
  const user = {
    id: 'user-1', email: 'user@example.invalid', role: 'PARTICIPANT',
    isActive: true, emailVerifiedAt: new Date(), participantId: null,
    customRoleId: null, customRole: null,
  };
  const request = { headers: { authorization: 'Bearer synthetic-access' }, user: undefined as unknown };
  const context = {
    getHandler: () => ({}), getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const jwtService = { verifyAsync: jest.fn() };
  const prisma = {
    user: { findUnique: jest.fn() },
    refreshSession: { findFirst: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    request.user = undefined;
    prisma.user.findUnique.mockResolvedValue(user as never);
    prisma.refreshSession.findFirst.mockResolvedValue({ id: 'session-1' } as never);
    jwtService.verifyAsync.mockResolvedValue({ sub: user.id, fid: 'family-1' } as never);
  });

  const guard = new JwtAuthGuard(
    jwtService as unknown as JwtService,
    reflector as unknown as Reflector,
    prisma as unknown as PrismaService,
  );

  it('accepts an active family and scopes the database lookup to user and non-revoked sessions', async () => {
    await expect(guard.canActivate(context as never)).resolves.toBe(true);
    expect(prisma.refreshSession.findFirst).toHaveBeenCalledWith({
      where: {
        familyId: 'family-1', userId: user.id, revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      select: { id: true },
    });
    expect(request.user).toMatchObject({ sub: user.id, role: user.role });
  });

  it('rejects access tokens after logout, password change or bulk revocation', async () => {
    prisma.refreshSession.findFirst.mockResolvedValue(null as never);
    await expect(guard.canActivate(context as never)).rejects.toThrow('Сеанс завершён');
  });

  it('rejects legacy tokens without a session family', async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: user.id } as never);
    await expect(guard.canActivate(context as never)).rejects.toThrow('Сеанс недействителен');
    expect(prisma.refreshSession.findFirst).not.toHaveBeenCalled();
  });
});
