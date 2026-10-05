import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';

import type { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { Roles } from './roles.decorator';
import { Public } from './public.decorator';
import { AdminCreateUserDto, AdminUserActiveDto, AdminUserRoleDto, ChangeEmailDto, ChangePasswordDto, EmailDto, LoginDto, RegisterDto, ResetPasswordDto, TokenDto } from './dto/auth.dto';

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

  @Post('profile/historical-candidates')
  async historicalProfileCandidates(
    @Req() request: Request,
    @Body() body: { fullName?: string },
  ) {
    const userId = (request as Request & { user: { sub: string } }).user.sub;
    return this.authService.findHistoricalProfileCandidates(
      userId,
      body.fullName ?? '',
    );
  }

  @Post('profile/link-historical')
  async linkHistoricalProfile(
    @Req() request: Request,
    @Body() body: { participantId?: string },
  ) {
    const userId = (request as Request & { user: { sub: string } }).user.sub;
    return this.authService.linkHistoricalProfile(
      userId,
      body.participantId ?? '',
    );
  }


  @Post('change-password')
  async changePassword(
    @Req() request: Request,
    @Body() body: ChangePasswordDto,
  ) {
    const userId = (request as Request & { user: { sub: string } }).user.sub;
    return this.authService.changePassword(
      userId,
      body.currentPassword,
      body.newPassword,
    );
  }

  @Roles('ADMIN')
  @Get('admin/users')
  async adminListUsers(
    @Query('search') search?: string,
    @Query('role') role?: 'ADMIN' | 'JUDGE' | 'PARTICIPANT',
  ) {
    return this.authService.adminListUsers(search, role);
  }

  @Get('sessions')
  async listSessions(@Req() request: Request) {
    const userId = (request as Request & { user: { sub: string } }).user.sub;
    return this.authService.listMySessions(userId);
  }

  @Delete('sessions/:sessionId')
  async revokeSession(
    @Req() request: Request,
    @Param('sessionId') sessionId: string,
  ) {
    const userId = (request as Request & { user: { sub: string } }).user.sub;
    return this.authService.revokeMySession(userId, sessionId);
  }

  @Delete('sessions')
  async revokeAllSessions(@Req() request: Request) {
    const userId = (request as Request & { user: { sub: string } }).user.sub;
    return this.authService.revokeAllMySessions(userId);
  }

  @Roles('ADMIN')
  @Get('admin/users/:userId')
  async adminGetUser(@Param('userId') userId: string) {
    return this.authService.adminGetUser(userId);
  }

  @Roles('ADMIN')
  @Post('admin/users')
  async adminCreateUser(
    @Req() request: Request,
    @Body() body: AdminCreateUserDto,
  ) {
    const actor = (request as Request & { user: { sub: string } }).user.sub;
    return this.authService.adminCreateUser(
      body.email,
      body.password,
      body.role,
      actor,
      request.ip,
    );
  }

  @Roles('ADMIN')
  @Patch('admin/users/:userId/active')
  async adminSetActive(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Body() body: AdminUserActiveDto,
  ) {
    const actor = (request as Request & { user: { sub: string } }).user.sub;
    return this.authService.adminSetActive(userId, body.active, actor, request.ip);
  }

  @Roles('ADMIN')
  @Patch('admin/users/:userId/role')
  async adminSetRole(
    @Req() request: Request,
    @Param('userId') userId: string,
    @Body() body: AdminUserRoleDto,
  ) {
    const actor = (request as Request & { user: { sub: string } }).user.sub;
    return this.authService.adminSetRole(userId, body.role, actor, request.ip);
  }

  @Roles('ADMIN')
  @Get('admin/users/:userId/sessions')
  async listUserSessions(@Param('userId') userId: string) {
    return this.authService.listUserSessions(userId);
  }

  @Roles('ADMIN')
  @Delete('admin/users/:userId/sessions/:sessionId')
  async revokeUserSession(
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.revokeUserSession(userId, sessionId);
  }

  @Roles('ADMIN')
  @Delete('admin/users/:userId/sessions')
  async revokeAllUserSessions(@Param('userId') userId: string) {
    return this.authService.revokeAllUserSessions(userId);
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
    return (request as Request & {
      user: {
        sub: string;
        email: string;
        role: string;
      };
    }).user;
  }
}