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
  it('allows staff self-service without granting unrelated admin permissions', async () => {
    prisma.role.findUnique.mockResolvedValue({permissions:{inspections:['view']}});
    for (const [name,path,method] of [
      ['ParticipantsController','/participants/me','GET'],
      ['ParticipantsController','/participants/me','POST'],
      ['ParticipantsController','/participants/me/cars','POST'],
      ['ParticipantsController','/cars/my-car','PATCH'],
      ['RegistrationsController','/registrations/me','GET'],
      ['RegistrationsController','/registrations/me','POST'],
      ['RegistrationsController','/registrations/me/reg-1','DELETE'],
      ['AuthController','/auth/legal-consent','PATCH'],
      ['MediaController','/media/prepare','POST'],
    ] as const) {
      const request:any={method,path,body:path==='/media/prepare'?{targetType:'CAR_PHOTO'}:{},user:{sub:'judge',role:'PARTICIPANT',customRoleId:'role-1'}};
      await expect(guard.canActivate(context(request,name))).resolves.toBe(true);
    }
  });

  it('checks owner-only configuration access when staff has no configurations permission', async () => {
    prisma.role.findUnique.mockResolvedValue({ permissions:{results:['view','create']} });
    const request:any={method:'GET',path:'/cars/private/configurations',user:{sub:'judge',role:'PARTICIPANT',customRoleId:'role-1'}};
    await expect(guard.canActivate(context(request,'ConfigurationsController'))).resolves.toBe(true);
    expect(request.personalAccountAccess).toBe(true);
  });

  it('does not grant custom staff blanket access to the media library or site assets', async () => {
    prisma.role.findUnique.mockResolvedValue({permissions:{inspections:['view']}});
    for(const request of [
      {method:'POST',path:'/media/prepare',body:{targetType:'SITE_ASSET'}},
      {method:'DELETE',path:'/media/library/SITE_ASSET/test'},
      {method:'PATCH',path:'/stages/other-stage'},
    ]) {
      await expect(guard.canActivate(context({...request,user:{sub:'judge',role:'PARTICIPANT',customRoleId:'role-1'}},request.path.startsWith('/media')?'MediaController':'StagesController'))).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

});
