import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class RecordsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private readonly recordInclude = {
    class: true,
    stage: {
      include: {
        season: true,
      },
    },
    result: {
      include: {
        registration: {
          include: {
            participant: true,
            car: true,
            stage: {
              include: {
                season: true,
              },
            },
          },
        },
        registrationClass: {
          include: {
            class: true,
          },
        },
      },
    },
  } satisfies Prisma.RecordInclude;

  private isBassRace(className: string): boolean {
    return className.trim().toLowerCase().startsWith('bassrace');
  }

  private async isResultDisqualified(
    tx: any,
    participantId: string,
    stageId: string,
    seasonId: string,
  ): Promise<boolean> {
    const disqualification =
      await tx.disqualification.findFirst({
        where: {
          participantId,
          status: 'ACTIVE',
          OR: [
            {
              scope: 'FORMAT',
            },
            {
              scope: 'SEASON',
              seasonId,
            },
            {
              scope: 'STAGE',
              stageId,
            },
          ],
        },
        select: {
          id: true,
        },
      });

    return Boolean(disqualification);
  }

  private async getResultContext(
    tx: any,
    resultId: string,
  ) {
    const result = await tx.result.findUnique({
      where: {
        id: resultId,
      },
      include: {
        registration: {
          include: {
            participant: true,
            car: true,
            stage: {
              include: {
                season: true,
              },
            },
          },
        },
        registrationClass: {
          include: {
            class: true,
          },
        },
      },
    });

    if (!result) {
      throw new NotFoundException(
        'Результат не найден',
      );
    }

    return result;
  }

  private async recalculateCurrentRecordForClass(
    tx: any,
    classId: string,
  ) {
    const classItem = await tx.class.findUnique({
      where: {
        id: classId,
      },
    });

    if (!classItem) {
      throw new NotFoundException(
        'Класс не найден',
      );
    }

    const registrationClasses =
      await tx.registrationClass.findMany({
        where: {
          classId,
        },
        select: {
          id: true,
        },
      });

    const registrationClassIds =
      registrationClasses.map(
        (item: { id: string }) => item.id,
      );

    if (registrationClassIds.length === 0) {
      return [];
    }

    /*
     * BassRace — рекорды не ведутся.
     */
    if (this.isBassRace(classItem.name)) {
      await tx.record.updateMany({
        where: {
          classId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      });

      await tx.result.updateMany({
        where: {
          registrationClassId: {
            in: registrationClassIds,
          },
        },
        data: {
          isBest: false,
        },
      });

      return [];
    }

    const results = await tx.result.findMany({
      where: {
        registrationClassId: {
          in: registrationClassIds,
        },
      },
      include: {
        registration: {
          include: {
            participant: true,
            stage: {
              include: {
                season: true,
              },
            },
          },
        },
        registrationClass: {
          include: {
            class: true,
          },
        },
      },
      orderBy: [
        {
          value: 'desc',
        },
        {
          createdAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],
    });

    /*
     * Сбрасываем старые текущие рекорды.
     */
    await tx.record.updateMany({
      where: {
        classId,
        isCurrent: true,
      },
      data: {
        isCurrent: false,
      },
    });

    await tx.result.updateMany({
      where: {
        registrationClassId: {
          in: registrationClassIds,
        },
      },
      data: {
        isBest: false,
      },
    });

    /*
     * IMPORT не создаёт рекорд автоматически.
     * Дисквалифицированные результаты исключаются.
     */
    const candidates = [];

    for (const result of results) {
      if (result.registration.source === 'IMPORT') {
        continue;
      }

      const disqualified =
        await this.isResultDisqualified(
          tx,
          result.registration.participantId,
          result.registration.stageId,
          result.registration.stage.seasonId,
        );

      if (disqualified) {
        continue;
      }

      candidates.push(result);
    }

    const units = [
      ...new Set(
        candidates.map(
          (result: { unit: string }) =>
            result.unit,
        ),
      ),
    ];

    const currentRecords = [];

    for (const unit of units) {
      const unitResults = candidates.filter(
        (result: { unit: string }) =>
          result.unit === unit,
      );

      if (unitResults.length === 0) {
        continue;
      }

      unitResults.sort(
        (
          a: {
            value: number;
            createdAt: Date;
            id: string;
          },
          b: {
            value: number;
            createdAt: Date;
            id: string;
          },
        ) => {
          if (b.value !== a.value) {
            return b.value - a.value;
          }

          const createdAtDifference =
            a.createdAt.getTime() -
            b.createdAt.getTime();

          if (createdAtDifference !== 0) {
            return createdAtDifference;
          }

          return a.id.localeCompare(b.id);
        },
      );

      const winner = unitResults[0];

      await tx.result.update({
        where: {
          id: winner.id,
        },
        data: {
          isBest: true,
        },
      });

      const existingRecord =
        await tx.record.findFirst({
          where: {
            resultId: winner.id,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });

      let record;

      if (existingRecord) {
        record = await tx.record.update({
          where: {
            id: existingRecord.id,
          },
          data: {
            classId,
            stageId:
              winner.registration.stageId,
            participantId:
              winner.registration.participantId,
            value: winner.value,
            unit: winner.unit,
            achievedAt: winner.createdAt,
            isCurrent: true,
          },
          include: this.recordInclude,
        });
      } else {
        record = await tx.record.create({
          data: {
            class: {
              connect: {
                id: classId,
              },
            },
            stageId:
              winner.registration.stageId,
            participantId:
              winner.registration.participantId,
            resultId: winner.id,
            value: winner.value,
            unit: winner.unit,
            achievedAt: winner.createdAt,
            isCurrent: true,
          },
          include: this.recordInclude,
        });
      }

      currentRecords.push(record);
    }

    return currentRecords;
  }

  async findAll() {
    return this.prisma.record.findMany({
      include: this.recordInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findCurrent() {
    const records =
      await this.prisma.record.findMany({
        where: {
          isCurrent: true,
        },
        include: this.recordInclude,
        orderBy: [
          {
            class: {
              sortOrder: 'asc',
            },
          },
          {
            unit: 'asc',
          },
        ],
      });

    const result = [];

    for (const record of records) {
      if (!record.result) {
        continue;
      }

      const disqualified =
        await this.isResultDisqualified(
          this.prisma,
          record.result.registration.participantId,
          record.result.registration.stageId,
          record.result.registration.stage.seasonId,
        );

      if (!disqualified) {
        result.push(record);
      }
    }

    return result;
  }

  async findByClass(classId: string) {
    return this.prisma.record.findMany({
      where: {
        classId,
      },
      include: this.recordInclude,
      orderBy: [
        {
          isCurrent: 'desc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async findBySeason(seasonId: string) {
    return this.prisma.record.findMany({
      where: {
        stage: {
          seasonId,
        },
      },
      include: this.recordInclude,
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const record =
      await this.prisma.record.findUnique({
        where: {
          id,
        },
        include: this.recordInclude,
      });

    if (!record) {
      throw new NotFoundException(
        'Рекорд не найден',
      );
    }

    return record;
  }

  async createFromResultIfEligible(
    resultId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const result =
          await this.getResultContext(
            tx,
            resultId,
          );

        if (
          result.registration.source ===
          'IMPORT'
        ) {
          await tx.result.update({
            where: {
              id: result.id,
            },
            data: {
              isBest: false,
            },
          });

          return {
            created: false,
            record: null,
            reason:
              'Исторический импорт не создаёт рекорд',
          };
        }

        if (
          this.isBassRace(
            result.registrationClass.class.name,
          )
        ) {
          await tx.result.update({
            where: {
              id: result.id,
            },
            data: {
              isBest: false,
            },
          });

          return {
            created: false,
            record: null,
            reason:
              'Для классов BassRace рекорды не ведутся',
          };
        }

        const disqualified =
          await this.isResultDisqualified(
            tx,
            result.registration.participantId,
            result.registration.stageId,
            result.registration.stage.seasonId,
          );

        if (disqualified) {
          await tx.result.update({
            where: {
              id: result.id,
            },
            data: {
              isBest: false,
            },
          });

          return {
            created: false,
            record: null,
            reason:
              'Результат исключён из-за активной дисквалификации',
          };
        }

        const records =
          await this.recalculateCurrentRecordForClass(
            tx,
            result.registrationClass.classId,
          );

        const recordForResult =
          records.find(
            (record: { resultId: string }) =>
              record.resultId === result.id,
          );

        return {
          created: Boolean(recordForResult),
          record: recordForResult ?? null,
          reason: recordForResult
            ? null
            : 'Результат не является текущим рекордом',
        };
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async createFromResult(resultId: string) {
    const result =
      await this.createFromResultIfEligible(
        resultId,
      );

    if (!result.created || !result.record) {
      throw new ConflictException(
        result.reason ??
          'Рекорд для данного результата не создан',
      );
    }

    return result.record;
  }

  async syncAfterResultUpdate(
    resultId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const result =
          await this.getResultContext(
            tx,
            resultId,
          );

        return this.recalculateCurrentRecordForClass(
          tx,
          result.registrationClass.classId,
        );
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async recalculateCurrentRecord(
    classId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        return this.recalculateCurrentRecordForClass(
          tx,
          classId,
        );
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async createFromResultManually(
    resultId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const result =
          await this.getResultContext(
            tx,
            resultId,
          );

        if (
          result.registration.status !==
          'ACTIVE'
        ) {
          throw new ConflictException(
            'Нельзя создать рекорд по отменённой регистрации',
          );
        }

        if (
          result.registration.stage.deletedAt
        ) {
          throw new ConflictException(
            'Нельзя создать рекорд для удалённого этапа',
          );
        }

        if (
          this.isBassRace(
            result.registrationClass.class.name,
          )
        ) {
          throw new ConflictException(
            'Для классов BassRace рекорды не ведутся',
          );
        }

        const disqualified =
          await this.isResultDisqualified(
            tx,
            result.registration.participantId,
            result.registration.stageId,
            result.registration.stage.seasonId,
          );

        if (disqualified) {
          throw new ConflictException(
            'Нельзя создать рекорд: участник находится под активной дисквалификацией',
          );
        }

        const registrationClasses =
          await tx.registrationClass.findMany({
            where: {
              classId:
                result.registrationClass.classId,
            },
            select: {
              id: true,
            },
          });

        const registrationClassIds =
          registrationClasses.map(
            (item: { id: string }) =>
              item.id,
          );

        await tx.record.updateMany({
          where: {
            classId:
              result.registrationClass.classId,
            isCurrent: true,
          },
          data: {
            isCurrent: false,
          },
        });

        await tx.result.updateMany({
          where: {
            registrationClassId: {
              in: registrationClassIds,
            },
          },
          data: {
            isBest: false,
          },
        });

        await tx.result.update({
          where: {
            id: result.id,
          },
          data: {
            isBest: true,
          },
        });

        const existingRecord =
          await tx.record.findFirst({
            where: {
              resultId: result.id,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

        if (existingRecord) {
          return tx.record.update({
            where: {
              id: existingRecord.id,
            },
            data: {
              classId:
                result.registrationClass.classId,
              stageId:
                result.registration.stageId,
              participantId:
                result.registration.participantId,
              value: result.value,
              unit: result.unit,
              achievedAt: result.createdAt,
              isCurrent: true,
            },
            include: this.recordInclude,
          });
        }

        return tx.record.create({
          data: {
            class: {
              connect: {
                id: result.registrationClass.classId,
              },
            },
            stageId:
              result.registration.stageId,
            participantId:
              result.registration.participantId,
            resultId: result.id,
            value: result.value,
            unit: result.unit,
            achievedAt: result.createdAt,
            isCurrent: true,
          },
          include: this.recordInclude,
        });
      },
      {
        isolationLevel:
          Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }
}