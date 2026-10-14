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
  ) {
    const normalizedEmail =
      email.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new BadRequestException(
        'Email обязателен',
      );
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
        ? 'Аккаунт создан. Проверьте почту и подтвердите email перед входом.'
        : 'Аккаунт создан, но письмо не отправилось. Проверьте адрес и запросите письмо повторно.',
    };
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
      message: 'Запрос обработан. Если письмо не придёт в течение нескольких минут, проверьте папку «Спам» или попробуйте позже.',
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
        where: {
          email: normalizedEmail,
        },
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
            include: { user: true },
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

    const participants = await this.prisma.participant.findMany({
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
      take: 5000,
    });

    const candidates = participants.filter((participant) => {
      if (participant.user) return false;
      const candidate = this.normalizeProfileName(
        [participant.lastName, participant.firstName, participant.middleName]
          .filter(Boolean)
          .join(' '),
      );
      const candidateWithoutMiddle = this.normalizeProfileName(
        [participant.lastName, participant.firstName].join(' '),
      );
      return candidate === normalizedInput || candidateWithoutMiddle === normalizedInput;
    });

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
    return { success: true, message: 'Письмо для подтверждения нового email отправлено.' };
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
          'Если аккаунт существует, письмо восстановления будет отправлено.',
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

    await this.mailService.sendPasswordResetEmail(
      user.email,
      rawToken,
    );

    return {
      success: true,
      message:
        'Если аккаунт существует, письмо восстановления будет отправлено.',
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