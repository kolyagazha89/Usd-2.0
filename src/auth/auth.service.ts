import {
  BadRequestException,
  ConflictException,
  Injectable,
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
    name: string,
  ) {
    const normalizedEmail =
      email.trim().toLowerCase();

    const normalizedName =
      name.trim();

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

    if (!normalizedName) {
      throw new BadRequestException(
        'Имя обязательно',
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

    const user =
      await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: normalizedName,
          role: 'PARTICIPANT',
          isActive: true,
        },
      });

    const rawToken =
      this.generateToken();

    const tokenHash =
      this.hashToken(rawToken);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(
          Date.now() +
            24 * 60 * 60 * 1000,
        ),
      },
    });

    try {
      await this.mailService.sendVerificationEmail(
        user.email,
        rawToken,
      );
    } catch (error) {
      await this.prisma.emailVerificationToken.deleteMany({
        where: {
          userId: user.id,
          tokenHash,
        },
      });

      await this.prisma.user.delete({
        where: {
          id: user.id,
        },
      });

      throw error;
    }

    return {
      success: true,
      message:
        'Регистрация выполнена. Проверьте email для подтверждения аккаунта.',
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
    const normalizedEmail =
      email.trim().toLowerCase();

    const user =
      await this.prisma.user.findUnique({
        where: {
          email: normalizedEmail,
        },
      });

    /*
     * Не раскрываем существование аккаунта.
     */
    if (
      !user ||
      user.emailVerifiedAt
    ) {
      return {
        success: true,
        message:
          'Если аккаунт существует и требует подтверждения, письмо будет отправлено.',
      };
    }

    await this.prisma.emailVerificationToken.deleteMany({
      where: {
        userId: user.id,
      },
    });

    const rawToken =
      this.generateToken();

    await this.prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash:
          this.hashToken(rawToken),
        expiresAt: new Date(
          Date.now() +
            24 * 60 * 60 * 1000,
        ),
      },
    });

    await this.mailService.sendVerificationEmail(
      user.email,
      rawToken,
    );

    return {
      success: true,
      message:
        'Если аккаунт требует подтверждения, новое письмо отправлено.',
    };
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