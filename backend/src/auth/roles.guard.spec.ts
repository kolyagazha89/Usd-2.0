import { jest } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
  const prisma: any = { role: { findUnique: jest.fn() } };
  let guard: RolesGuard;

  const context = (request: any, controllerName = 'StagesController') => ({
    getHandler: () => ({}),
    getClass: () => ({ name: controllerName }),
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(reflector, prisma);
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN']);
    prisma.role.findUnique.mockResolvedValue({ permissions: { stages: ['view'] } });
  });

  it('always grants the permanent ADMIN role access', async () => {
    const ctx = context({ method: 'DELETE', path: '/results/1', user: { sub: 'admin', role: 'ADMIN' } }, 'ResultsController');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.role.findUnique).not.toHaveBeenCalled();
  });

  it('uses the custom role permission matrix for protected modules', async () => {
    const ctx = context({ method: 'GET', path: '/stages', user: { sub: 'custom', role: 'PARTICIPANT', customRoleId: 'role-1' } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.role.findUnique).toHaveBeenCalledWith({
      where: { id: 'role-1' },
      select: { permissions: true },
    });
  });

  it('allows a custom role with imports view access to read the data-quality report', async () => {
    prisma.role.findUnique.mockResolvedValue({ permissions: { imports: ['view'] } });
    const ctx = context({ method: 'GET', path: '/data-quality/report', user: { sub: 'custom', role: 'PARTICIPANT', customRoleId: 'role-1' } }, 'DataQualityController');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows a custom role with imports view access to run the read-only normalization dry-run', async () => {
    prisma.role.findUnique.mockResolvedValue({ permissions: { imports: ['view'] } });
    const ctx = context({ method: 'GET', path: '/admin/data-quality/normalization/dry-run', user: { sub: 'custom', role: 'PARTICIPANT', customRoleId: 'role-1' } }, 'NormalizationDryRunController');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('treats media upload as a create action for custom roles', async () => {
    prisma.role.findUnique.mockResolvedValue({ permissions: { media: ['create'] } });
    const ctx = context({ method: 'PUT', path: '/media/upload', user: { sub: 'custom', role: 'PARTICIPANT', customRoleId: 'role-1' } }, 'MediaController');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('denies a custom role when the requested action is not granted', async () => {
    prisma.role.findUnique.mockResolvedValue({ permissions: { stages: ['view'] } });
    const ctx = context({ method: 'DELETE', path: '/stages/1', user: { sub: 'custom', role: 'PARTICIPANT', customRoleId: 'role-1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a custom judge role to enter results when create is granted', async () => {
    prisma.role.findUnique.mockResolvedValue({ permissions: { results: ['view', 'create'] } });
    const ctx = context({ method: 'POST', path: '/results', user: { sub: 'judge', role: 'PARTICIPANT', customRoleId: 'role-1' } }, 'ResultsController');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('keeps result corrections ADMIN-only even when a custom role is granted update/delete', async () => {
    prisma.role.findUnique.mockResolvedValue({ permissions: { results: ['view', 'create', 'update', 'delete'] } });
    const ctx = context({ method: 'PATCH', path: '/results/1', user: { sub: 'judge', role: 'PARTICIPANT', customRoleId: 'role-1' } }, 'ResultsController');
    await expect(guard.canActivate(ctx)).rejects.toThrow('Изменение и удаление результатов доступно только ADMIN');
    expect(prisma.role.findUnique).not.toHaveBeenCalled();
  });

  it('keeps built-in role restrictions when no custom role is assigned', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['ADMIN']);
    const ctx = context({ method: 'GET', path: '/stages', user: { sub: 'judge', role: 'PARTICIPANT' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reserves admin user and role management endpoints to ADMIN', async () => {
    const ctx = context({ method: 'POST', path: '/auth/admin/roles', user: { sub: 'custom', role: 'PARTICIPANT', customRoleId: 'role-1' } }, 'AuthController');
    await expect(guard.canActivate(ctx)).rejects.toThrow('Управление пользователями и ролями доступно только ADMIN');
    expect(prisma.role.findUnique).not.toHaveBeenCalled();
  });
  it('allows staff to manage their own account without users-module grants', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);
    const ctx = context({method:'GET',path:'/auth/me',user:{sub:'judge',role:'PARTICIPANT',customRoleId:'role-1'}},'AuthController');
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.role.findUnique).not.toHaveBeenCalled();
  });
});
