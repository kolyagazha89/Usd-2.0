import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

type ResultRow = {
  id: string;
  value: any;
  unit: string;
  place: number | null;
  isHistorical: boolean;
  verificationStatus: string;
  createdAt: Date;
  registration: {
    id: string;
    participantId: string;
    participantNumber: number;
    status: string;
    stageId: string;
    carId: string;
    participant: {
      id: string;
      firstName: string;
      lastName: string;
      middleName: string | null;
      team: string | null;
      city: string | null;
      photoUrl: string | null;
      isPublic: boolean;
    };
    car: {
      id: string;
      brand: string;
      model: string;
      registrationNumber: string;
      registrationCountry: string;
      color: string | null;
      photoUrl: string | null;
    };
    stage: {
      id: string;
      stageNumber: number;
      name: string;
      city: string | null;
      date: Date;
      season: {
        id: string;
        name: string;
        year: number;
      };
    };
  };
  registrationClass: {
    id: string;
    classId: string;
    class: {
      id: string;
      code: string;
      name: string;
      unit: string;
      direction: {
        id: string;
        name: string;
      };
    };
  };
};

@Injectable()
export class StatisticsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private readonly resultSelect = {
    id: true,
    value: true,
    unit: true,
    place: true,
    isHistorical: true,
    verificationStatus: true,
    createdAt: true,
    registration: {
      select: {
        id: true,
        participantId: true,
        participantNumber: true,
        status: true,
        stageId: true,
        carId: true,
        participant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            team: true,
            city: true,
            photoUrl: true,
            isPublic: true,
          },
        },
        car: {
          select: {
            id: true,
            brand: true,
            model: true,
            registrationNumber: true,
            registrationCountry: true,
            color: true,
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
            season: {
              select: {
                id: true,
                name: true,
                year: true,
              },
            },
          },
        },
      },
    },
    registrationClass: {
      select: {
        id: true,
        classId: true,
        class: {
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            sortOrder: true,
            direction: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    },
  };

  private validatePagination(page: number, limit: number) {
    if (!Number.isInteger(page) || page < 1) {
      throw new BadRequestException('page должен быть целым числом >= 1');
    }

    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit должен быть в диапазоне 1..100');
    }
  }

  private isEligibleResult(result: ResultRow, disqualificationKeys: Set<string>) {
    if (result.registration.status !== 'ACTIVE') {
      return false;
    }

    if (
      result.isHistorical &&
      result.verificationStatus !== 'VERIFIED'
    ) {
      return false;
    }

    const participantId = result.registration.participantId;
    const seasonId = result.registration.stage.season.id;
    const stageId = result.registration.stage.id;

    return !(
      disqualificationKeys.has(`FORMAT:${participantId}`) ||
      disqualificationKeys.has(`SEASON:${participantId}:${seasonId}`) ||
      disqualificationKeys.has(`STAGE:${participantId}:${stageId}`)
    );
  }

  private async getDisqualificationKeys(
    participantIds?: string[],
  ) {
    const disqualifications =
      await this.prisma.disqualification.findMany({
        where: {
          status: 'ACTIVE',
          ...(participantIds?.length
            ? { participantId: { in: participantIds } }
            : {}),
        },
        select: {
          participantId: true,
          scope: true,
          seasonId: true,
          stageId: true,
        },
      });

    const keys = new Set<string>();

    for (const item of disqualifications) {
      if (item.scope === 'FORMAT') {
        keys.add(`FORMAT:${item.participantId}`);
      }

      if (item.scope === 'SEASON' && item.seasonId) {
        keys.add(
          `SEASON:${item.participantId}:${item.seasonId}`,
        );
      }

      if (item.scope === 'STAGE' && item.stageId) {
        keys.add(
          `STAGE:${item.participantId}:${item.stageId}`,
        );
      }
    }

    return keys;
  }

  private async loadResults(where: any = {}) {
    return (await this.prisma.result.findMany({
      where: {
        ...where,
        registration: {
          ...(where.registration ?? {}),
          status: 'ACTIVE',
        },
        OR: [
          { isHistorical: false },
          {
            isHistorical: true,
            verificationStatus: 'VERIFIED',
          },
        ],
      },
      select: this.resultSelect,
      orderBy: [
        { registration: { stage: { date: 'desc' } } },
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    })) as unknown as ResultRow[];
  }

  private async buildParticipantStats(
    participant: {
      id: string;
      firstName: string;
      lastName: string;
      middleName: string | null;
      team: string | null;
      city: string | null;
      photoUrl: string | null;
      isPublic: boolean;
    },
    registrations: Array<{
      id: string;
      status: string;
      stageId: string;
      carId: string;
      registeredAt: Date;
      inspection: {
        status: string;
      } | null;
    }>,
    results: ResultRow[],
    disqualificationKeys: Set<string>,
    recordsCount: number,
  ) {
    const eligibleResults = results.filter((result) =>
      this.isEligibleResult(result, disqualificationKeys),
    );

    const attendedStageIds = new Set(
      registrations
        .filter(
          (registration) =>
            registration.status === 'ACTIVE' &&
            registration.inspection?.status === 'PASSED',
        )
        .map((registration) => registration.stageId),
    );

    for (const result of eligibleResults) {
      attendedStageIds.add(result.registration.stageId);
    }

    const appearanceRegistrationIds = new Set(
      eligibleResults.map((result) => result.registration.id),
    );

    const carIds = new Set(
      registrations
        .filter((registration) => registration.status === 'ACTIVE')
        .map((registration) => registration.carId),
    );

    const winsByClass = new Map<
      string,
      {
        classId: string;
        code: string;
        name: string;
        wins: number;
      }
    >();

    for (const result of eligibleResults) {
      if (result.place === 1) {
        const key = result.registrationClass.classId;
        const current = winsByClass.get(key);

        winsByClass.set(key, {
          classId: key,
          code: result.registrationClass.class.code,
          name: result.registrationClass.class.name,
          wins: (current?.wins ?? 0) + 1,
        });
      }
    }

    const bestByClass = new Map<string, ResultRow>();

    for (const result of eligibleResults) {
      const classId = result.registrationClass.classId;
      const current = bestByClass.get(classId);

      if (
        !current ||
        Number(result.value) > Number(current.value) ||
        (
          Number(result.value) === Number(current.value) &&
          result.registration.stage.date.getTime() <
            current.registration.stage.date.getTime()
        )
      ) {
        bestByClass.set(classId, result);
      }
    }

    const bestResultsByClass = [...bestByClass.values()]
      .sort(
        (a, b) =>
          a.registrationClass.class.sortOrder -
          b.registrationClass.class.sortOrder,
      )
      .map((result) => ({
        class: result.registrationClass.class,
        value: result.value.toString(),
        unit: result.unit,
        stage: {
          id: result.registration.stage.id,
          name: result.registration.stage.name,
          date: result.registration.stage.date,
          season: result.registration.stage.season,
        },
      }));

    return {
      participant,
      stats: {
        attendedStages: attendedStageIds.size,
        registrations: registrations.filter(
          (registration) => registration.status === 'ACTIVE',
        ).length,
        appearances: appearanceRegistrationIds.size,
        resultCount: eligibleResults.length,
        firstPlaces: eligibleResults.filter(
          (result) => result.place === 1,
        ).length,
        secondPlaces: eligibleResults.filter(
          (result) => result.place === 2,
        ).length,
        thirdPlaces: eligibleResults.filter(
          (result) => result.place === 3,
        ).length,
        podiums: eligibleResults.filter(
          (result) =>
            result.place !== null &&
            result.place >= 1 &&
            result.place <= 3,
        ).length,
        winsByClass: [...winsByClass.values()].sort(
          (a, b) => b.wins - a.wins,
        ),
        bestResultsByClass,
        bestResult: null,
        cars: carIds.size,
        records: recordsCount,
      },
      history: eligibleResults.map((result) => ({
        resultId: result.id,
        historical: result.isHistorical,
        value: result.value.toString(),
        unit: result.unit,
        place: result.place,
        stage: {
          id: result.registration.stage.id,
          stageNumber: result.registration.stage.stageNumber,
          name: result.registration.stage.name,
          city: result.registration.stage.city,
          date: result.registration.stage.date,
          season: result.registration.stage.season,
        },
        class: result.registrationClass.class,
        car: result.registration.car,
        participantNumber: result.registration.participantNumber,
      })),
    };
  }

  async getParticipant(participantId: string) {
    const participant =
      await this.prisma.participant.findUnique({
        where: { id: participantId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          team: true,
          city: true,
          photoUrl: true,
          isPublic: true,
        },
      });

    if (!participant) {
      throw new NotFoundException('Участник не найден');
    }

    const [registrations, results, recordsCount] =
      await Promise.all([
        this.prisma.registration.findMany({
          where: { participantId },
          select: {
            id: true,
            status: true,
            stageId: true,
            carId: true,
            registeredAt: true,
            inspection: {
              select: {
                status: true,
              },
            },
          },
        }),
        this.loadResults({
          registration: { participantId },
        }),
        this.prisma.record.count({
          where: {
            participantId,
            isCurrent: true,
          },
        }),
      ]);

    const keys = await this.getDisqualificationKeys([
      participantId,
    ]);

    return this.buildParticipantStats(
      participant,
      registrations,
      results,
      keys,
      recordsCount,
    );
  }

  async getParticipants(params: {
    search?: string;
    page: number;
    limit: number;
  }) {
    this.validatePagination(params.page, params.limit);

    const search = params.search?.trim();

    const where = search
      ? {
          OR: [
            {
              lastName: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              firstName: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              middleName: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              team: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              city: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : undefined;

    const [total, participants] = await Promise.all([
      this.prisma.participant.count({ where }),
      this.prisma.participant.findMany({
        where,
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
        ],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          team: true,
          city: true,
          photoUrl: true,
          isPublic: true,
        },
      }),
    ]);

    if (!participants.length) {
      return {
        items: [],
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          pages: Math.ceil(total / params.limit),
        },
      };
    }

    const ids = participants.map((participant) => participant.id);

    const [registrations, results, records] =
      await Promise.all([
        this.prisma.registration.findMany({
          where: { participantId: { in: ids } },
          select: {
            id: true,
            participantId: true,
            status: true,
            stageId: true,
            carId: true,
            registeredAt: true,
          },
        }),
        this.loadResults({
          registration: {
            participantId: { in: ids },
          },
        }),
        this.prisma.record.findMany({
          where: {
            participantId: { in: ids },
            isCurrent: true,
          },
          select: {
            participantId: true,
          },
        }),
      ]);

    const keys = await this.getDisqualificationKeys(ids);

    const items = participants.map((participant) =>
      this.buildParticipantStats(
        participant,
        registrations.filter(
          (registration) =>
            registration.participantId === participant.id,
        ),
        results.filter(
          (result) =>
            result.registration.participantId === participant.id,
        ),
        keys,
        records.filter(
          (record) => record.participantId === participant.id,
        ).length,
      ),
    );

    return {
      items: await Promise.all(items),
      pagination: {
        page: params.page,
        limit: params.limit,
        total,
        pages: Math.ceil(total / params.limit),
      },
    };
  }

  async getStage(stageId: string) {
    const stage =
      await this.prisma.stage.findUnique({
        where: { id: stageId },
        select: {
          id: true,
          stageNumber: true,
          name: true,
          city: true,
          date: true,
          status: true,
          season: {
            select: {
              id: true,
              name: true,
              year: true,
            },
          },
        },
      });

    if (!stage) {
      throw new NotFoundException('Этап не найден');
    }

    const [registrations, results] = await Promise.all([
      this.prisma.registration.findMany({
        where: {
          stageId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          participantId: true,
          carId: true,
        },
      }),
      this.loadResults({
        registration: { stageId },
      }),
    ]);

    const ids = [...new Set(results.map(
      (result) => result.registration.participantId,
    ))];

    const keys = await this.getDisqualificationKeys(ids);
    const eligibleResults = results.filter((result) =>
      this.isEligibleResult(result, keys),
    );

    const classes = new Map<string, any>();

    for (const result of eligibleResults) {
      const classId = result.registrationClass.classId;
      const current = classes.get(classId) ?? {
        class: result.registrationClass.class,
        participants: new Set<string>(),
        appearances: 0,
        firstPlaces: 0,
        podiums: 0,
        bestResult: null as ResultRow | null,
      };

      current.participants.add(
        result.registration.participantId,
      );
      current.appearances += 1;

      if (result.place === 1) {
        current.firstPlaces += 1;
      }

      if (
        result.place !== null &&
        result.place >= 1 &&
        result.place <= 3
      ) {
        current.podiums += 1;
      }

      if (
        !current.bestResult ||
        Number(result.value) > Number(current.bestResult.value)
      ) {
        current.bestResult = result;
      }

      classes.set(classId, current);
    }

    return {
      stage,
      stats: {
        registrations: registrations.length,
        participants: new Set(
          registrations.map((registration) =>
            registration.participantId,
          ),
        ).size,
        cars: new Set(
          registrations.map((registration) =>
            registration.carId,
          ),
        ).size,
        appearances: eligibleResults.length,
        classResults: [...classes.values()]
          .sort(
            (a, b) =>
              a.class.sortOrder -
              b.class.sortOrder,
          )
          .map((item) => ({
            class: item.class,
            participants: item.participants.size,
            appearances: item.appearances,
            firstPlaces: item.firstPlaces,
            podiums: item.podiums,
            bestResult: item.bestResult
              ? {
                  value: item.bestResult.value.toString(),
                  unit: item.bestResult.unit,
                  participant:
                    item.bestResult.registration.participant,
                  car: item.bestResult.registration.car,
                }
              : null,
          })),
      },
    };
  }

  async getClass(classId: string) {
    const classItem =
      await this.prisma.class.findUnique({
        where: { id: classId },
        select: {
          id: true,
          code: true,
          name: true,
          unit: true,
          sortOrder: true,
          direction: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

    if (!classItem) {
      throw new NotFoundException('Класс не найден');
    }

    const results = await this.loadResults({
      registrationClass: { classId },
    });

    const ids = [...new Set(results.map(
      (result) => result.registration.participantId,
    ))];

    const keys = await this.getDisqualificationKeys(ids);
    const eligibleResults = results.filter((result) =>
      this.isEligibleResult(result, keys),
    );

    const participants = new Set<string>();
    const stages = new Set<string>();
    const cars = new Set<string>();

    let firstPlaces = 0;
    let podiums = 0;
    let bestResult: ResultRow | null = null;

    for (const result of eligibleResults) {
      participants.add(result.registration.participantId);
      stages.add(result.registration.stageId);
      cars.add(result.registration.carId);

      if (result.place === 1) firstPlaces += 1;
      if (
        result.place !== null &&
        result.place >= 1 &&
        result.place <= 3
      ) {
        podiums += 1;
      }

      if (
        !bestResult ||
        Number(result.value) > Number(bestResult.value) ||
        (
          Number(result.value) === Number(bestResult.value) &&
          result.registration.stage.date.getTime() <
            bestResult.registration.stage.date.getTime()
        )
      ) {
        bestResult = result;
      }
    }

    return {
      class: classItem,
      stats: {
        participants: participants.size,
        stages: stages.size,
        cars: cars.size,
        appearances: new Set(
          eligibleResults.map((result) => result.registration.id),
        ).size,
        resultCount: eligibleResults.length,
        firstPlaces,
        podiums,
        bestResult: bestResult
          ? {
              value: bestResult.value.toString(),
              unit: bestResult.unit,
              participant: bestResult.registration.participant,
              car: bestResult.registration.car,
              stage: bestResult.registration.stage,
            }
          : null,
      },
      history: eligibleResults.map((result) => ({
        resultId: result.id,
        value: result.value.toString(),
        unit: result.unit,
        place: result.place,
        participant: result.registration.participant,
        car: result.registration.car,
        stage: result.registration.stage,
      })),
    };
  }

  async getCar(carId: string) {
    const car = await this.prisma.car.findUnique({
      where: { id: carId },
      select: {
        id: true,
        participantId: true,
        brand: true,
        model: true,
        registrationNumber: true,
        registrationCountry: true,
        color: true,
        photoUrl: true,
        isActive: true,
        participant: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            team: true,
            city: true,
          },
        },
        configurations: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            currentVersion: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!car) {
      throw new NotFoundException('Автомобиль не найден');
    }

    const results = await this.loadResults({
      registration: { carId },
    });

    const keys = await this.getDisqualificationKeys([
      car.participantId,
    ]);

    const eligibleResults = results.filter((result) =>
      this.isEligibleResult(result, keys),
    );

    const stages = new Set<string>();
    const classes = new Set<string>();

    let firstPlaces = 0;
    let secondPlaces = 0;
    let thirdPlaces = 0;
    let bestResult: ResultRow | null = null;

    for (const result of eligibleResults) {
      stages.add(result.registration.stageId);
      classes.add(result.registrationClass.classId);

      if (result.place === 1) firstPlaces += 1;
      if (result.place === 2) secondPlaces += 1;
      if (result.place === 3) thirdPlaces += 1;

      if (
        !bestResult ||
        Number(result.value) > Number(bestResult.value) ||
        (
          Number(result.value) === Number(bestResult.value) &&
          result.registration.stage.date.getTime() <
            bestResult.registration.stage.date.getTime()
        )
      ) {
        bestResult = result;
      }
    }

    const currentRecords = await this.prisma.record.count({
      where: {
        carId,
        isCurrent: true,
      },
    });

    return {
      car,
      stats: {
        stages: stages.size,
        classes: classes.size,
        appearances: eligibleResults.length,
        firstPlaces,
        secondPlaces,
        thirdPlaces,
        podiums: firstPlaces + secondPlaces + thirdPlaces,
        records: currentRecords,
        bestResult: bestResult
          ? {
              value: bestResult.value.toString(),
              unit: bestResult.unit,
              class: bestResult.registrationClass.class,
              stage: bestResult.registration.stage,
            }
          : null,
      },
      history: eligibleResults.map((result) => ({
        resultId: result.id,
        value: result.value.toString(),
        unit: result.unit,
        place: result.place,
        class: result.registrationClass.class,
        stage: result.registration.stage,
      })),
    };
  }

  async getSeason(seasonId: string) {
    const season =
      await this.prisma.season.findUnique({
        where: { id: seasonId },
        select: {
          id: true,
          name: true,
          year: true,
          status: true,
        },
      });

    if (!season) {
      throw new NotFoundException('Сезон не найден');
    }

    const [stages, registrations, results] =
      await Promise.all([
        this.prisma.stage.count({
          where: {
            seasonId,
            isDeleted: false,
          },
        }),
        this.prisma.registration.findMany({
          where: {
            stage: { seasonId },
            status: 'ACTIVE',
          },
          select: {
            participantId: true,
            carId: true,
            stageId: true,
          },
        }),
        this.loadResults({
          registration: {
            stage: { seasonId },
          },
        }),
      ]);

    const ids = [...new Set(results.map(
      (result) => result.registration.participantId,
    ))];

    const keys = await this.getDisqualificationKeys(ids);
    const eligibleResults = results.filter((result) =>
      this.isEligibleResult(result, keys),
    );

    return {
      season,
      stats: {
        stages,
        participants: new Set(
          registrations.map((registration) =>
            registration.participantId,
          ),
        ).size,
        cars: new Set(
          registrations.map((registration) =>
            registration.carId,
          ),
        ).size,
        registrations: registrations.length,
        appearances: new Set(
          eligibleResults.map((result) => result.registration.id),
        ).size,
        resultCount: eligibleResults.length,
        firstPlaces: eligibleResults.filter(
          (result) => result.place === 1,
        ).length,
        podiums: eligibleResults.filter(
          (result) =>
            result.place !== null &&
            result.place >= 1 &&
            result.place <= 3,
        ).length,
      },
    };
  }

  async getOverview() {
    const [
      participants,
      cars,
      seasons,
      stages,
      activeRegistrations,
      currentRecords,
      results,
    ] = await Promise.all([
      this.prisma.participant.count(),
      this.prisma.car.count({
        where: { isActive: true },
      }),
      this.prisma.season.count({
        where: { isActive: true },
      }),
      this.prisma.stage.count({
        where: { isDeleted: false },
      }),
      this.prisma.registration.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.record.count({
        where: { isCurrent: true },
      }),
      this.loadResults(),
    ]);

    const ids = [...new Set(results.map(
      (result) => result.registration.participantId,
    ))];

    const keys = await this.getDisqualificationKeys(ids);
    const eligibleResults = results.filter((result) =>
      this.isEligibleResult(result, keys),
    );

    const byParticipant = new Map<string, {
      participant: ResultRow['registration']['participant'];
      attendedStages: Set<string>;
      wins: number;
      podiums: number;
    }>();

    for (const result of eligibleResults) {
      const participantId = result.registration.participantId;
      const current = byParticipant.get(participantId) ?? {
        participant: result.registration.participant,
        attendedStages: new Set<string>(),
        wins: 0,
        podiums: 0,
      };

      current.attendedStages.add(result.registration.stageId);

      if (result.place === 1) current.wins += 1;
      if (
        result.place !== null &&
        result.place >= 1 &&
        result.place <= 3
      ) {
        current.podiums += 1;
      }

      byParticipant.set(participantId, current);
    }

    const topParticipants = [...byParticipant.values()]
      .sort((a, b) =>
        b.wins - a.wins ||
        b.attendedStages.size - a.attendedStages.size ||
        b.podiums - a.podiums ||
        a.participant.lastName.localeCompare(
          b.participant.lastName,
          'ru',
        ),
      )
      .slice(0, 10)
      .map((item) => ({
        participant: item.participant,
        attendedStages: item.attendedStages.size,
        wins: item.wins,
        podiums: item.podiums,
      }));

    return {
      stats: {
        participants,
        cars,
        seasons,
        stages,
        activeRegistrations,
        appearances: eligibleResults.length,
        currentRecords,
      },
      topParticipants,
    };
  }
}
