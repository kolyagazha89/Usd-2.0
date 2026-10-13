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
  DisqualificationsController: 'disqualifications',
  ConfigurationsController: 'configurations',
  MediaController: 'media',
  SiteSettingsController: 'siteSettings',
  HistoricalResultsController: 'historicalResults',
  StatisticsController: 'statistics',
  GoogleController: 'integrations',
  AssistantController: 'assistant',
  AuthController: 'users',
};

function actionFor(request: Request): PermissionAction {
  const method = request.method.toUpperCase();
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

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<
      Array<'ADMIN' | 'JUDGE' | 'PARTICIPANT'>
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
      const module = controllerModule(context);
      const action = actionFor(request);
      // A judge may enter results, but cannot edit or delete them, even if a
      // custom permission matrix accidentally grants those actions.
      if (request.user.role === 'JUDGE' && module === 'results' && (action === 'update' || action === 'delete')) {
        throw new ForbiddenException('Судья не может изменять или удалять результаты');
      }
      const role = await this.prisma.role.findUnique({
        where: { id: request.user.customRoleId },
        select: { permissions: true },
      });
      if (!role || !hasPermission(role.permissions as PermissionMap, module, action)) {
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
