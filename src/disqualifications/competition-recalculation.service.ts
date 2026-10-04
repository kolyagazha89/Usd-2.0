import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ResultsRankingService } from '../results/results-ranking.service';
import { RecordsService } from '../records/records.service';

type DisqualificationScope =
  | 'STAGE'
  | 'SEASON'
  | 'FORMAT';

@Injectable()
export class CompetitionRecalculationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resultsRankingService: ResultsRankingService,
    private readonly recordsService: RecordsService,
  ) {}

  async recalculateForDisqualification(
    scope: DisqualificationScope,
    stageId?: string | null,
    seasonId?: string | null,
  ) {
    const stages = await this.getAffectedStages(
      scope,
      stageId,
      seasonId,
    );

    const recalculatedStages = [];

    for (const stage of stages) {
      const stageClasses =
        await this.prisma.stageClass.findMany({
          where: {
            stageId: stage.id,
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

      for (const stageClass of stageClasses) {
        await this.resultsRankingService.recalculateByStageClass(
          stage.id,
          stageClass.classId,
        );

        /*
         * RecordsService пересчитывает рекорд класса
         * целиком, поэтому после изменения одного этапа
         * актуальность рекорда автоматически проверяется
         * по всем результатам этого класса.
         */
        await this.recordsService.recalculateCurrentRecord(
          stageClass.classId,
        );
      }

      recalculatedStages.push({
        stageId: stage.id,
        stageNumber: stage.stageNumber,
        name: stage.name,
      });
    }

    return {
      scope,
      recalculatedStages,
    };
  }

  private async getAffectedStages(
    scope: DisqualificationScope,
    stageId?: string | null,
    seasonId?: string | null,
  ) {
    if (scope === 'STAGE') {
      if (!stageId) {
        return [];
      }

      return this.prisma.stage.findMany({
        where: {
          id: stageId,
        },
        select: {
          id: true,
          stageNumber: true,
          name: true,
        },
      });
    }

    if (scope === 'SEASON') {
      if (!seasonId) {
        return [];
      }

      return this.prisma.stage.findMany({
        where: {
          seasonId,
        },
        select: {
          id: true,
          stageNumber: true,
          name: true,
        },
        orderBy: {
          stageNumber: 'asc',
        },
      });
    }

    /*
     * FORMAT действует на весь USD.
     */
    return this.prisma.stage.findMany({
      select: {
        id: true,
        stageNumber: true,
        name: true,
      },
      orderBy: [
        {
          season: {
            year: 'asc',
          },
        },
        {
          stageNumber: 'asc',
        },
      ],
    });
  }
}