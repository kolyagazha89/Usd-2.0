import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

type RegistrationSource =
  | 'PRE_REGISTRATION'
  | 'ON_SITE'
  | 'IMPORT';

type RegistrationStatus = 'ACTIVE' | 'CANCELLED';

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private readonly registrationInclude = {
    stage: {
      include: {
        season: true,
      },
    },
    participant: {
      select: {
        id: true,
        lastName: true,
        firstName: true,
        middleName: true,
        team: true,
        city: true,
        photoUrl: true,
      },
    },
    car: {
      select: {
        id: true,
        participantId: true,
        brand: true,
        model: true,
        registrationCountry: true,
        registrationNumber: true,
        color: true,
        photoUrl: true,
        isActive: true,
      },
    },
    configurationVersion: {
      include: {
        configuration: true,
      },
    },
    classes: {
      include: {
        class: {
          include: {
            direction: true,
          },
        },
      },
    },
    inspection: true,
    results: true,
  };

  private async getActiveDisqualifications(
    tx: PrismaService | any,
    participantId: string,
    stageId: string,
  ) {
    const stage = await tx.stage.findUnique({
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

    return tx.disqualification.findMany({
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

  // ==========================================
  // СПИСОК РЕГИСТРАЦИЙ
  // ==========================================

  async findAll(
    stageId?: string,
    status?: RegistrationStatus,
  ) {
    return this.prisma.registration.findMany({
      where: {
        ...(stageId ? { stageId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [
        { stageId: 'asc' },
        { participantNumber: 'asc' },
      ],
      include: this.registrationInclude,
    });
  }

  // ==========================================
  // ОДНА РЕГИСТРАЦИЯ
  // ==========================================

  async findOne(id: string) {
    const registration =
      await this.prisma.registration.findUnique({
        where: {
          id,
        },
        include: this.registrationInclude,
      });

    if (!registration) {
      throw new NotFoundException(
        'Регистрация не найдена',
      );
    }

    return registration;
  }

    // ==========================================
  // СОЗДАНИЕ РЕГИСТРАЦИИ
  // ==========================================

  async create(
    request: AuthenticatedRequest,
    body: {
      stageId: string;
      participantId: string;
      carId: string;
      classIds: string[];
      configurationVersionId: string;
      source?: RegistrationSource;
    },
  ) {
    const {
      stageId,
      participantId,
      carId,
      classIds,
      configurationVersionId,
    } = body;

    if (!configurationVersionId) {
      throw new BadRequestException(
        'Для регистрации необходимо выбрать версию конфигурации автомобиля',
      );
    }

    if (
      request.user.role === 'PARTICIPANT' &&
      request.user.participantId !== participantId
    ) {
      throw new ConflictException(
        'Нельзя создавать регистрацию за другого участника',
      );
    }

    if (
      request.user.role === 'PARTICIPANT' &&
      body.source &&
      body.source !== 'PRE_REGISTRATION'
    ) {
      throw new BadRequestException(
        'Участник может создавать только предрегистрацию',
      );
    }

    if (
      request.user.role === 'JUDGE' &&
      body.source === 'IMPORT'
    ) {
      throw new BadRequestException(
        'JUDGE не может создавать регистрацию с источником IMPORT',
      );
    }

    if (!stageId || !participantId || !carId) {
      throw new BadRequestException(
        'Необходимо указать этап, участника и автомобиль',
      );
    }

    if (
      !Array.isArray(classIds) ||
      classIds.length === 0
    ) {
      throw new BadRequestException(
        'Выберите хотя бы один класс',
      );
    }

    if (
      classIds.some(
        (id) =>
          typeof id !== 'string' ||
          !id.trim(),
      )
    ) {
      throw new BadRequestException(
        'Список классов содержит некорректный ID',
      );
    }

    if (classIds.length > 5) {
      throw new BadRequestException(
        'В одной регистрации можно выбрать не более 5 классов',
      );
    }

    if (
      new Set(classIds).size !== classIds.length
    ) {
      throw new BadRequestException(
        'Один и тот же класс указан несколько раз',
      );
    }

    const source =
      body.source ?? 'PRE_REGISTRATION';

    if (
      ![
        'PRE_REGISTRATION',
        'ON_SITE',
        'IMPORT',
      ].includes(source)
    ) {
      throw new BadRequestException(
        'Недопустимый источник регистрации',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        // Блокируем выдачу номеров для конкретного этапа.
        //
        // Это защищает от ситуации, когда два
        // параллельных запроса одновременно получают
        // один и тот же participantNumber.
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtext(${stageId})
          )
        `;

        // 1. Проверяем этап.
        const stage =
          await tx.stage.findUnique({
            where: {
              id: stageId,
            },
          });

        if (!stage || stage.isDeleted) {
          throw new NotFoundException(
            'Этап не найден или удалён',
          );
        }

        if (stage.status !== 'PUBLISHED') {
          throw new BadRequestException(
            'Регистрация доступна только на опубликованный этап',
          );
        }

        const season = await tx.season.findUnique({
          where: { id: stage.seasonId },
          select: { status: true },
        });

        if (!season || season.status !== 'ACTIVE') {
          throw new BadRequestException(
            'Регистрация недоступна: сезон не активен',
          );
        }

        if (!stage.registrationOpen) {
          throw new BadRequestException(
            'Регистрация на этот этап закрыта',
          );
        }

        const now = new Date();

        if (
          stage.registrationStartsAt &&
          now < stage.registrationStartsAt
        ) {
          throw new BadRequestException(
            'Регистрация на этот этап ещё не началась',
          );
        }

        if (
          stage.registrationEndsAt &&
          now > stage.registrationEndsAt
        ) {
          throw new BadRequestException(
            'Срок регистрации на этот этап завершён',
          );
        }

        // 2. Проверяем участника.
        const participant =
          await tx.participant.findUnique({
            where: {
              id: participantId,
            },
          });

        if (!participant) {
          throw new NotFoundException(
            'Участник не найден',
          );
        }

        // 3. Проверяем дисквалификацию.
        const activeDisqualifications =
          await this.getActiveDisqualifications(
            tx,
            participantId,
            stageId,
          );

        if (
          activeDisqualifications.length > 0
        ) {
          const format =
            activeDisqualifications.find(
              (item: { scope: string }) =>
                item.scope === 'FORMAT',
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

          const season =
            activeDisqualifications.find(
              (item: { scope: string }) =>
                item.scope === 'SEASON',
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

          const stageDisqualification =
            activeDisqualifications.find(
              (item: { scope: string }) =>
                item.scope === 'STAGE',
            );

          if (stageDisqualification) {
            throw new ConflictException({
              message:
                'Участник не может зарегистрироваться: действует дисквалификация STAGE на этот этап',
              code:
                'PARTICIPANT_STAGE_DISQUALIFIED',
              disqualificationId:
                stageDisqualification.id,
            });
          }
        }

        // 4. Проверяем автомобиль.
        const car =
          await tx.car.findUnique({
            where: {
              id: carId,
            },
          });

        if (!car) {
          throw new NotFoundException(
            'Автомобиль не найден',
          );
        }

        if (
          car.participantId !== participantId
        ) {
          throw new BadRequestException(
            'Этот автомобиль не принадлежит выбранному участнику',
          );
        }

        if (!car.isActive) {
          throw new BadRequestException(
            'Нельзя зарегистрировать неактивный автомобиль',
          );
        }

        // 5. Проверяем классы этапа.
        const stageClasses =
          await tx.stageClass.findMany({
            where: {
              stageId,
              classId: {
                in: classIds,
              },
              isActive: true,
              class: {
                isActive: true,
                direction: {
                  isActive: true,
                },
              },
            },
            select: {
              classId: true,
              participantLimit: true,
              class: {
                select: {
                  directionId: true,
                },
              },
            },
          });

        if (
          stageClasses.length !==
          classIds.length
        ) {
          throw new BadRequestException(
            'Один или несколько классов неактивны или не назначены этому этапу',
          );
        }

        // 6. В одной регистрации максимум
        // один класс из каждого направления.
        const directionIds =
          stageClasses.map(
            (item) => item.class.directionId,
          );

        if (
          new Set(directionIds).size !==
          directionIds.length
        ) {
          throw new BadRequestException(
            'В одной регистрации нельзя выбрать несколько классов одного направления',
          );
        }

        // 7. Проверяем лимиты классов на этом этапе.
        for (const stageClass of stageClasses) {
          if (stageClass.participantLimit === null) continue;

          const currentCount = await tx.registrationClass.count({
            where: {
              classId: stageClass.classId,
              registration: {
                stageId,
                status: 'ACTIVE',
              },
            },
          });

          if (currentCount >= stageClass.participantLimit) {
            throw new ConflictException({
              message: 'Лимит участников в выбранном классе уже достигнут',
              code: 'STAGE_CLASS_PARTICIPANT_LIMIT_REACHED',
              classId: stageClass.classId,
              limit: stageClass.participantLimit,
            });
          }
        }

        // 8. Проверяем регистрацию этого автомобиля
        // на этом этапе.
        //
        // Один участник может иметь несколько машин
        // на одном этапе.
        const existing =
          await tx.registration.findUnique({
            where: {
              stageId_carId: {
                stageId,
                carId,
              },
            },
          });

        if (existing) {
          throw new ConflictException(
            existing.status === 'CANCELLED'
              ? 'Этот автомобиль уже регистрировался на этапе и был отменён. Для новой регистрации создаётся новая запись и новый номер только после снятия старой регистрации с этого автомобиля.'
              : 'Этот автомобиль уже зарегистрирован на этапе',
          );
        }

        // 8. Выбираем только явно указанную версию конфигурации.
        const configurationVersion =
          await tx.carConfigurationVersion.findFirst({
            where: {
              id: configurationVersionId,
              configuration: {
                carId,
              },
            },
            include: {
              configuration: true,
              headUnits: true,
              audioComponents: true,
              amplifiers: {
                include: {
                  componentLinks: true,
                },
              },
              batteries: true,
              generators: true,
            },
          });

        if (!configurationVersion) {
          throw new BadRequestException(
            'Выбранная версия конфигурации не принадлежит этому автомобилю',
          );
        }

        // 8. Получаем следующий номер.
        //
        // Берём максимум среди ВСЕХ регистраций,
        // включая CANCELLED.
        //
        // Поэтому отменённые номера никогда
        // не выдаются новой машине.
        const lastRegistration =
          await tx.registration.findFirst({
            where: {
              stageId,
            },
            orderBy: {
              participantNumber: 'desc',
            },
            select: {
              participantNumber: true,
            },
          });

        const participantNumber =
          (lastRegistration?.participantNumber ??
            0) + 1;

        // 9. Создаём новую регистрацию.
        return tx.registration.create({
          data: {
            stageId,
            participantId,
            carId,
            configurationVersionId: configurationVersion.id,
            configurationSnapshot: {
              configurationId: configurationVersion.configurationId,
              configurationName: configurationVersion.configuration.name,
              version: configurationVersion.version,
              vibrationIsolation: configurationVersion.vibrationIsolation,
              additionalDescription: configurationVersion.additionalDescription,
              headUnits: configurationVersion.headUnits,
              audioComponents: configurationVersion.audioComponents,
              amplifiers: configurationVersion.amplifiers,
              batteries: configurationVersion.batteries,
              generators: configurationVersion.generators,
            },
            participantNumber,
            source,
            status: 'ACTIVE',
            classes: {
              create: classIds.map(
                (classId) => ({
                  class: {
                    connect: {
                      id: classId,
                    },
                  },
                }),
              ),
            },
          },
          include:
            this.registrationInclude,
        });
      },
    );
  }
  // ==========================================
  // ОТМЕНА
  // ==========================================

  async cancel(id: string) {
    const registration =
      await this.prisma.registration.findUnique({
        where: {
          id,
        },
      });

    if (!registration) {
      throw new NotFoundException(
        'Регистрация не найдена',
      );
    }

    if (
      registration.status === 'CANCELLED'
    ) {
      throw new BadRequestException(
        'Регистрация уже отменена',
      );
    }

    return this.prisma.registration.update({
      where: {
        id,
      },
      data: {
        status: 'CANCELLED',
      },
      include:
        this.registrationInclude,
    });
  }

}
