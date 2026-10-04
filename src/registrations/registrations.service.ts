import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

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
    participant: true,
    car: true,
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

  async create(body: {
    stageId: string;
    participantId: string;
    carId: string;
    classIds: string[];
    source?: RegistrationSource;
  }) {
    const {
      stageId,
      participantId,
      carId,
      classIds,
    } = body;

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
              class: {
                isActive: true,
                direction: {
                  isActive: true,
                },
              },
            },
            select: {
              classId: true,
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

        // 7. Проверяем регистрацию этого автомобиля
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
          // Уже активна — повторно зарегистрировать нельзя.
          if (
            existing.status === 'ACTIVE'
          ) {
            throw new ConflictException(
              'Этот автомобиль уже зарегистрирован на этапе',
            );
          }

          // Отменённая регистрация:
          // восстанавливаем ТУ ЖЕ запись и ТУ ЖЕ
          // participantNumber.
          await tx.registrationClass.deleteMany({
            where: {
              registrationId: existing.id,
            },
          });

          await tx.registration.update({
            where: {
              id: existing.id,
            },
            data: {
              participantId,
              status: 'ACTIVE',
              source,
              registeredAt: new Date(),
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
          });

          return tx.registration.findUniqueOrThrow({
            where: {
              id: existing.id,
            },
            include:
              this.registrationInclude,
          });
        }

        // 8. Фиксируем текущую версию конфигурации автомобиля.
        // Если конфигурация ещё не создана, регистрация остаётся допустимой.
        const configuration =
          await tx.carConfiguration.findFirst({
            where: { carId },
            orderBy: { createdAt: 'asc' },
            select: { id: true, currentVersion: true },
          });

        const configurationVersion = configuration
          ? await tx.carConfigurationVersion.findUnique({
              where: {
                configurationId_version: {
                  configurationId: configuration.id,
                  version: configuration.currentVersion,
                },
              },
              include: { headUnits: true, audioComponents: true, amplifiers: { include: { componentLinks: true } }, batteries: true, generators: true },
            })
          : null;

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
            configurationVersionId: configurationVersion?.id ?? null,
            configurationSnapshot: configurationVersion
              ? {
                  version: configurationVersion.version,
                  vibrationIsolation: configurationVersion.vibrationIsolation,
                  additionalDescription: configurationVersion.additionalDescription,
                  headUnits: configurationVersion.headUnits,
                  audioComponents: configurationVersion.audioComponents,
                  amplifiers: configurationVersion.amplifiers,
                  batteries: configurationVersion.batteries,
                  generators: configurationVersion.generators,
                }
              : null,
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
  // ИЗМЕНЕНИЕ КЛАССОВ
  // ==========================================

  async updateClasses(
    id: string,
    classIds: string[],
  ) {
    if (
      !Array.isArray(classIds) ||
      classIds.length === 0
    ) {
      throw new BadRequestException(
        'Необходимо выбрать хотя бы один класс',
      );
    }

    if (
      classIds.some(
        (classId) =>
          typeof classId !== 'string' ||
          !classId.trim(),
      )
    ) {
      throw new BadRequestException(
        'Список классов содержит некорректный ID',
      );
    }

    if (
      new Set(classIds).size !== classIds.length
    ) {
      throw new BadRequestException(
        'Один и тот же класс указан несколько раз',
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        const registration =
          await tx.registration.findUnique({
            where: {
              id,
            },
            include: {
              stage: true,
              results: true,
            },
          });

        if (!registration) {
          throw new NotFoundException(
            'Регистрация не найдена',
          );
        }

        if (
          registration.status !== 'ACTIVE'
        ) {
          throw new BadRequestException(
            'Нельзя менять классы отменённой регистрации',
          );
        }

        if (
          registration.results.length > 0
        ) {
          throw new BadRequestException(
            'Нельзя менять классы после внесения результатов',
          );
        }

        const activeDisqualifications =
          await this.getActiveDisqualifications(
            tx,
            registration.participantId,
            registration.stageId,
          );

        if (
          activeDisqualifications.length > 0
        ) {
          throw new ConflictException(
            'Нельзя изменять классы регистрации участника, находящегося под действующей дисквалификацией',
          );
        }

        const stage =
          registration.stage;

        if (
          stage.isDeleted ||
          !stage.registrationOpen
        ) {
          throw new BadRequestException(
            'Изменение классов недоступно: этап удалён или регистрация закрыта',
          );
        }

        const stageClasses =
          await tx.stageClass.findMany({
            where: {
              stageId:
                registration.stageId,
              classId: {
                in: classIds,
              },
              class: {
                isActive: true,
                direction: {
                  isActive: true,
                },
              },
            },
            select: {
              classId: true,
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

        await tx.registrationClass.deleteMany({
          where: {
            registrationId: id,
          },
        });

        await tx.registrationClass.createMany({
          data: classIds.map(
            (classId) => ({
              registrationId: id,
              classId,
            }),
          ),
        });

        return tx.registration.findUniqueOrThrow(
          {
            where: {
              id,
            },
            include:
              this.registrationInclude,
          },
        );
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

  // ==========================================
  // ВОССТАНОВЛЕНИЕ
  // ==========================================

  async restore(id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const registration =
          await tx.registration.findUnique({
            where: {
              id,
            },
            include: {
              stage: true,
            },
          });

        if (!registration) {
          throw new NotFoundException(
            'Регистрация не найдена',
          );
        }

        if (
          registration.status !==
          'CANCELLED'
        ) {
          throw new ConflictException(
            'Восстановить можно только отменённую регистрацию',
          );
        }

        if (
          registration.stage.isDeleted
        ) {
          throw new ConflictException(
            'Нельзя восстановить регистрацию на удалённом этапе',
          );
        }

        // При восстановлении снова проверяем
        // актуальную дисквалификацию.
        const activeDisqualifications =
          await this.getActiveDisqualifications(
            tx,
            registration.participantId,
            registration.stageId,
          );

        if (
          activeDisqualifications.length > 0
        ) {
          throw new ConflictException(
            'Нельзя восстановить регистрацию: участник находится под действующей дисквалификацией',
          );
        }

        const activeRegistration =
          await tx.registration.findFirst({
            where: {
              stageId:
                registration.stageId,
              participantId:
                registration.participantId,
              carId:
                registration.carId,
              status: 'ACTIVE',
              id: {
                not: registration.id,
              },
            },
          });

        if (activeRegistration) {
          throw new ConflictException(
            'У этого участника уже есть активная регистрация с этим автомобилем на данном этапе',
          );
        }

        const restored =
          await tx.registration.update({
            where: {
              id,
            },
            data: {
              status: 'ACTIVE',
            },
          });

        return tx.registration.findUnique({
          where: {
            id: restored.id,
          },
          include:
            this.registrationInclude,
        });
      },
    );
  }
}