import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly publicInclude = {
    class: {
      include: {
        direction: true,
      },
    },
    stage: {
      include: {
        season: true,
      },
    },
    result: {
      include: {
        registration: {
          select: {
            id: true,
            participantNumber: true,
            source: true,
            participant: {
              select: {
                id: true,
                lastName: true,
                firstName: true,
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
                color: true,
                photoUrl: true,
                isPublic: true,
              },
            },
            stage: {
              include: {
                season: true,
              },
            },
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
      },
    },
  } satisfies Prisma.RecordInclude;

  private readonly adminInclude = {
    class: {
      include: {
        direction: true,
      },
    },
    stage: {
      include: {
        season: true,
      },
    },
    result: {
      include: {
        registration: {
          include: {
            participant: {
              select: {
                id: true,
                lastName: true,
                firstName: true,
                middleName: true,
                team: true,
                city: true,
                photoUrl: true,
                isPublic: true,
              },
            },
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
            class: {
              include: {
                direction: true,
              },
            },
          },
        },
      },
    },
  } satisfies Prisma.RecordInclude;


  private async getResultContext(tx: any, resultId: string) {
    const result = await tx.result.findUnique({
      where: { id: resultId },
      include: {
        registration: {
          include: {
            participant: true,
            car: true,
            stage: { include: { season: true } },
          },
        },
        registrationClass: {
          include: { class: { include: { direction: true } } },
        },
      },
    });

    if (!result) {
      throw new NotFoundException('Результат не найден');
    }

    return result;
  }

  /**
   * Recalculates the single current all-time record for one class.
   *
   * Every result remains eligible, including imported historical results.
   * A disqualified result is temporarily excluded while its disqualification
   * is ACTIVE. Old Record rows are never deleted: they form the record history.
   */
  private async recalculateCurrentRecordForClass(
    tx: any,
    classId: string,
  ) {
    const classItem = await tx.class.findUnique({
      where: { id: classId },
      select: { id: true, name: true, unit: true },
    });

    if (!classItem) {
      throw new NotFoundException('Класс не найден');
    }

    // BassRace classes have ordinary results, but USD does not maintain
    // all-time records for them.
    const classWithDirection = await tx.class.findUnique({
      where: { id: classId },
      include: { direction: true },
    });

    if (
      classWithDirection?.direction?.name?.trim().toLowerCase() === 'bassrace'
      || classWithDirection?.code?.trim().toLowerCase().startsWith('bassrace')
      || classWithDirection?.name?.trim().toLowerCase().startsWith('bassrace')
    ) {
      await tx.record.updateMany({
        where: { classId, isCurrent: true },
        data: { isCurrent: false },
      });

      await tx.result.updateMany({
        where: {
          registrationClass: { classId },
          isBest: true,
        },
        data: { isBest: false },
      });

      return [];
    }

    const results = await tx.result.findMany({
      where: {
        registrationClass: { classId },
        OR: [
          { isHistorical: false },
          { isHistorical: true, verificationStatus: 'VERIFIED' },
        ],
      },
      include: {
        registration: {
          select: {
            id: true,
            participantId: true,
            stageId: true,
            carId: true,
            source: true,
            status: true,
            registeredAt: true,
            participant: true,
            car: true,
            stage: {
              select: { id: true, seasonId: true, date: true },
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
                name: true,
                unit: true,
                direction: true,
              },
            },
          },
        },
      },
      orderBy: [
        { registration: { stage: { date: 'asc' } } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });

    // Load active disqualifications once. Querying once per result becomes
    // prohibitively expensive when rebuilding the all-time archive.
    const activeDisqualifications = await tx.disqualification.findMany({
      where: { status: 'ACTIVE' },
      select: { participantId: true, scope: true, stageId: true, seasonId: true },
    });
    const formatDisqualified = new Set<string>();
    const seasonDisqualified = new Set<string>();
    const stageDisqualified = new Set<string>();
    for (const item of activeDisqualifications) {
      if (item.scope === 'FORMAT') formatDisqualified.add(item.participantId);
      if (item.scope === 'SEASON' && item.seasonId) {
        seasonDisqualified.add(`${item.participantId}:${item.seasonId}`);
      }
      if (item.scope === 'STAGE' && item.stageId) {
        stageDisqualified.add(`${item.participantId}:${item.stageId}`);
      }
    }

    const eligible: any[] = [];
    for (const result of results) {
      if (result.registration.status !== 'ACTIVE') continue;
      const participantId = result.registration.participantId;
      const stageId = result.registration.stageId;
      const seasonId = result.registration.stage.seasonId;
      const disqualified = formatDisqualified.has(participantId)
        || seasonDisqualified.has(`${participantId}:${seasonId}`)
        || stageDisqualified.has(`${participantId}:${stageId}`);
      if (!disqualified) eligible.push(result);
    }

    // Rebuild the record timeline chronologically. A record entry is created
    // every time a result strictly exceeds the best value seen so far. Equal
    // values keep the earlier record holder. Historical entries are retained;
    // only the final record-setting result is marked current.
    eligible.sort((a, b) =>
      new Date(a.registration.stage.date).getTime() - new Date(b.registration.stage.date).getTime()
      || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      || String(a.id).localeCompare(String(b.id)),
    );

    await tx.record.updateMany({
      where: { classId, isCurrent: true },
      data: { isCurrent: false },
    });
    await tx.result.updateMany({
      where: { registrationClass: { classId }, isBest: true },
      data: { isBest: false },
    });

    let bestValue = Number.NEGATIVE_INFINITY;
    const recordBreakers: any[] = [];
    for (const result of eligible) {
      const value = Number(result.value);
      if (Number.isFinite(value) && value > bestValue) {
        bestValue = value;
        recordBreakers.push(result);
      }
    }

    if (recordBreakers.length === 0) return [];

    const winner = recordBreakers[recordBreakers.length - 1];
    await tx.result.update({
      where: { id: winner.id },
      data: { isBest: true },
    });

    const recordRows: any[] = [];
    for (const recordResult of recordBreakers) {
      const isCurrent = recordResult.id === winner.id;
      const data = {
        classId,
        seasonId: recordResult.registration.stage.seasonId,
        stageId: recordResult.registration.stageId,
        participantId: recordResult.registration.participantId,
        carId: recordResult.registration.carId ?? null,
        resultId: recordResult.id,
        value: recordResult.value,
        unit: recordResult.unit,
        achievedAt: recordResult.registration.stage.date,
        isCurrent,
        notes: recordResult.notes,
      };
      const existingRecord = await tx.record.findFirst({
        where: { resultId: recordResult.id },
        orderBy: { createdAt: 'desc' },
      });
      const saved = existingRecord
        ? await tx.record.update({
            where: { id: existingRecord.id },
            data: {
              classId: data.classId,
              seasonId: data.seasonId,
              stageId: data.stageId,
              participantId: data.participantId,
              carId: data.carId,
              value: data.value,
              unit: data.unit,
              achievedAt: data.achievedAt,
              isCurrent: data.isCurrent,
              notes: data.notes,
            },
            include: this.publicInclude,
          })
        : await tx.record.create({
            data,
            include: this.publicInclude,
          });
      recordRows.push(saved);
    }

    return recordRows;
  }

  async findAll() {
    return this.prisma.record.findMany({
      where: {
        result: {
          registration: {
            participant: { isPublic: true },
            car: { isPublic: true },
          },
        },
      },
      include: this.publicInclude,
      orderBy: [
        { class: { sortOrder: 'asc' } },
        { achievedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findCurrent() {
    return this.prisma.record.findMany({
      where: {
        isCurrent: true,
        result: {
          registration: {
            participant: { isPublic: true },
            car: { isPublic: true },
          },
        },
      },
      include: this.publicInclude,
      orderBy: [
        { class: { sortOrder: 'asc' } },
        { class: { direction: { sortOrder: 'asc' } } },
      ],
    });
  }

  async findByClass(classId: string) {
    const classItem = await this.prisma.class.findUnique({
      where: { id: classId },
      select: { id: true },
    });

    if (!classItem) {
      throw new NotFoundException('Класс не найден');
    }

    return this.prisma.record.findMany({
      where: {
        classId,
        result: {
          registration: {
            participant: { isPublic: true },
            car: { isPublic: true },
          },
        },
      },
      include: this.publicInclude,
      orderBy: [
        { isCurrent: 'desc' },
        { achievedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findBySeason(seasonId: string) {
    return this.prisma.record.findMany({
      where: {
        seasonId,
        result: {
          registration: {
            participant: { isPublic: true },
            car: { isPublic: true },
          },
        },
      },
      include: this.publicInclude,
      orderBy: { achievedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.record.findUnique({
      where: {
        id,
        result: {
          registration: {
            participant: { isPublic: true },
            car: { isPublic: true },
          },
        },
      },
      include: this.publicInclude,
    });

    if (!record) {
      throw new NotFoundException('Рекорд не найден');
    }

    return record;
  }

  async findCurrentAdmin() {
    return this.prisma.record.findMany({
      where: { isCurrent: true },
      include: this.adminInclude,
      orderBy: [
        { class: { direction: { sortOrder: 'asc' } } },
        { class: { sortOrder: 'asc' } },
      ],
    });
  }

  async findAllAdmin() {
    return this.prisma.record.findMany({
      include: this.adminInclude,
      orderBy: [
        { class: { direction: { sortOrder: 'asc' } } },
        { class: { sortOrder: 'asc' } },
        { achievedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async createFromResultIfEligible(resultId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const result = await this.getResultContext(tx, resultId);

        return this.recalculateCurrentRecordForClass(
          tx,
          result.registrationClass.classId,
        ).then((records: any[]) => {
          const record = records.find(
            (item: { resultId?: string }) => item.resultId === resultId,
          );

          return {
            created: Boolean(record),
            record: record ?? null,
            reason: record
              ? null
              : 'Результат не является текущим рекордом',
          };
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createFromResult(resultId: string) {
    const result = await this.createFromResultIfEligible(resultId);

    if (!result.created || !result.record) {
      throw new ConflictException(
        result.reason ?? 'Рекорд для данного результата не создан',
      );
    }

    return result.record;
  }

  async syncAfterResultUpdate(resultId: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const result = await this.getResultContext(tx, resultId);

        return this.recalculateCurrentRecordForClass(
          tx,
          result.registrationClass.classId,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async recalculateCurrentRecord(classId: string) {
    return this.prisma.$transaction(
      async (tx) => this.recalculateCurrentRecordForClass(tx, classId),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

}
