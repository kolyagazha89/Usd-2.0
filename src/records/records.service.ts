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

  private async isResultDisqualified(
    tx: any,
    participantId: string,
    stageId: string,
    seasonId: string,
  ): Promise<boolean> {
    const disqualification = await tx.disqualification.findFirst({
      where: {
        participantId,
        status: 'ACTIVE',
        OR: [
          { scope: 'FORMAT' },
          { scope: 'SEASON', seasonId },
          { scope: 'STAGE', stageId },
        ],
      },
      select: { id: true },
    });

    return Boolean(disqualification);
  }

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
          select: {
            id: true,
            participantId: true,
            stageId: true,
            source: true,
            status: true,
            registeredAt: true,
            participant: true,
            car: true,
            stage: {
              select: {
                id: true,
                seasonId: true,
                date: true,
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
                name: true,
                unit: true,
                direction: true,
              },
            },
          },
        },
      },
      orderBy: [
        { value: 'desc' },
        { registration: { stage: { date: 'asc' } } },
        { createdAt: 'asc' },
        { id: 'asc' },
      ],
    });

    const eligible: any[] = [];

    for (const result of results) {
      if (result.registration.status !== 'ACTIVE') {
        continue;
      }

      const disqualified = await this.isResultDisqualified(
        tx,
        result.registration.participantId,
        result.registration.stageId,
        result.registration.stage.seasonId,
      );

      if (!disqualified) {
        eligible.push(result);
      }
    }

    await tx.record.updateMany({
      where: {
        classId,
        isCurrent: true,
      },
      data: { isCurrent: false },
    });

    await tx.result.updateMany({
      where: {
        registrationClass: { classId },
        isBest: true,
      },
      data: { isBest: false },
    });

    if (eligible.length === 0) {
      return [];
    }

    // Results are already sorted by value DESC, then earliest createdAt.
    // Therefore the first item wins ties in favour of the earlier result.
    const winner = eligible[0];

    await tx.result.update({
      where: { id: winner.id },
      data: { isBest: true },
    });

    const existingRecord = await tx.record.findFirst({
      where: { resultId: winner.id },
      orderBy: { createdAt: 'desc' },
    });

    if (existingRecord) {
      const record = await tx.record.update({
        where: { id: existingRecord.id },
        data: {
          classId,
          seasonId: winner.registration.stage.seasonId,
          stageId: winner.registration.stageId,
          participantId: winner.registration.participantId,
          carId: winner.registration.carId,
          value: winner.value,
          unit: winner.unit,
          achievedAt: winner.registration.stage.date,
          isCurrent: true,
          notes: winner.notes,
        },
        include: this.publicInclude,
      });

      return [record];
    }

    const record = await tx.record.create({
      data: {
        classId,
        seasonId: winner.registration.stage.seasonId,
        stageId: winner.registration.stageId,
        participantId: winner.registration.participantId,
        carId: winner.registration.carId,
        resultId: winner.id,
        value: winner.value,
        unit: winner.unit,
        achievedAt: winner.registration.stage.date,
        isCurrent: true,
        notes: winner.notes,
      },
      include: this.publicInclude,
    });

    return [record];
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
