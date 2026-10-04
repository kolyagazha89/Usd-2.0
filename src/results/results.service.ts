import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { ResultsRankingService } from './results-ranking.service';

type ResultUnitValue =
  | 'DB'
  | 'MPS'
  | 'OTHER';

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recordsService: RecordsService,
    private readonly rankingService: ResultsRankingService,
  ) {}

  private readonly resultInclude = {
    registration: {
      include: {
        stage: {
          include: {
            season: true,
          },
        },
        participant: true,
        car: true,
      },
    },
    registrationClass: {
      include: {
        class: {
          include: {
            direction: true,
          },
        },
      },
    },
    records: true,
  };

  private isBassRace(
    className: string,
  ): boolean {
    return className
      .trim()
      .toLowerCase()
      .startsWith('bassrace');
  }

  private validateValue(value: number) {
    if (!Number.isFinite(value)) {
      throw new ConflictException(
        'Значение результата должно быть числом',
      );
    }
  }

  private validateUnit(
    unit: ResultUnitValue,
  ) {
    if (
      !['DB', 'MPS', 'OTHER'].includes(
        unit,
      )
    ) {
      throw new ConflictException(
        'Недопустимая единица измерения',
      );
    }
  }

  private validatePlace(
    place?: number | null,
  ) {
    if (
      place !== undefined &&
      place !== null &&
      (!Number.isInteger(place) ||
        place < 1)
    ) {
      throw new ConflictException(
        'Место должно быть целым числом больше 0',
      );
    }
  }

  private async getActiveDisqualifications(
    tx: PrismaService | any,
    participantId: string,
    stageId: string,
  ) {
    const stage =
      await tx.stage.findUnique({
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
    });
  }

  private async assertResultAllowed(
    tx: PrismaService | any,
    participantId: string,
    stageId: string,
  ) {
    const active =
      await this.getActiveDisqualifications(
        tx,
        participantId,
        stageId,
      );

    if (active.length > 0) {
      const format =
        active.find(
          (item: { scope: string }) =>
            item.scope === 'FORMAT',
        );

      if (format) {
        throw new ConflictException({
          message:
            'Нельзя внести результат: участник дисквалифицирован по FORMAT',
          code:
            'RESULT_FORMAT_DISQUALIFIED',
          disqualificationId: format.id,
        });
      }

      const season =
        active.find(
          (item: { scope: string }) =>
            item.scope === 'SEASON',
        );

      if (season) {
        throw new ConflictException({
          message:
            'Нельзя внести результат: участник дисквалифицирован по SEASON',
          code:
            'RESULT_SEASON_DISQUALIFIED',
          disqualificationId: season.id,
        });
      }

      const stage =
        active.find(
          (item: { scope: string }) =>
            item.scope === 'STAGE',
        );

      if (stage) {
        throw new ConflictException({
          message:
            'Нельзя внести результат: участник дисквалифицирован на этот этап',
          code:
            'RESULT_STAGE_DISQUALIFIED',
          disqualificationId: stage.id,
        });
      }
    }
  }

  async findOne(id: string) {
    const result =
      await this.prisma.result.findUnique({
        where: {
          id,
        },
        include: this.resultInclude,
      });

    if (!result) {
      throw new NotFoundException(
        'Результат не найден',
      );
    }

    return result;
  }

  async findByRegistration(
    registrationId: string,
  ) {
    const registration =
      await this.prisma.registration.findUnique(
        {
          where: {
            id: registrationId,
          },
        },
      );

    if (!registration) {
      throw new NotFoundException(
        'Регистрация не найдена',
      );
    }

    return this.prisma.result.findMany({
      where: {
        registrationId,
      },
      include: this.resultInclude,
      orderBy: [
        {
          registrationClass: {
            class: {
              sortOrder: 'asc',
            },
          },
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async findByRegistrationClass(
    registrationClassId: string,
  ) {
    const registrationClass =
      await this.prisma.registrationClass.findUnique(
        {
          where: {
            id: registrationClassId,
          },
        },
      );

    if (!registrationClass) {
      throw new NotFoundException(
        'Класс регистрации не найден',
      );
    }

    return this.prisma.result.findMany({
      where: {
        registrationClassId,
      },
      include: this.resultInclude,
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findByStage(
    stageId: string,
  ) {
    const stage =
      await this.prisma.stage.findUnique({
        where: {
          id: stageId,
        },
      });

    if (!stage) {
      throw new NotFoundException(
        'Этап не найден',
      );
    }

    return this.prisma.result.findMany({
      where: {
        registration: {
          stageId,
        },
      },
      include: this.resultInclude,
      orderBy: [
        {
          registrationClass: {
            class: {
              sortOrder: 'asc',
            },
          },
        },
        {
          place: 'asc',
        },
        {
          createdAt: 'asc',
        },
      ],
    });
  }

  async create(data: {
    registrationId: string;
    registrationClassId: string;
    value: number;
    unit: ResultUnitValue;
    place?: number;
    notes?: string;
  }) {
    this.validateValue(data.value);
    this.validateUnit(data.unit);
    this.validatePlace(data.place);

    const registration =
      await this.prisma.registration.findUnique(
        {
          where: {
            id: data.registrationId,
          },
          include: {
            inspection: true,
            stage: true,
          },
        },
      );

    if (!registration) {
      throw new NotFoundException(
        'Регистрация не найдена',
      );
    }

    if (
      registration.status !== 'ACTIVE'
    ) {
      throw new ConflictException(
        'Нельзя добавить результат для неактивной регистрации',
      );
    }

    if (registration.stage.isDeleted) {
      throw new ConflictException(
        'Нельзя добавить результат для удалённого этапа',
      );
    }

    if (!registration.inspection) {
      throw new ConflictException(
        'Нельзя добавить результат без инспекции',
      );
    }

    if (
      registration.inspection.status !==
      'PASSED'
    ) {
      throw new ConflictException(
        'Нельзя добавить результат до прохождения инспекции',
      );
    }

    await this.assertResultAllowed(
      this.prisma,
      registration.participantId,
      registration.stageId,
    );

    const registrationClass =
      await this.prisma.registrationClass.findUnique(
        {
          where: {
            id: data.registrationClassId,
          },
          include: {
            class: true,
          },
        },
      );

    if (!registrationClass) {
      throw new NotFoundException(
        'Класс регистрации не найден',
      );
    }

    if (
      registrationClass.registrationId !==
      data.registrationId
    ) {
      throw new ConflictException(
        'Указанный класс не принадлежит данной регистрации',
      );
    }

    const result =
      await this.prisma.$transaction(
        async (tx) => {
          const existingResult =
            await tx.result.findUnique({
              where: {
                registrationClassId_attemptNumber:
                  {
                    registrationClassId:
                      data.registrationClassId,
                    attemptNumber: 1,
                  },
              },
            });

          if (existingResult) {
            throw new ConflictException(
              'Для этого класса результат уже существует',
            );
          }

          await this.assertResultAllowed(
            tx,
            registration.participantId,
            registration.stageId,
          );

          return tx.result.create({
            data: {
              registrationId:
                data.registrationId,
              registrationClassId:
                data.registrationClassId,
              attemptNumber: 1,
              value: data.value,
              unit: data.unit,
              place: this.isBassRace(
                registrationClass.class.name,
              )
                ? data.place
                : null,
              isBest: false,
              notes: data.notes,
            },
            include:
              this.resultInclude,
          });
        },
        {
          isolationLevel:
            'Serializable',
        },
      );

    await this.recordsService
      .createFromResultIfEligible(
        result.id,
      );

    await this.rankingService
      .recalculateByStageClass(
        registration.stageId,
        registrationClass.classId,
      );

    return this.findOne(result.id);
  }

  async update(
    id: string,
    data: {
      value?: number;
      unit?: ResultUnitValue;
      place?: number | null;
      notes?: string | null;
    },
  ) {
    this.validatePlace(data.place);

    if (
      data.value !== undefined
    ) {
      this.validateValue(
        data.value,
      );
    }

    if (
      data.unit !== undefined
    ) {
      this.validateUnit(
        data.unit,
      );
    }

    const existing =
      await this.prisma.result.findUnique(
        {
          where: {
            id,
          },
          include: {
            registration: {
              include: {
                inspection: true,
                stage: true,
              },
            },
            registrationClass: {
              include: {
                class: true,
              },
            },
          },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Результат не найден',
      );
    }

    if (
      existing.registration.status !==
      'ACTIVE'
    ) {
      throw new ConflictException(
        'Нельзя изменить результат неактивной регистрации',
      );
    }

    if (
      existing.registration.stage.isDeleted
    ) {
      throw new ConflictException(
        'Нельзя изменить результат удалённого этапа',
      );
    }

    if (
      !existing.registration.inspection
    ) {
      throw new ConflictException(
        'Нельзя изменить результат без инспекции',
      );
    }

    if (
      existing.registration.inspection.status !==
      'PASSED'
    ) {
      throw new ConflictException(
        'Нельзя изменить результат до прохождения инспекции',
      );
    }

    await this.assertResultAllowed(
      this.prisma,
      existing.registration.participantId,
      existing.registration.stageId,
    );

    if (
      existing.registrationClass
        .registrationId !==
      existing.registrationId
    ) {
      throw new ConflictException(
        'Класс результата не принадлежит его регистрации',
      );
    }

    const bassRace =
      this.isBassRace(
        existing.registrationClass.class.name,
      );

    await this.prisma.result.update({
      where: {
        id,
      },
      data: {
        ...(data.value !==
          undefined && {
          value: data.value,
        }),
        ...(data.unit !==
          undefined && {
          unit: data.unit,
        }),
        ...(bassRace &&
          data.place !==
            undefined && {
            place: data.place,
          }),
        ...(data.notes !==
          undefined && {
          notes: data.notes,
        }),
      },
    });

    await this.recordsService
      .syncAfterResultUpdate(id);

    await this.rankingService
      .recalculateByStageClass(
        existing.registration.stageId,
        existing.registrationClass.classId,
      );

    return this.findOne(id);
  }

  async remove(id: string) {
    const existing =
      await this.prisma.result.findUnique(
        {
          where: {
            id,
          },
          include: {
            registration: {
              include: {
                stage: true,
              },
            },
            registrationClass: {
              include: {
                class: true,
              },
            },
          },
        },
      );

    if (!existing) {
      throw new NotFoundException(
        'Результат не найден',
      );
    }

    if (
      existing.registration.status !==
      'ACTIVE'
    ) {
      throw new ConflictException(
        'Нельзя удалить результат неактивной регистрации',
      );
    }

    if (
      existing.registration.stage.isDeleted
    ) {
      throw new ConflictException(
        'Нельзя удалить результат удалённого этапа',
      );
    }

    const stageId =
      existing.registration.stageId;

    const classId =
      existing.registrationClass.classId;

    await this.prisma.result.delete({
      where: {
        id,
      },
    });

    await this.recordsService
      .recalculateCurrentRecord(
        classId,
      );

    await this.rankingService
      .recalculateByStageClass(
        stageId,
        classId,
      );

    return this.findByRegistrationClass(
      existing.registrationClassId,
    );
  }
}