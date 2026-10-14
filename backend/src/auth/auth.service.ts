import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  private hashToken(
    token: string,
  ): string {
    return crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private async createAccessToken(
    user: {
      id: string;
      email: string;
      role: string;
    },
  ): Promise<string> {
    return this.jwtService.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      {
        issuer: process.env.JWT_ISSUER ?? 'usd-2.0-api',
        audience: process.env.JWT_AUDIENCE ?? 'usd-2.0-client',
        expiresIn: '15m',
      },
    );
  }

  private getRefreshExpiration(): Date {
    const days = Number(
      process.env.JWT_REFRESH_EXPIRES_IN_DAYS ?? 30,
    );

    return new Date(
      Date.now() +
        days * 24 * 60 * 60 * 1000,
    );
  }

  async register(
    email: string,
    password: string,
    privacyConsent: boolean,
    termsAccepted: boolean,
    newsletterOptIn = false,
  ) {
    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new BadRequestException(
        'Email обязателен',
      );
    }

    if (termsAccepted !== true) {
      throw new BadRequestException('Необходимо принять пользовательское соглашение');
    }

    if (privacyConsent !== true) {
      throw new BadRequestException('Необходимо подтвердить согласие на обработку персональных данных');
    }

    if (normalizedPasswordInvalid(password)) {
      throw new BadRequestException(
        'Пароль должен содержать минимум 8 символов',
      );
    }

    const existingUser =
      await this.prisma.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });

    if (existingUser) {
      throw new ConflictException(
        'Пользователь с таким email уже существует',
      );
    }

    const passwordHash =
      await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: null,
        role: 'PARTICIPANT',
        isActive: true,
        privacyConsentAt: new Date(),
        privacyConsentVersion: 'privacy-v1',
        termsAcceptedAt: new Date(),
        termsVersion: 'terms-v1',
        ...(newsletterOptIn ? { newsletterConsentAt: new Date(), newsletterConsentVersion: 'newsletter-v1' } : {}),
      },
    });

    const rawToken = this.generateToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    let emailSent = true;
    try {
      await this.mailService.sendVerificationEmail(user.email, rawToken);
    } catch {
      // Keep the pending account so the user can request another message.
      emailSent = false;
    }

    return {
      success: true,
      emailSent,
      message: emailSent
        ? 'Аккаунт создан. Почтовый провайдер принял запрос, но фактическая доставка письма не подтверждена. Проверьте папку «Спам». Если письма нет, настройку почты нужно проверить.'
        : 'Аккаунт создан, но письмо не отправилось. Проверьте адрес и запросите письмо повторно.',
    };
  }

  async getNewsletterConsent(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { newsletterConsentAt: true, newsletterConsentVersion: true, newsletterConsentRevokedAt: true } });
    if (!user) throw new NotFoundException('Пользователь не найден');
    return { consent: Boolean(user.newsletterConsentAt && !user.newsletterConsentRevokedAt), version: user.newsletterConsentVersion };
  }

  async updateNewsletterConsent(userId: string, consent: boolean) {
    const now = new Date();
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: consent
        ? { newsletterConsentAt: now, newsletterConsentVersion: 'newsletter-v1', newsletterConsentRevokedAt: null }
        : { newsletterConsentRevokedAt: now },
      select: { newsletterConsentAt: true, newsletterConsentVersion: true, newsletterConsentRevokedAt: true },
    });
    await this.prisma.auditLog.create({
      data: { userId, action: consent ? 'NEWSLETTER_CONSENT_GRANTED' : 'NEWSLETTER_CONSENT_REVOKED', entity: 'User', entityId: userId, metadata: { version: 'newsletter-v1', source: 'account-settings' } },
    });
    return { success: true, consent: Boolean(updated.newsletterConsentAt && !updated.newsletterConsentRevokedAt), message: consent ? 'Согласие на новости сохранено' : 'Рассылка новостей отключена' };
  }

  async verifyEmail(
    token: string,
  ) {
    if (!token?.trim()) {
      throw new BadRequestException(
        'Токен подтверждения обязателен',
      );
    }

    const tokenHash =
      this.hashToken(token.trim());

    const verificationToken =
      await this.prisma.emailVerificationToken.findUnique({
        where: {
          tokenHash,
        },
        include: {
          user: true,
        },
      });

    if (
      !verificationToken ||
      verificationToken.usedAt
    ) {
      throw new BadRequestException(
        'Недействительный токен подтверждения',
      );
    }

    if (
      verificationToken.expiresAt <
      new Date()
    ) {
      throw new BadRequestException(
        'Срок действия токена подтверждения истёк',
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: verificationToken.userId,
        },
        data: {
          emailVerifiedAt: new Date(),
        },
      }),

      this.prisma.emailVerificationToken.update({
        where: {
          id: verificationToken.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),

      this.prisma.emailVerificationToken.deleteMany({
        where: {
          userId: verificationToken.userId,
          id: {
            not: verificationToken.id,
          },
        },
      }),
    ]);

    return {
      success: true,
      message: 'Email успешно подтверждён',
    };
  }

  async resendVerificationEmail(
    email: string,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    const genericResponse = {
      success: true,
      message: 'Запрос принят. Этот ответ не подтверждает доставку письма. Если письмо не придёт, проверьте папку «Спам» и попробуйте позже.',
    };

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    // Keep the response identical for missing, verified and rate-limited accounts.
    if (!user || user.emailVerifiedAt) return genericResponse;

    // Atomic per-account cooldown: concurrent requests cannot all pass this update.
    const now = new Date();
    const cutoff = new Date(now.getTime() - 60_000);
    const reservation = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        emailVerifiedAt: null,
        OR: [
          { lastVerificationResendAt: null },
          { lastVerificationResendAt: { lte: cutoff } },
        ],
      },
      data: { lastVerificationResendAt: now },
    });
    if (reservation.count !== 1) return genericResponse;

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'EMAIL_VERIFICATION_RESEND_REQUESTED',
        entity: 'User',
        entityId: user.id,
        metadata: { cooldownSeconds: 60 },
      },
    });

    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id },
    });

    const rawToken = this.generateToken();
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // The cooldown is reserved before sending, so provider failures cannot be abused
    // to hammer the mail service. Keep the public response identical to avoid account
    // enumeration; the registration flow itself explicitly reports emailSent=false.
    try {
      await this.mailService.sendVerificationEmail(user.email, rawToken);
    } catch {
      try {
        await this.prisma.auditLog.create({
          data: {
            userId: user.id,
            action: 'EMAIL_VERIFICATION_RESEND_FAILED',
            entity: 'User',
            entityId: user.id,
            metadata: { failureCode: 'SMTP_SEND_FAILED' },
          },
        });
      } catch {
        // Never expose provider/database diagnostics through this public endpoint.
      }
    }

    return genericResponse;
  }

  async login(
    email: string,
    password: string,
    userAgent?: string,
    ipAddress?: string,
  ) {
    const normalizedEmail =
      email.trim().toLowerCase();

    const user =
      await this.prisma.user.findUnique({
        where: { email: normalizedEmail },
        include: { customRole: { select: { id: true, key: true, name: true, permissions: true } } },
      });

    if (
      !user ||
      !user.isActive
    ) {
      throw new UnauthorizedException(
        'Неверный email или пароль',
      );
    }

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException(
        'Email не подтверждён',
      );
    }

    const passwordValid =
      await bcrypt.compare(
        password,
        user.passwordHash,
      );

    if (!passwordValid) {
      throw new UnauthorizedException(
        'Неверный email или пароль',
      );
    }

    const accessToken =
      await this.createAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

    const refreshToken =
      this.generateToken();

    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        familyId: crypto.randomUUID(),
        tokenHash:
          this.hashToken(refreshToken),
        userAgent:
          userAgent?.slice(0, 1000),
        ipAddress:
          ipAddress?.slice(0, 100),
        expiresAt:
          this.getRefreshExpiration(),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        emailVerifiedAt:
          user.emailVerifiedAt,
        participantId:
          user.participantId,
        customRoleId: user.customRoleId,
        customRole: user.customRole,
      },
    };
  }

  async refresh(
    refreshToken: string,
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException(
        'Refresh token отсутствует',
      );
    }

    const tokenHash = this.hashToken(refreshToken);

    const newRefreshToken = this.generateToken();
    const newRefreshTokenHash = this.hashToken(newRefreshToken);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const session =
          await tx.refreshSession.findUnique({
            where: { tokenHash },
            include: { user: { include: { customRole: { select: { id: true, key: true, name: true, permissions: true } } } } },
          });

        if (!session) {
          throw new UnauthorizedException(
            'Недействительная refresh-сессия',
          );
        }

        if (session.revokedAt) {
          await tx.refreshSession.updateMany({
            where: {
              familyId: session.familyId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });

          throw new UnauthorizedException(
            'Обнаружено повторное использование refresh token',
          );
        }

        if (
          session.expiresAt < new Date() ||
          !session.user.isActive ||
          !session.user.emailVerifiedAt
        ) {
          throw new UnauthorizedException(
            'Недействительная refresh-сессия',
          );
        }

        /*
         * Атомарно помечаем исходный токен отозванным.
         * Если два запроса одновременно используют один token,
         * только один получит count=1. Второй считается replay
         * и закрывает всю семью refresh-сессий.
         */
        const revoked = await tx.refreshSession.updateMany({
          where: {
            id: session.id,
            revokedAt: null,
          },
          data: {
            revokedAt: new Date(),
          },
        });

        if (revoked.count !== 1) {
          await tx.refreshSession.updateMany({
            where: {
              familyId: session.familyId,
              revokedAt: null,
            },
            data: {
              revokedAt: new Date(),
            },
          });

          throw new UnauthorizedException(
            'Обнаружено повторное использование refresh token',
          );
        }

        await tx.refreshSession.create({
          data: {
            userId: session.user.id,
            familyId: session.familyId,
            tokenHash: newRefreshTokenHash,
            userAgent: session.userAgent,
            ipAddress: session.ipAddress,
            expiresAt: this.getRefreshExpiration(),
          },
        });

        return session.user;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    const newAccessToken = await this.createAccessToken({
      id: result.id,
      email: result.email,
      role: result.role,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: result.id,
        email: result.email,
        name: result.name,
        role: result.role,
        emailVerifiedAt: result.emailVerifiedAt,
        participantId: result.participantId,
        customRoleId: result.customRoleId,
        customRole: result.customRole,
      },
    };
  }

  async findHistoricalProfileCandidates(userId: string, fullName: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, participantId: true, role: true },
    });
    if (!user || user.role !== 'PARTICIPANT') {
      throw new UnauthorizedException('Недействительная учётная запись');
    }
    if (user.participantId) {
      throw new ConflictException('Профиль участника уже привязан к аккаунту');
    }

    const normalizedInput = this.normalizeProfileName(fullName);
    if (!normalizedInput) {
      throw new BadRequestException('ФИО обязательно');
    }

    // Search by any part of the name, not only an exact full-name match.
    // Requiring every token to match one of the name fields supports both
    // "Иван" and multi-part queries such as "Иванов Иван", in any order.
    const searchTokens = normalizedInput.split(' ').filter(Boolean);
    const participants = await this.prisma.participant.findMany({
      where: {
        user: { is: null },
        AND: searchTokens.map((token) => ({
          OR: [
            { lastName: { contains: token, mode: 'insensitive' as const } },
            { firstName: { contains: token, mode: 'insensitive' as const } },
            { middleName: { contains: token, mode: 'insensitive' as const } },
          ],
        })),
      },
      orderBy: [
        { lastName: 'asc' },
        { firstName: 'asc' },
        { middleName: 'asc' },
      ],
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        team: true,
        city: true,
        user: { select: { id: true } },
        cars: {
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
          take: 3,
          select: {
            id: true,
            brand: true,
            model: true,
            registrationNumber: true,
          },
        },
        _count: { select: { registrations: true } },
      },
      take: 100,
    });

    const candidates = participants;

    /*
     * Исторический профиль нельзя привязать только по ФИО.
     * Это было бы IDOR/захватом чужой исторической сущности:
     * любой зарегистрированный PARTICIPANT мог бы подобрать UUID
     * незанятого профиля и привязать его к своему аккаунту.
     *
     * Для self-service привязки нужен дополнительный ownership proof:
     * legacy email участника должен совпадать с подтверждённым email аккаунта.
     * Профили без сохранённого legacy email привязываются только администратором.
     */
    const userEmail = user.email.trim().toLowerCase();
    const candidatesWithOwnership = await Promise.all(candidates.map(async (candidate) => {
      const legacyEmail = await this.prisma.participantLegacyEmail.findUnique({
        where: { participantId: candidate.id },
        select: { email: true },
      });
      const canSelfLink = Boolean(
        legacyEmail?.email &&
        legacyEmail.email.trim().toLowerCase() === userEmail
      );
      return { ...candidate, canSelfLink };
    }));

    return {
      success: true,
      found: candidatesWithOwnership.length,
      candidates: candidatesWithOwnership.map(({ user: _user, ...participant }) => participant),
    };
  }

  async linkHistoricalProfile(userId: string, participantId: string) {
    if (!participantId?.trim()) {
      throw new BadRequestException('participantId обязателен');
    }

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, participantId: true, role: true },
      });
      if (!user || user.role !== 'PARTICIPANT') {
        throw new UnauthorizedException('Недействительная учётная запись');
      }
      if (user.participantId && user.participantId !== participantId) {
        throw new ConflictException('У аккаунта уже есть профиль участника');
      }
      if (user.participantId === participantId) {
        return { success: true, linked: true, participantId };
      }

      const participant = await tx.participant.findUnique({
        where: { id: participantId },
        select: { id: true, user: { select: { id: true } } },
      });
      const legacyEmail = await tx.participantLegacyEmail.findUnique({
        where: { participantId },
        select: { email: true },
      });
      if (
        !legacyEmail?.email ||
        legacyEmail.email.trim().toLowerCase() !== user.email.trim().toLowerCase()
      ) {
        throw new ForbiddenException(
          'Нельзя самостоятельно привязать этот исторический профиль',
        );
      }
      if (!participant) {
        throw new NotFoundException('Исторический профиль не найден');
      }
      if (participant.user) {
        throw new ConflictException('Этот исторический профиль уже связан с другим аккаунтом');
      }

      await tx.user.update({
        where: { id: userId },
        data: { participantId: participant.id },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: 'PARTICIPANT_PROFILE_LINKED',
          entity: 'Participant',
          entityId: participant.id,
          metadata: { source: 'HISTORICAL_MATCH' },
        },
      });

      return { success: true, linked: true, participantId: participant.id };
    });
  }

  private normalizeProfileName(value: string) {
    return String(value ?? '')
      .normalize('NFKC')
      .replace(/ё/gi, 'е')
      .replace(/[^a-zа-я0-9\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }


  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    if (normalizedPasswordInvalid(newPassword)) {
      throw new BadRequestException('Пароль должен содержать минимум 8 символов');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, isActive: true, emailVerifiedAt: true },
    });

    if (!user || !user.isActive || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Недействительная учётная запись');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Неверный текущий пароль');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return {
      success: true,
      message: 'Пароль изменён. Выполните вход заново на других устройствах.',
    };
  }

  private normalizeRolePermissions(input: unknown): Record<string, string[]> {
    const modules = new Set([
      'stages', 'seasons', 'registrations', 'inspections', 'results',
      'records', 'participants', 'teams', 'cars', 'classes', 'imports',
      'disqualifications', 'configurations', 'media', 'siteSettings',
      'historicalResults', 'statistics', 'integrations', 'assistant',
    ]);
    const actions = new Set(['view', 'create', 'update', 'delete']);
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Матрица прав должна быть объектом модулей и действий');
    }
    const normalized: Record<string, string[]> = {};
    for (const [module, rawActions] of Object.entries(input as Record<string, unknown>)) {
      if (!modules.has(module)) throw new BadRequestException(`Неизвестный модуль прав: ${module}`);
      if (!Array.isArray(rawActions) || rawActions.some((action) => typeof action !== 'string' || !actions.has(action))) {
        throw new BadRequestException(`Для модуля ${module} разрешены только view/create/update/delete`);
      }
      normalized[module] = [...new Set(rawActions as string[])];
    }
    return normalized;
  }

  async adminListRoles() {
    return this.prisma.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      select: {
        id: true, key: true, name: true, description: true,
        permissions: true, isSystem: true, createdAt: true, updatedAt: true,
        _count: { select: { users: true } },
      },
    });
  }

  async adminCreateRole(
    input: { key: string; name: string; description?: string | null; permissions: unknown },
    actorUserId: string,
    ipAddress?: string,
  ) {
    const key = input.key.trim().toLowerCase();
    const name = input.name.trim();
    if (!/^[a-z][a-z0-9-]{1,49}$/.test(key)) {
      throw new BadRequestException('Ключ роли: 2–50 символов, латиница, цифры и дефис; первый символ — буква');
    }
    if (!name || name.length > 100) throw new BadRequestException('Название роли обязательно и должно быть не длиннее 100 символов');
    const permissions = this.normalizeRolePermissions(input.permissions);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const role = await tx.role.create({
          data: { key, name, description: input.description?.trim() || null, permissions },
        });
        await tx.auditLog.create({
          data: { userId: actorUserId, action: 'ROLE_CREATED', entity: 'Role', entityId: role.id, ipAddress, metadata: { key, name } },
        });
        return role;
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002') {
        throw new ConflictException('Роль с таким ключом уже существует');
      }
      throw error;
    }
  }

  async adminUpdateRole(
    roleId: string,
    input: { name?: string; description?: string | null; permissions?: unknown },
    actorUserId: string,
    ipAddress?: string,
  ) {
    const current = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!current) throw new NotFoundException('Роль не найдена');
    if (current.isSystem) throw new ConflictException('Системную роль нельзя изменить');
    const data: { name?: string; description?: string | null; permissions?: Prisma.InputJsonValue } = {};
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name || name.length > 100) throw new BadRequestException('Название роли обязательно и должно быть не длиннее 100 символов');
      data.name = name;
    }
    if (input.description !== undefined) data.description = input.description?.trim() || null;
    if (input.permissions !== undefined) data.permissions = this.normalizeRolePermissions(input.permissions) as Prisma.InputJsonValue;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.role.update({ where: { id: roleId }, data });
      await tx.auditLog.create({
        data: { userId: actorUserId, action: 'ROLE_UPDATED', entity: 'Role', entityId: roleId, ipAddress, metadata: { changedFields: Object.keys(data) } },
      });
      return updated;
    });
  }

  async adminDeleteRole(roleId: string, actorUserId: string, ipAddress?: string) {
    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('Роль не найдена');
    if (role.isSystem) throw new ConflictException('Системную роль нельзя удалить');
    if (role._count.users > 0) throw new ConflictException('Нельзя удалить роль, назначенную пользователям. Сначала переназначьте пользователей.');
    await this.prisma.$transaction([
      this.prisma.role.delete({ where: { id: roleId } }),
      this.prisma.auditLog.create({
        data: { userId: actorUserId, action: 'ROLE_DELETED', entity: 'Role', entityId: roleId, ipAddress, metadata: { key: role.key, name: role.name } },
      }),
    ]);
    return { success: true };
  }

  async adminSetCustomRole(
    targetUserId: string,
    customRoleId: string | null,
    actorUserId: string,
    ipAddress?: string,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, customRoleId: true },
    });
    if (!target) throw new NotFoundException('Пользователь не найден');
    if (customRoleId) {
      const role = await this.prisma.role.findUnique({ where: { id: customRoleId }, select: { id: true } });
      if (!role) throw new NotFoundException('Пользовательская роль не найдена');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: targetUserId }, data: { customRoleId } }),
      this.prisma.refreshSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: actorUserId,
          action: 'USER_CUSTOM_ROLE_CHANGED',
          entity: 'User',
          entityId: targetUserId,
          ipAddress,
          metadata: { before: target.customRoleId, after: customRoleId },
        },
      }),
    ]);
    return this.adminGetUser(targetUserId);
  }

  async adminListUsers(search?: string, role?: 'ADMIN' | 'JUDGE' | 'PARTICIPANT') {
    return this.prisma.user.findMany({
      where: {
        ...(role ? { role } : {}),
        ...(search?.trim()
          ? { email: { contains: search.trim().toLowerCase(), mode: 'insensitive' } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
        participantId: true,
        customRoleId: true,
        customRole: { select: { id: true, key: true, name: true } },
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async adminGetUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        emailVerifiedAt: true,
        participantId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) throw new NotFoundException('Пользователь не найден');
    return user;
  }

  async adminCreateUser(
    email: string,
    password: string,
    role: 'ADMIN' | 'JUDGE' | 'PARTICIPANT',
    actorUserId: string,
    ipAddress?: string,
  ) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) throw new BadRequestException('Email обязателен');
    if (normalizedEmail.length > 254) throw new BadRequestException('Некорректный email');
    if (password.length < 12) throw new BadRequestException('Административный пароль должен содержать минимум 12 символов');

    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) throw new ConflictException('Пользователь с таким email уже существует');

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: null,
          role,
          isActive: true,
          emailVerifiedAt: new Date(),
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          emailVerifiedAt: true,
          participantId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actorUserId,
          action: 'USER_CREATED',
          entity: 'User',
          entityId: created.id,
          ipAddress,
          metadata: { email: created.email, role: created.role },
        },
      });

      return created;
    });

    return user;
  }

  async adminSetActive(
    targetUserId: string,
    active: boolean,
    actorUserId: string,
    ipAddress?: string,
  ) {
    if (targetUserId === actorUserId && !active) {
      throw new BadRequestException('Нельзя деактивировать собственную учётную запись');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, isActive: true },
    });
    if (!target) throw new NotFoundException('Пользователь не найден');

    if (!active && target.isActive && target.role === 'ADMIN') {
      const admins = await this.prisma.user.count({
        where: { role: 'ADMIN', isActive: true },
      });
      if (admins <= 1) {
        throw new ConflictException('Нельзя деактивировать последнего активного администратора');
      }
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetUserId },
        data: { isActive: active },
      }),
      ...(active
        ? []
        : [
            this.prisma.refreshSession.updateMany({
              where: { userId: targetUserId, revokedAt: null },
              data: { revokedAt: new Date() },
            }),
          ]),
      this.prisma.auditLog.create({
        data: {
          userId: actorUserId,
          action: active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
          entity: 'User',
          entityId: targetUserId,
          ipAddress,
          metadata: { active },
        },
      }),
    ]);

    return this.adminGetUser(targetUserId);
  }

  async adminSetRole(
    targetUserId: string,
    role: 'ADMIN' | 'JUDGE' | 'PARTICIPANT',
    actorUserId: string,
    ipAddress?: string,
  ) {
    if (targetUserId === actorUserId && role !== 'ADMIN') {
      throw new BadRequestException('Нельзя снять роль ADMIN с собственной учётной записи');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('Пользователь не найден');

    if (target.role === 'ADMIN' && role !== 'ADMIN') {
      const admins = await this.prisma.user.count({
        where: { role: 'ADMIN', isActive: true },
      });
      if (admins <= 1) {
        throw new ConflictException('Нельзя снять роль с последнего активного администратора');
      }
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetUserId },
        data: { role },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          userId: actorUserId,
          action: 'USER_ROLE_CHANGED',
          entity: 'User',
          entityId: targetUserId,
          ipAddress,
          metadata: { before: target.role, after: role },
        },
      }),
    ]);

    return this.adminGetUser(targetUserId);
  }

  async listMySessions(userId: string) {
    return this.prisma.refreshSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        familyId: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    });
  }

  async revokeMySession(userId: string, sessionId: string) {
    const result = await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count !== 1) {
      throw new BadRequestException('Сессия не найдена или уже завершена');
    }

    return { success: true };
  }

  async revokeAllMySessions(userId: string) {
    const result = await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true, revoked: result.count };
  }

  async listUserSessions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Пользователь не найден');
    }

    return this.prisma.refreshSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        familyId: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
      },
    });
  }

  async revokeUserSession(userId: string, sessionId: string) {
    const result = await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count !== 1) {
      throw new BadRequestException('Сессия не найдена или уже завершена');
    }

    return { success: true };
  }

  async revokeAllUserSessions(userId: string) {
    const result = await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { success: true, revoked: result.count };
  }

  async logout(
    refreshToken: string,
  ) {
    if (!refreshToken) {
      return {
        success: true,
      };
    }

    await this.prisma.refreshSession.updateMany({
      where: {
        tokenHash:
          this.hashToken(refreshToken),
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      success: true,
    };
  }

  async requestEmailChange(
    userId: string,
    newEmail: string,
    currentPassword: string,
  ) {
    const normalizedEmail = newEmail.trim().toLowerCase();
    if (!normalizedEmail || normalizedEmail.length > 254) {
      throw new BadRequestException('Некорректный новый email');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Недействительная учётная запись');
    }
    if (normalizedEmail === user.email) {
      throw new ConflictException('Новый email совпадает с текущим');
    }
    const passwordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Неверный текущий пароль');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
    if (existing) {
      throw new ConflictException('Этот email уже используется');
    }

    await this.prisma.emailChangeToken.deleteMany({ where: { userId } });
    const rawToken = this.generateToken();
    await this.prisma.emailChangeToken.create({
      data: {
        userId,
        newEmail: normalizedEmail,
        tokenHash: this.hashToken(rawToken),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    await this.mailService.sendEmailChangeEmail(normalizedEmail, rawToken);
    return { success: true, message: 'Почтовый провайдер принял запрос на письмо для подтверждения нового email, но фактическая доставка не подтверждена.' };
  }

  async confirmEmailChange(token: string) {
    if (!token?.trim()) throw new BadRequestException('Токен изменения email обязателен');
    const tokenHash = this.hashToken(token.trim());
    const change = await this.prisma.emailChangeToken.findUnique({ where: { tokenHash } });
    if (!change || change.usedAt || change.expiresAt < new Date()) {
      throw new BadRequestException('Недействительный или истёкший токен изменения email');
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email: change.newEmail }, select: { id: true } });
        if (existing && existing.id !== change.userId) {
          throw new ConflictException('Этот email уже используется');
        }
        await tx.user.update({ where: { id: change.userId }, data: { email: change.newEmail } });
        await tx.emailChangeToken.update({ where: { id: change.id }, data: { usedAt: new Date() } });
        await tx.emailChangeToken.deleteMany({ where: { userId: change.userId, id: { not: change.id } } });
        await tx.refreshSession.updateMany({ where: { userId: change.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw error;
    }

    return { success: true, message: 'Email успешно изменён. Выполните вход заново.' };
  }

  async requestPasswordReset(
    email: string,
  ) {
    const normalizedEmail =
      email.trim().toLowerCase();

    const user =
      await this.prisma.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });

    /*
     * Не раскрываем существование email.
     */
    if (
      !user ||
      !user.isActive ||
      !user.emailVerifiedAt
    ) {
      return {
        success: true,
        message:
          'Если аккаунт существует, запрос на восстановление обработан. Этот ответ не подтверждает доставку письма; проверьте папку «Спам» и попробуйте позже.',
      };
    }

    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
      },
    });

    const rawToken =
      this.generateToken();

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash:
          this.hashToken(rawToken),
        expiresAt: new Date(
          Date.now() +
            30 * 60 * 1000,
        ),
      },
    });

    try {
      await this.mailService.sendPasswordResetEmail(
        user.email,
        rawToken,
      );
    } catch {
      // Keep the response identical for known and unknown accounts.
      // MailService logs provider failures without exposing them to the caller.
    }

    return {
      success: true,
      message:
        'Если аккаунт существует, запрос на восстановление обработан. Этот ответ не подтверждает доставку письма; проверьте папку «Спам» и попробуйте позже.',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ) {
    if (!token?.trim()) {
      throw new BadRequestException(
        'Токен восстановления обязателен',
      );
    }

    if (
      normalizedPasswordInvalid(
        newPassword,
      )
    ) {
      throw new BadRequestException(
        'Пароль должен содержать минимум 8 символов',
      );
    }

    const tokenHash =
      this.hashToken(token.trim());

    const resetToken =
      await this.prisma.passwordResetToken.findUnique({
        where: {
          tokenHash,
        },
      });

    if (
      !resetToken ||
      resetToken.usedAt
    ) {
      throw new BadRequestException(
        'Недействительный токен восстановления',
      );
    }

    if (
      resetToken.expiresAt <
      new Date()
    ) {
      throw new BadRequestException(
        'Срок действия токена восстановления истёк',
      );
    }

    const passwordHash =
      await bcrypt.hash(
        newPassword,
        12,
      );

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: {
          id: resetToken.userId,
        },
        data: {
          passwordHash,
        },
      }),

      this.prisma.passwordResetToken.update({
        where: {
          id: resetToken.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),

      /*
       * После смены пароля закрываем все
       * старые авторизованные устройства.
       */
      this.prisma.refreshSession.updateMany({
        where: {
          userId: resetToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      }),

      this.prisma.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
          id: {
            not: resetToken.id,
          },
        },
      }),
    ]);

    return {
      success: true,
      message:
        'Пароль успешно изменён',
    };
  }
}

function normalizedPasswordInvalid(
  password: string,
): boolean {
  return (
    typeof password !== 'string' ||
    password.length < 8
  );
}