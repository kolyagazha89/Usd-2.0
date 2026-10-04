import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CompetitionRecalculationService } from './competition-recalculation.service';

type DisqualificationScope =
  | 'STAGE'
  | 'SEASON'
  | 'FORMAT';

type DisqualificationStatus =
  | 'ACTIVE'
  | 'REVOKED';

@Injectable()
export class DisqualificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly competitionRecalculationService: CompetitionRecalculationService,
  ) {}

  /**
   * Создание дисквалификации.
   *
   * STAGE:
   *   stageId обязателен.
   *
   * SEASON:
   *   seasonId обязателен.
   *
   * FORMAT:
   *   stageId и seasonId запрещены.
   */
  async create(body: {
    participantId: string;
    scope: DisqualificationScope;
    stageId?: string;
    seasonId?: string;
    reason: string;
    issuedByUserId: string;
  }) {
    const reason = body.reason?.trim();

    if (!reason) {
      throw new BadRequestException(
        'Причина дисквалификации обязательна',
      );
    }

    if (!body.issuedByUserId) {
      throw new BadRequestException(
        'Не указан пользователь, выдавший дисквалификацию',
      );
    }

    if (!body.participantId) {
      throw new BadRequestException(
        'Не указан участник',
      );
    }

    const participant =
      await this.prisma.participant.findUnique({
        where: {
          id: body.participantId,
        },
      });

    if (!participant) {
      throw new NotFoundException(
        'Участник не найден',
      );
    }

    const issuer =
      await this.prisma.user.findUnique({
        where: {
          id: body.issuedByUserId,
        },
      });

    if (!issuer) {
      throw new NotFoundException(
        'Пользователь не найден',
      );
    }

    if (!issuer.isActive) {
      throw new ConflictException(
        'Пользователь деактивирован',
      );
    }

    if (issuer.role !== 'ADMIN') {
      throw new ConflictException(
        'Только ADMIN может выдавать дисквалификацию',
      );
    }

    if (body.scope === 'STAGE') {
      if (!body.stageId) {
        throw new BadRequestException(
          'Для дисквалификации STAGE необходимо указать stageId',
        );
      }

      if (body.seasonId) {
        throw new BadRequestException(
          'Для STAGE нельзя указывать seasonId',
        );
      }

      const stage =
        await this.prisma.stage.findUnique({
          where: {
            id: body.stageId,
          },
        });

      if (!stage) {
        throw new NotFoundException(
          'Этап не найден',
        );
      }
    }

    if (body.scope === 'SEASON') {
      if (!body.seasonId) {
        throw new BadRequestException(
          'Для дисквалификации SEASON необходимо указать seasonId',
        );
      }

      if (body.stageId) {
        throw new BadRequestException(
          'Для SEASON нельзя указывать stageId',
        );
      }

      const season =
        await this.prisma.season.findUnique({
          where: {
            id: body.seasonId,
          },
        });

      if (!season) {
        throw new NotFoundException(
          'Сезон не найден',
        );
      }
    }

    if (body.scope === 'FORMAT') {
      if (body.stageId || body.seasonId) {
        throw new BadRequestException(
          'Для FORMAT нельзя указывать stageId или seasonId',
        );
      }
    }

    const existing =
      await this.prisma.disqualification.findFirst({
        where: {
          participantId: body.participantId,
          scope: body.scope,
          status: 'ACTIVE',
          ...(body.scope === 'STAGE'
            ? {
                stageId: body.stageId,
              }
            : {}),
          ...(body.scope === 'SEASON'
            ? {
                seasonId: body.seasonId,
              }
            : {}),
        },
      });

    if (existing) {
      throw new ConflictException(
        'Для участника уже существует активная дисквалификация такого типа',
      );
    }

    const disqualification =
      await this.prisma.disqualification.create({
        data: {
          participantId: body.participantId,
          scope: body.scope,
          status: 'ACTIVE',
          stageId: body.stageId ?? null,
          seasonId: body.seasonId ?? null,
          reason,
          issuedByUserId: body.issuedByUserId,
        },
        include: this.detailInclude(),
      });

    /*
     * Дисквалификация начинает действовать сразу.
     *
     * Поэтому после её создания пересчитываем:
     * - ranking;
     * - текущие рекорды.
     */
    await this.competitionRecalculationService
      .recalculateForDisqualification(
        disqualification.scope,
        disqualification.stageId,
        disqualification.seasonId,
      );

    return disqualification;
  }

  /**
   * Получение списка дисквалификаций.
   */
  async findAll(filters?: {
    participantId?: string;
    scope?: DisqualificationScope;
    status?: DisqualificationStatus;
    stageId?: string;
    seasonId?: string;
    search?: string;
  }) {
    const search = filters?.search?.trim();

    return this.prisma.disqualification.findMany({
      where: {
        ...(filters?.participantId
          ? {
              participantId:
                filters.participantId,
            }
          : {}),
        ...(filters?.scope
          ? {
              scope: filters.scope,
            }
          : {}),
        ...(filters?.status
          ? {
              status: filters.status,
            }
          : {}),
        ...(filters?.stageId
          ? {
              stageId: filters.stageId,
            }
          : {}),
        ...(filters?.seasonId
          ? {
              seasonId: filters.seasonId,
            }
          : {}),
        ...(search
          ? {
              OR: [
                {
                  reason: {
                    contains: search,
                    mode: 'insensitive',
                  },
                },
                {
                  participant: {
                    fullName: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
                {
                  participant: {
                    team: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            }
          : {}),
      },
      include: this.detailInclude(),
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const disqualification =
      await this.prisma.disqualification.findUnique({
        where: {
          id,
        },
        include: this.detailInclude(),
      });

    if (!disqualification) {
      throw new NotFoundException(
        'Дисквалификация не найдена',
      );
    }

    return disqualification;
  }

  /**
   * Возвращает активные дисквалификации,
   * действующие для участника на конкретном этапе.
   */
  async getActiveForParticipantAtStage(
    participantId: string,
    stageId: string,
  ) {
    const stage =
      await this.prisma.stage.findUnique({
        where: {
          id: stageId,
        },
        select: {
          id: true,
          seasonId: true,
        },
      });

    if (!stage) {
      throw new NotFoundException(
        'Этап не найден',
      );
    }

    return this.prisma.disqualification.findMany({
      where: {
        participantId,
        status: 'ACTIVE',
        OR: [
          {
            scope: 'FORMAT',
          },
          {
            scope: 'SEASON',
            seasonId: stage.seasonId,
          },
          {
            scope: 'STAGE',
            stageId: stage.id,
          },
        ],
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Проверяет запрет участия.
   */
  async assertParticipantCanRegister(
    participantId: string,
    stageId: string,
  ) {
    const active =
      await this.getActiveForParticipantAtStage(
        participantId,
        stageId,
      );

    if (!active.length) {
      return {
        allowed: true,
        disqualifications: [],
      };
    }

    const format = active.find(
      (item) => item.scope === 'FORMAT',
    );

    if (format) {
      throw new ConflictException({
        message:
          'Участник не может зарегистрироваться: действует дисквалификация FORMAT',
        code:
          'PARTICIPANT_FORMAT_DISQUALIFIED',
        disqualificationId: format.id,
      });
    }

    const season = active.find(
      (item) => item.scope === 'SEASON',
    );

    if (season) {
      throw new ConflictException({
        message:
          'Участник не может зарегистрироваться: действует дисквалификация SEASON на этот сезон',
        code:
          'PARTICIPANT_SEASON_DISQUALIFIED',
        disqualificationId: season.id,
      });
    }

    const stage = active.find(
      (item) => item.scope === 'STAGE',
    );

    if (stage) {
      throw new ConflictException({
        message:
          'Участник не может зарегистрироваться: действует дисквалификация STAGE на этот этап',
        code:
          'PARTICIPANT_STAGE_DISQUALIFIED',
        disqualificationId: stage.id,
      });
    }

    throw new ConflictException(
      'Участник не может зарегистрироваться',
    );
  }

  /**
   * Проверяет, исключён ли результат.
   */
  async isResultDisqualified(
    resultId: string,
  ) {
    const result =
      await this.prisma.result.findUnique({
        where: {
          id: resultId,
        },
        select: {
          id: true,
          registration: {
            select: {
              participantId: true,
              stageId: true,
              stage: {
                select: {
                  seasonId: true,
                },
              },
            },
          },
        },
      });

    if (!result) {
      throw new NotFoundException(
        'Результат не найден',
      );
    }

    const active =
      await this.prisma.disqualification.findMany({
        where: {
          participantId:
            result.registration.participantId,
          status: 'ACTIVE',
          OR: [
            {
              scope: 'FORMAT',
            },
            {
              scope: 'SEASON',
              seasonId:
                result.registration.stage
                  .seasonId,
            },
            {
              scope: 'STAGE',
              stageId:
                result.registration.stageId,
            },
          ],
        },
      });

    return active.length > 0;
  }

  /**
   * Возвращает активные дисквалификации,
   * исключающие результат.
   */
  async getResultDisqualifications(
    resultId: string,
  ) {
    const result =
      await this.prisma.result.findUnique({
        where: {
          id: resultId,
        },
        select: {
          id: true,
          registration: {
            select: {
              participantId: true,
              stageId: true,
              stage: {
                select: {
                  seasonId: true,
                },
              },
            },
          },
        },
      });

    if (!result) {
      throw new NotFoundException(
        'Результат не найден',
      );
    }

    return this.prisma.disqualification.findMany({
      where: {
        participantId:
          result.registration.participantId,
        status: 'ACTIVE',
        OR: [
          {
            scope: 'FORMAT',
          },
          {
            scope: 'SEASON',
            seasonId:
              result.registration.stage.seasonId,
          },
          {
            scope: 'STAGE',
            stageId:
              result.registration.stageId,
          },
        ],
      },
      include: this.detailInclude(),
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Отзыв дисквалификации.
   *
   * После REVOKED результат снова автоматически
   * участвует в ranking и рекордах.
   */
  async revoke(
    id: string,
    body: {
      revokedByUserId: string;
      revokeReason: string;
    },
  ) {
    const revokeReason =
      body.revokeReason?.trim();

    if (!revokeReason) {
      throw new BadRequestException(
        'Причина отмены дисквалификации обязательна',
      );
    }

    const revokedBy =
      await this.prisma.user.findUnique({
        where: {
          id: body.revokedByUserId,
        },
      });

    if (!revokedBy) {
      throw new NotFoundException(
        'Пользователь не найден',
      );
    }

    if (!revokedBy.isActive) {
      throw new ConflictException(
        'Пользователь деактивирован',
      );
    }

    if (revokedBy.role !== 'ADMIN') {
      throw new ConflictException(
        'Только ADMIN может отменять дисквалификацию',
      );
    }

    const existing =
      await this.prisma.disqualification.findUnique({
        where: {
          id,
        },
      });

    if (!existing) {
      throw new NotFoundException(
        'Дисквалификация не найдена',
      );
    }

    if (existing.status === 'REVOKED') {
      throw new ConflictException(
        'Дисквалификация уже отменена',
      );
    }

    const revoked =
      await this.prisma.disqualification.update({
        where: {
          id,
        },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
          revokedByUserId:
            body.revokedByUserId,
          revokeReason,
        },
        include: this.detailInclude(),
      });

    /*
     * После REVOKED результат снова становится
     * допустимым. Пересчитываем ranking и records.
     */
    await this.competitionRecalculationService
      .recalculateForDisqualification(
        revoked.scope,
        revoked.stageId,
        revoked.seasonId,
      );

    return revoked;
  }

  private detailInclude() {
    return {
      participant: {
        select: {
          id: true,
          fullName: true,
          team: true,
          photoUrl: true,
        },
      },
      stage: {
        select: {
          id: true,
          stageNumber: true,
          name: true,
          city: true,
          date: true,
          seasonId: true,
        },
      },
      season: {
        select: {
          id: true,
          name: true,
          year: true,
        },
      },
      issuedByUser: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
      revokedByUser: {
        select: {
          id: true,
          name: true,
          role: true,
        },
      },
    };
  }
}