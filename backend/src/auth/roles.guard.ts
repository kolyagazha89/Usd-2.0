import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import type { Request } from 'express';
import type { AuthenticatedRequest } from './authenticated-request';
import { PrismaService } from '../prisma/prisma.service';

type PermissionAction = 'view' | 'create' | 'update' | 'delete';
type PermissionMap = Record<string, unknown>;

const CONTROLLER_MODULES: Record<string, string> = {
  StagesController: 'stages',
  SeasonsController: 'seasons',
  RegistrationsController: 'registrations',
  InspectionsController: 'inspections',
  ResultsController: 'results',
  RecordsController: 'records',
  ParticipantsController: 'participants',
  TeamsController: 'teams',
  CarsController: 'cars',
  ClassesController: 'classes',
  ImportsController: 'imports',
  DataQualityController: 'imports',
  NormalizationDryRunController: 'imports',
  DisqualificationsController: 'disqualifications',
  ConfigurationsController: 'configurations',
  MediaController: 'media',
  SiteSettingsController: 'siteSettings',
  HistoricalResultsController: 'historicalResults',
  StatisticsController: 'statistics',
  GoogleController: 'integrations',
  AssistantController: 'assistant',
  AuthController: 'users',
  ComponentCatalogRequestsController: 'componentCatalogRequests',
};

function actionFor(request: Request): PermissionAction {
  const method = request.method.toUpperCase();
  if (request.path.startsWith('/media/upload')) return 'create';
  if (method === 'GET' || method === 'HEAD') return 'view';
  if (method === 'DELETE') return 'delete';
  if (method === 'PUT' || method === 'PATCH') return 'update';
  const path = request.path.toLowerCase();
  if (/(publish|unpublish|close|open|cancel|restore|activate|deactivate|status|verify|resolve|revoke|approve|reject|toggle|commit|rollback)/.test(path)) return 'update';
  return 'create';
}

function controllerModule(context: ExecutionContext): string {
  const name = context.getClass().name;
  if (CONTROLLER_MODULES[name]) return CONTROLLER_MODULES[name];
  return name.replace(/Controller$/, '').replace(/([a-z0-9])([A-Z])/g, '$1$2').toLowerCase();
}

function hasPermission(permissions: PermissionMap, module: string, action: PermissionAction): boolean {
  const modulePermissions = permissions[module];
  if (Array.isArray(modulePermissions)) return modulePermissions.includes(action) || modulePermissions.includes('*');
  if (modulePermissions && typeof modulePermissions === 'object') {
    const value = (modulePermissions as Record<string, unknown>)[action];
    return value === true || value === '*';
  }
  return false;
}

/**
 * Personal-account routes are accessible to any logged-in USD team member.
 * This exception does not cover administrative paths and never gives permission
 * to edit another participant. Services still verify resource ownership.
 */
function isSelfServiceAction(request: AuthenticatedRequest, context: ExecutionContext): boolean {
 const path=request.path;
 const method=request.method.toUpperCase();
 const name=context.getClass().name;
 if(name==='AuthController')return !path.startsWith('/auth/admin/');
 if(name==='TeamsController') {
  if(path==='/teams/me')return method==='GET';
  if(path==='/teams/me/leave')return method==='POST';
  if(/^\/teams\/[^/]+\/join$/.test(path))return method==='POST';
  if(/^\/teams\/[^/]+$/.test(path)&&!['/teams/admin','/teams/public'].includes(path))return method==='PATCH';
  if(/^\/teams\/[^/]+\/memberships\/[^/]+$/.test(path))return method==='PATCH';
  if(/^\/teams\/[^/]+\/posts$/.test(path))return method==='POST';
  if(/^\/teams\/[^/]+\/posts\/[^/]+$/.test(path))return method==='PATCH';
  return false;
 }
 if(name==='ParticipantsController') {
  if(path==='/participants/teams')return method==='GET';
  if(path==='/participants/me')return ['GET','POST','PATCH'].includes(method);
  if(path==='/participants/me/usd-id')return method==='GET';
  if(path==='/participants/me/usd-id/rotate')return method==='POST';
  if(path==='/participants/me/cars')return ['GET','POST'].includes(method);
  if(/^\/cars\/[^/]+$/.test(path))return ['PATCH','DELETE'].includes(method);
  return false;
 }
 if(name==='RegistrationsController') {
  if(path==='/registrations/me')return method==='GET'||method==='POST';
  if(/^\/registrations\/me\/[^/]+$/.test(path))return method==='DELETE';
  if(/^\/registrations\/[^/]+$/.test(path))return method==='GET';
  return false;
 }
 if(name==='MediaController') {
  if(path==='/media/prepare'&&method==='POST')return ['PARTICIPANT_PHOTO','CAR_PHOTO'].includes(String(request.body?.targetType??''));
  if(path==='/media/complete'&&method==='POST')return true;
  if(path==='/media/upload'&&method==='PUT')return true;
  if(/^\/media\/view\/(PARTICIPANT_PHOTO|CAR_PHOTO)\/[^/]+$/.test(path)&&method==='GET')return true;
  return false;
 }
 return false;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<
      Array<'ADMIN' | 'PARTICIPANT'>
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Public handlers are already allowed by JwtAuthGuard. Keep them public.
    if (!request.user) {
      if (!roles) return true;
      throw new ForbiddenException('Недостаточно прав для выполнения операции');
    }

    // ADMIN is a permanent system superuser, independent of custom-role settings.
    if (request.user.role === 'ADMIN') return true;

    if (request.user.customRoleId) {
      // User/role administration stays reserved to the permanent ADMIN role.
      // A custom permission matrix must never grant the ability to assign ADMIN
      // or manage the role system itself.
      if (context.getClass().name === 'AuthController' && request.path.startsWith('/auth/admin/')) {
        throw new ForbiddenException('Управление пользователями и ролями доступно только ADMIN');
      }
      if(isSelfServiceAction(request,context))return true;
      const module = controllerModule(context);
      const action = actionFor(request);
      // Result entry is delegated work; corrections and deletion remain ADMIN-only
      // even if a custom role's editable permission matrix is misconfigured.
      if (module === 'results' && (action === 'update' || action === 'delete')) {
        throw new ForbiddenException('Изменение и удаление результатов доступно только ADMIN');
      }
      const role = await this.prisma.role.findUnique({
        where: { id: request.user.customRoleId },
        select: { permissions: true },
      });
      if (!role || !hasPermission(role.permissions as PermissionMap, module, action)) {
        if(role&&context.getClass().name==='ConfigurationsController'){
          request.personalAccountAccess=true;
          return true;
        }
        throw new ForbiddenException('Недостаточно прав для выполнения операции');
      }
      return true;
    }

    if (!roles) return true;
    if (!roles.includes(request.user.role)) {
      throw new ForbiddenException('Недостаточно прав для выполнения операции');
    }
    return true;
  }
}
