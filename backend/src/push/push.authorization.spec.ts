import { jest } from '@jest/globals';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import type { ExecutionContext } from '@nestjs/common';
import { PushAdminController, PushController } from './push.controller';

describe('push server authorization', () => {
  const roleQuery = jest.fn<() => Promise<any>>();
  const reflector = {
    getAllAndOverride: () => ['ADMIN'],
  } as unknown as Reflector;
  const guard = new RolesGuard(reflector, {
    role: { findUnique: roleQuery },
  } as unknown as PrismaService);
  const context = (controller: any, method: string, path: string, user: any) =>
    ({
      getHandler: () => () => {},
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ method, path, user }) }),
    }) as unknown as ExecutionContext;
  beforeEach(() => {
    roleQuery.mockResolvedValue({ permissions: { notifications: ['view'] } });
  });
  it('requires ADMIN or an explicit create grant to enqueue announcements', async () => {
    const user = { sub: 'actor', role: 'PARTICIPANT' };
    await expect(
      guard.canActivate(
        context(PushAdminController, 'POST', '/push/admin/messages', user),
      ),
    ).rejects.toThrow();
    await expect(
      guard.canActivate(
        context(PushAdminController, 'POST', '/push/admin/messages', {
          ...user,
          customRoleId: 'role',
        }),
      ),
    ).rejects.toThrow();
    roleQuery.mockResolvedValue({
      permissions: { notifications: ['view', 'create'] },
    });
    await expect(
      guard.canActivate(
        context(PushAdminController, 'POST', '/push/admin/messages', {
          ...user,
          customRoleId: 'role',
        }),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        context(PushAdminController, 'POST', '/push/admin/messages', {
          ...user,
          role: 'ADMIN',
        }),
      ),
    ).resolves.toBe(true);
  });
  it('allows only the subscription self-service surface for staff without module grants', async () => {
    roleQuery.mockResolvedValue({ permissions: {} });
    const user = { sub: 'actor', role: 'PARTICIPANT', customRoleId: 'role' };
    for (const [method, path] of [
      ['GET', '/push/subscriptions'],
      ['PUT', '/push/subscriptions'],
      ['PATCH', '/push/subscriptions/device'],
      ['DELETE', '/push/subscriptions/device'],
    ]) {
      await expect(
        guard.canActivate(context(PushController, method, path, user)),
      ).resolves.toBe(true);
    }
    await expect(
      guard.canActivate(
        context(PushController, 'POST', '/push/subscriptions', user),
      ),
    ).rejects.toThrow();
    await expect(
      guard.canActivate(
        context(PushAdminController, 'GET', '/push/admin/messages', user),
      ),
    ).rejects.toThrow();
  });
});
