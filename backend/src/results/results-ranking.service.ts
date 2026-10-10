import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ResultsRankingService {
  constructor(private readonly prisma: PrismaService) {}

  private isBassRace(className: string): boolean {
    return className.trim().toLowerCase().startsWith('bassrace');
  }

  private async getDisqualifiedParticipantIds(
    tx: any,
    stageId: string,
  ): Promise<string[]> {
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
      throw new NotFoundException('Этап не найден');
    }

    const disqualifications =
      await tx.disqualification.findMany({
        where: {
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
              stageId,
            },
          ],
        },
        select: {
          participantId: true,
        },
        distinct: ['participantId'],
      });

    return disqualifications.map(
      (item: { participantId: string }) =>
        item.participantId,
    );
  }

  async recalculateByStageClass(
    stageId: string,
    classId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const stageClass =
        await tx.stageClass.findUnique({
          where: {
            stageId_classId: {
              stageId,
              classId,
            },
          },
          include: {
            class: true,
          },
        });

      if (!stageClass) {
        throw new NotFoundException(
          'Класс не участвует в данном этапе',
        );
      }

      const disqualifiedParticipantIds =
        await this.getDisqualifiedParticipantIds(
          tx,
          stageId,
        );

      /*
       * BassRace:
       * места приходят извне и не пересчитываются.
       * Если участник дисквалифицирован — его результат
       * просто не показываем в рейтинге.
       */
      if (this.isBassRace(stageClass.class.name)) {
        return tx.result.findMany({
          where: {
            registration: {
              stageId,
              status: 'ACTIVE',
              participantId: {
                notIn: disqualifiedParticipantIds,
              },
            },
            registrationClass: {
              classId,
            },
            OR: [
              { isHistorical: false },
              { isHistorical: true, verificationStatus: 'VERIFIED' },
            ],
          },
          include: {
            registration: {
              include: {
                participant: true,
                car: true,
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
              place: 'asc',
            },
            {
              createdAt: 'asc',
            },
            {
              id: 'asc',
            },
          ],
        });
      }

      const registrationClasses =
        await tx.registrationClass.findMany({
          where: {
            classId,
            registration: {
              stageId,
              status: 'ACTIVE',
            },
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
       * Получаем все результаты класса.
       * Дисквалифицированные здесь специально не удаляются
       * из БД — они остаются историческими данными.
       */
      const allResults = await tx.result.findMany({
        where: {
          registrationClassId: {
            in: registrationClassIds,
          },
          OR: [
            { isHistorical: false },
            { isHistorical: true, verificationStatus: 'VERIFIED' },
          ],
        },
        include: {
          registration: {
            select: {
              participantId: true,
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
       * Сначала очищаем места абсолютно у всех результатов.
       * Иначе старые места дисквалифицированных участников
       * могут остаться в БД.
       */
      await tx.result.updateMany({
        where: {
          registrationClassId: {
            in: registrationClassIds,
          },
          OR: [
            { isHistorical: false },
            { isHistorical: true, verificationStatus: 'VERIFIED' },
          ],
        },
        data: {
          place: null,
        },
      });

      /*
       * В рейтинг попадают только допущенные участники.
       */
      const eligibleResults =
        allResults.filter(
          (result: {
            registration: {
              participantId: string;
            };
          }) =>
            !disqualifiedParticipantIds.includes(
              result.registration.participantId,
            ),
        );

      /*
       * Места обычных классов пересчитываются
       * только среди допущенных результатов.
       */
      for (
        let index = 0;
        index < eligibleResults.length;
        index++
      ) {
        await tx.result.update({
          where: {
            id: eligibleResults[index].id,
          },
          data: {
            place: index + 1,
          },
        });
      }

      return tx.result.findMany({
        where: {
          registrationClassId: {
            in: registrationClassIds,
          },
          OR: [
            { isHistorical: false },
            { isHistorical: true, verificationStatus: 'VERIFIED' },
          ],
          registration: {
            status: 'ACTIVE',
            participantId: {
              notIn: disqualifiedParticipantIds,
            },
          },
        },
        include: {
          registration: {
            include: {
              participant: true,
              car: true,
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
            place: 'asc',
          },
          {
            createdAt: 'asc',
          },
          {
            id: 'asc',
          },
        ],
      });
    });
  }

  async recalculateByStage(stageId: string) {
    const stageClasses =
      await this.prisma.stageClass.findMany({
        where: {
          stageId,
        },
        select: {
          classId: true,
        },
        orderBy: {
          class: {
            sortOrder: 'asc',
          },
        },
      });

    const results = [];

    for (const stageClass of stageClasses) {
      results.push(
        await this.recalculateByStageClass(
          stageId,
          stageClass.classId,
        ),
      );
    }

    return results;
  }
}