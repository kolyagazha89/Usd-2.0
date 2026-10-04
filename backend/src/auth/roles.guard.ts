import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import type { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<
      Array<'ADMIN' | 'JUDGE' | 'PARTICIPANT'>
    >(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!roles) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.user?.role || !roles.includes(request.user.role)) {
      throw new ForbiddenException('Недостаточно прав для выполнения операции');
    }
    return true;
  }
}
