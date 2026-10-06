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
      sortOrder: number;
      direction: {
        id: string;
        name: string;
        sortOrder: number;
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
                sortOrder: true,
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
            inspection: {
              select: {
                status: true,
              },
            },
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

    const [registrations, results, inspections] = await Promise.all([
      this.prisma.registration.findMany({
        where: {
          stageId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          participantId: true,
          carId: true,
          participantNumber: true,
          participant: {
            select: {
              firstName: true,
              lastName: true,
              middleName: true,
              team: true,
            },
          },
          car: {
            select: {
              brand: true,
              model: true,
              registrationNumber: true,
            },
          },
          classes: {
            select: {
              classId: true,
              class: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                  sortOrder: true,
                  direction: { select: { name: true, sortOrder: true } },
                },
              },
            },
          },
        },
      }),
      this.loadResults({
        registration: { stageId },
      }),
      this.prisma.inspection.findMany({
        where: { registration: { stageId } },
        select: {
          registrationId: true,
          status: true,
          notes: true,
          registration: {
            select: {
              participantNumber: true,
              participant: {
                select: {
                  firstName: true,
                  lastName: true,
                  middleName: true,
                  team: true,
                },
              },
              car: {
                select: {
                  brand: true,
                  model: true,
                  registrationNumber: true,
                },
              },
            },
          },
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
        inspections: {
          total: inspections.length,
          passed: inspections.filter((inspection) => inspection.status === 'PASSED').length,
          failed: inspections.filter((inspection) => inspection.status === 'FAILED').length,
          pending: Math.max(0, registrations.length - new Set(inspections.map((inspection) => inspection.registrationId)).size),
        },
        registrationClasses: (() => {
          const grouped = new Map<string, any>();
          for (const registration of registrations) {
            for (const item of registration.classes) {
              const current = grouped.get(item.classId) ?? {
                class: item.class,
                registrations: 0,
                participants: new Set<string>(),
                cars: new Set<string>(),
              };
              current.registrations += 1;
              current.participants.add(registration.participantId);
              current.cars.add(registration.carId);
              grouped.set(item.classId, current);
            }
          }
          return [...grouped.values()]
            .sort(
              (a, b) =>
                (a.class.direction?.sortOrder ?? 0) - (b.class.direction?.sortOrder ?? 0) ||
                (a.class.sortOrder ?? 0) - (b.class.sortOrder ?? 0) ||
                a.class.name.localeCompare(b.class.name, 'ru'),
            )
            .map((item) => ({
              class: item.class,
              registrations: item.registrations,
              participants: item.participants.size,
              cars: item.cars.size,
            }));
        })(),
        inspectionDetails: inspections
          .map((inspection) => ({
            registrationId: inspection.registrationId,
            status: inspection.status,
            notes: inspection.notes,
            participantNumber: inspection.registration.participantNumber,
            participant: inspection.registration.participant,
            car: inspection.registration.car,
          }))
          .sort((a, b) => a.participantNumber - b.participantNumber),
        pendingRegistrations: registrations
          .filter((registration) => !inspections.some((inspection) => inspection.registrationId === registration.id))
          .map((registration) => ({
            registrationId: registration.id,
            participantNumber: registration.participantNumber,
            participant: registration.participant,
            car: registration.car,
          }))
          .sort((a, b) => a.participantNumber - b.participantNumber),
        appearances: eligibleResults.length,
        classResults: [...classes.values()]
          .sort(
            (a, b) =>
              (a.class.direction?.sortOrder ?? 0) -
                (b.class.direction?.sortOrder ?? 0) ||
              a.class.sortOrder - b.class.sortOrder ||
              a.class.name.localeCompare(b.class.name, 'ru'),
          )
          .map((item) => ({
            class: item.class,
            participants: item.participants.size,
            appearances: item.appearances,
            firstPlaces: item.firstPlaces,
            podiums: item.podiums,
            results: eligibleResults
              .filter((result) => result.registrationClass.classId === item.class.id)
              .sort((a, b) =>
                (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER) ||
                Number(b.value) - Number(a.value),
              )
              .map((result) => ({
                id: result.id,
                value: result.value.toString(),
                unit: result.unit,
                place: result.place,
                participant: result.registration.participant,
                participantNumber: result.registration.participantNumber,
                car: result.registration.car,
              })),
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
              sortOrder: true,
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
    const bestByClass = new Map<string, ResultRow>();

    for (const result of eligibleResults) {
      stages.add(result.registration.stageId);
      classes.add(result.registrationClass.classId);

      if (result.place === 1) firstPlaces += 1;
      if (result.place === 2) secondPlaces += 1;
      if (result.place === 3) thirdPlaces += 1;

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
        bestResultsByClass: [...bestByClass.values()].map((result) => ({
          value: result.value.toString(),
          unit: result.unit,
          class: result.registrationClass.class,
          stage: result.registration.stage,
        })),
        bestResult: null,
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


  async getSeasonAnalytics(seasonId: string) {
    const season = await this.prisma.season.findUnique({
      where: { id: seasonId },
      select: { id: true, name: true, year: true, status: true },
    });
    if (!season) throw new NotFoundException('Сезон не найден');

    const registrations = await this.prisma.registration.findMany({
      where: { stage: { seasonId }, status: 'ACTIVE' },
      select: {
        id: true,
        participantId: true,
        carId: true,
        participant: { select: { id: true, firstName: true, lastName: true, middleName: true, team: true } },
        configurationSnapshot: true,
      },
    });

    const total = registrations.length;
    const withTeam = registrations.filter((r) => !!r.participant.team?.trim()).length;
    const teamMap = new Map<string, { registrations: number; participants: Set<string> }>();
    for (const r of registrations) {
      const team = r.participant.team?.trim() || 'Без команды';
      const item = teamMap.get(team) ?? { registrations: 0, participants: new Set<string>() };
      item.registrations += 1;
      item.participants.add(r.participantId);
      teamMap.set(team, item);
    }

    const isolationMap = new Map<string, number>();
    const brandMap = new Map<string, number>();
    const addBrand = (value: unknown) => {
      if (typeof value !== 'string') return;
      const brand = value.trim();
      if (!brand) return;
      brandMap.set(brand, (brandMap.get(brand) ?? 0) + 1);
    };
    const readSnapshot = (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return;
      const x = raw as Record<string, any>;
      if (typeof x.vibrationIsolation === 'string' && x.vibrationIsolation.trim()) {
        const key = x.vibrationIsolation.trim();
        isolationMap.set(key, (isolationMap.get(key) ?? 0) + 1);
      }
      for (const key of ['headUnits', 'audioComponents', 'amplifiers', 'batteries', 'generators']) {
        const list = Array.isArray(x[key]) ? x[key] : [];
        for (const item of list) {
          if (!item || typeof item !== 'object') continue;
          addBrand(item.brand);
        }
      }
    };
    registrations.forEach((r) => readSnapshot(r.configurationSnapshot));

    const pct = (n: number) => total ? Number(((n / total) * 100).toFixed(1)) : 0;
    const teams = [...teamMap.entries()]
      .map(([name, value]) => ({ name, registrations: value.registrations, participants: value.participants.size, percent: pct(value.registrations) }))
      .sort((a, b) => b.registrations - a.registrations || a.name.localeCompare(b.name, 'ru'));

    return {
      success: true,
      season,
      registrations: {
        total,
        withTeam,
        withoutTeam: total - withTeam,
        withoutTeamPercent: pct(total - withTeam),
      },
      teams,
      vibrationIsolation: [...isolationMap.entries()]
        .map(([name, count]) => ({ name, count, percent: pct(count) }))
        .sort((a, b) => b.count - a.count),
      configurationBrands: [...brandMap.entries()]
        .map(([brand, count]) => ({ brand, count, percent: pct(count) }))
        .sort((a, b) => b.count - a.count),
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

  async getDashboard() {
    const now = new Date();

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    // "Рабочий этап" means an event scheduled for the current calendar day.
    // Future stages must stay in "Ближайшие этапы" and must never leak into
    // the working-stage or recent-stage blocks.
    const currentStage = await this.prisma.stage.findFirst({
      where: {
        isDeleted: false,
        status: { not: 'CANCELLED' },
        date: {
          gte: todayStart,
          lt: tomorrowStart,
        },
      },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        stageNumber: true,
        name: true,
        city: true,
        date: true,
        registrationOpen: true,
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

    const nextStage = currentStage;

    const [
      overview,
      openStages,
      upcomingStages,
      recentStages,
      activeRegistrationStats,
      pendingInspections,
      failedInspections,
      resultsToday,
      activeDisqualifications,
      unresolvedImports,
    ] = await Promise.all([
      this.getOverview(),
      this.prisma.stage.count({
        where: {
          isDeleted: false,
          registrationOpen: true,
        },
      }),
      this.prisma.stage.findMany({
        where: {
          isDeleted: false,
          date: { gt: now },
          status: { not: 'CANCELLED' },
        },
        orderBy: { date: 'asc' },
        take: 5,
        select: {
          id: true,
          stageNumber: true,
          name: true,
          city: true,
          date: true,
          registrationOpen: true,
          season: {
            select: {
              id: true,
              name: true,
              year: true,
            },
          },
        },
      }),
      this.prisma.stage.findMany({
        where: {
          isDeleted: false,
          status: { not: 'CANCELLED' },
          // "Последние этапы" are completed calendar days only.
          // This explicitly excludes today's working stage and all future stages.
          date: { lt: todayStart },
        },
        orderBy: { date: 'desc' },
        take: 5,
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
      }),
      this.prisma.registration.findMany({
        where: {
          status: 'ACTIVE',
          ...(nextStage ? { stageId: nextStage.id } : {}),
        },
        select: { participantId: true, carId: true },
      }),
      this.prisma.registration.count({
        where: {
          status: 'ACTIVE',
          inspection: null,
        },
      }),
      this.prisma.inspection.count({
        where: { status: 'FAILED' },
      }),
      this.prisma.result.count({
        where: {
          createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
        },
      }),
      this.prisma.disqualification.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.importJob.count({
        where: {
          status: { in: ['DRAFT', 'READY'] },
          rows: { some: { status: 'WARNING' } },
        },
      }),
    ]);

    return {
      success: true,
      generatedAt: now,
      // Keep the dashboard contract flat and explicit. The previous response
      // returned getOverview() as { stats, topParticipants }, while the admin UI
      // consumes overview.participants / overview.cars / ... directly.
      overview: {
        ...overview.stats,
        topParticipants: overview.topParticipants,
      },
      currentStage: nextStage,
      attention: {
        openStages,
        pendingInspections,
        failedInspections,
        resultsToday,
        activeDisqualifications,
        unresolvedImports,
      },
      activeRegistrationStats: {
        registrations: activeRegistrationStats.length,
        participants: new Set(
          activeRegistrationStats.map((registration) => registration.participantId),
        ).size,
        cars: new Set(
          activeRegistrationStats.map((registration) => registration.carId),
        ).size,
      },
      upcomingStages,
      recentStages,
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
