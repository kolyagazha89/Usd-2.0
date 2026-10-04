import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  Req,
  Res,
} from '@nestjs/common';

import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';

import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { ChangeEmailDto, EmailDto, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  private setRefreshCookie(
    response: Response,
    refreshToken: string,
  ) {
    const secure =
      process.env.AUTH_COOKIE_SECURE ===
      'true';

    const sameSite =
      secure
        ? ('none' as const)
        : ('lax' as const);

    response.cookie(
      process.env.AUTH_COOKIE_NAME ??
        'usd_refresh_token',
      refreshToken,
      {
        httpOnly: true,
        secure,
        sameSite,
        path: '/auth',
        maxAge:
          Number(
            process.env.JWT_REFRESH_EXPIRES_IN_DAYS ??
              30,
          ) *
          24 *
          60 *
          60 *
          1000,
      },
    );
  }

  private clearRefreshCookie(
    response: Response,
  ) {
    const secure =
      process.env.AUTH_COOKIE_SECURE ===
      'true';

    const sameSite =
      secure
        ? ('none' as const)
        : ('lax' as const);

    response.cookie(
      process.env.AUTH_COOKIE_NAME ??
        'usd_refresh_token',
      '',
      {
        httpOnly: true,
        secure,
        sameSite,
        path: '/auth',
        maxAge: 0,
      },
    );
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body()
    body: RegisterDto,
  ) {
    return this.authService.register(
      body.email,
      body.password,
    );
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('verify-email')
  async verifyEmail(
    @Body()
    body: TokenDto,
  ) {
    return this.authService.verifyEmail(
      body.token,
    );
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('resend-verification')
  async resendVerificationEmail(
    @Body()
    body: EmailDto,
  ) {
    return this.authService.resendVerificationEmail(
      body.email,
    );
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  async login(
    @Body()
    body: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const result =
      await this.authService.login(
        body.email,
        body.password,
        request.headers['user-agent'],
        request.ip,
      );

    this.setRefreshCookie(
      response,
      result.refreshToken,
    );

    const {
      refreshToken,
      ...publicResult
    } = result;

    return publicResult;
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const cookieName =
      process.env.AUTH_COOKIE_NAME ??
      'usd_refresh_token';

    const refreshToken =
      request.cookies?.[cookieName];

    const result =
      await this.authService.refresh(
        refreshToken,
      );

    this.setRefreshCookie(
      response,
      result.refreshToken,
    );

    const {
      refreshToken: _refreshToken,
      ...publicResult
    } = result;

    return publicResult;
  }

  @Public()
  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true })
    response: Response,
  ) {
    const cookieName =
      process.env.AUTH_COOKIE_NAME ??
      'usd_refresh_token';

    const refreshToken =
      request.cookies?.[cookieName];

    await this.authService.logout(
      refreshToken,
    );

    this.clearRefreshCookie(
      response,
    );

    return {
      success: true,
    };
  }

  @Post('request-email-change')
  async requestEmailChange(
    @Req() request: Request,
    @Body() body: ChangeEmailDto,
  ) {
    return this.authService.requestEmailChange(
      (request as Request & { user: { sub: string } }).user.sub,
      body.email,
      body.currentPassword,
    );
  }

  @Public()
  @Post('confirm-email-change')
  async confirmEmailChange(@Body() body: TokenDto) {
    return this.authService.confirmEmailChange(body.token);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('forgot-password')
  async forgotPassword(
    @Body()
    body: EmailDto,
  ) {
    return this.authService.requestPasswordReset(
      body.email,
    );
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(
    @Body()
    body: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(
      body.token,
      body.password,
    );
  }

    @Get('me')
  me(@Req() request: Request) {
    return (request as Request & { user: { sub: string; email: string; role: string; participantId?: string } }).user;
  }

  @Get('sessions')
  async sessions(@Req() request: Request) {
    return this.authService.listSessions((request as Request & { user: { sub: string } }).user.sub);
  }

  @Post('sessions/:sessionId/revoke')
  async revokeSession(@Req() request: Request, @Param('sessionId') sessionId: string) {
    return this.authService.revokeSession((request as Request & { user: { sub: string } }).user.sub, sessionId);
  }

  @Post('sessions/revoke-all')
  async revokeAllSessions(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.revokeAllSessions((request as Request & { user: { sub: string } }).user.sub);
    this.clearRefreshCookie(response);
    return result;
  }
}