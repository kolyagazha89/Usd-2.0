
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { AuthenticatedRequest } from './authenticated-request';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization) throw new UnauthorizedException('Требуется авторизация');

    const [type, token, ...extra] = authorization.split(' ');
    if (type !== 'Bearer' || !token || extra.length > 0) {
      throw new UnauthorizedException('Некорректный Authorization header');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub?: string }>(token, {
        issuer: process.env.JWT_ISSUER ?? 'usd-2.0-api',
        audience: process.env.JWT_AUDIENCE ?? 'usd-2.0-client',
      });
      if (!payload.sub) throw new UnauthorizedException('Некорректный JWT');

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          participantId: true,
          emailVerifiedAt: true,
        },
      });

      if (!user || !user.isActive || !user.emailVerifiedAt) {
        throw new UnauthorizedException('Пользователь неактивен или email не подтверждён');
      }

      request.user = {
        sub: user.id,
        email: user.email,
        role: user.role,
        participantId: user.participantId ?? undefined,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Недействительный или просроченный токен');
    }
  }
}
