import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Injectable()
export class RecordsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Keep official records visible while redacting private participant and car details. */
  private sanitizePublicRecord<T extends { result?: { registration?: { car?: any; participant?: any } | null } | null }>(record: T): T {
    const car = record.result?.registration?.car;
    const participant = record.result?.registration?.participant;
    const hideCar = Boolean(car && car.isPublic === false);
    const hideParticipant = Boolean(participant && participant.isPublic === false);
    if (!hideCar && !hideParticipant) return record;
    return {
      ...record,
      result: {
        ...record.result,
        registration: {
          ...record.result?.registration,
          ...(hideCar ? {
            car: { ...car, brand: 'Автомобиль скрыт', model: '', color: null, photoUrl: null },
          } : {}),
          ...(hideParticipant ? {
            participant: {
              ...participant,
              lastName: 'Участник скрыт',
              firstName: '',
              middleName: null,
              team: null,
              city: null,
              photoUrl: null,
            },
          } : {}),
        },
      },
    } as T;
  }

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

    const manualRecord = await tx.record.findFirst({
      where: { classId, isCurrent: true, isManualOverride: true },
      include: {
        result: {
          include: {
            registration: {
              select: {
                participantId: true,
                stageId: true,
                status: true,
                stage: { select: { seasonId: true } },
              },
            },
            registrationClass: { select: { classId: true } },
          },
        },
      },
    });

    if (manualRecord?.result) {
      const result = manualRecord.result;
      const valid =
        result.registration.status === 'ACTIVE' &&
        result.registrationClass.classId === classId &&
        (!result.isHistorical || result.verificationStatus === 'VERIFIED') &&
        !(await this.isResultDisqualified(
          tx,
          result.registration.participantId,
          result.registration.stageId,
          result.registration.stage.seasonId,
        ));

      if (valid) {
        return [await tx.record.findUniqueOrThrow({
          where: { id: manualRecord.id },
          include: this.publicInclude,
        })];
      }

      await tx.record.update({
        where: { id: manualRecord.id },
        data: { isCurrent: false, isManualOverride: false },
      });
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

  async findManualCandidates(classId: string) {
    const classItem = await this.prisma.class.findUnique({
      where: { id: classId },
      include: { direction: true },
    });
    if (!classItem) throw new NotFoundException('Класс не найден');
    if (
      classItem.direction?.name?.trim().toLowerCase() === 'bassrace' ||
      classItem.code?.trim().toLowerCase().startsWith('bassrace') ||
      classItem.name?.trim().toLowerCase().startsWith('bassrace')
    ) {
      throw new ConflictException('Для Bass Race исторические рекорды не ведутся');
    }

    const results = await this.prisma.result.findMany({
      where: {
        registrationClass: { classId },
        registration: { status: 'ACTIVE' },
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
            stage: { include: { season: true } },
          },
        },
        registrationClass: { include: { class: { include: { direction: true } } } },
      },
      orderBy: [
        { registration: { stage: { date: 'desc' } } },
        { value: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    const candidates = [];
    for (const result of results) {
      if (await this.isResultDisqualified(
        this.prisma,
        result.registration.participantId,
        result.registration.stageId,
        result.registration.stage.seasonId,
      )) continue;
      candidates.push(result);
    }
    return candidates;
  }

  async updateManualRecord(
    id: string,
    resultId: string,
    notes: string | null | undefined,
    request: AuthenticatedRequest,
  ) {
    if (request.user.role !== 'ADMIN') {
      throw new ConflictException('Изменять рекорды может только администратор');
    }

    const record = await this.prisma.record.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Рекорд не найден');

    const result = await this.prisma.result.findUnique({
      where: { id: resultId },
      include: {
        registration: {
          include: {
            participant: true,
            car: true,
            stage: { include: { season: true } },
          },
        },
        registrationClass: { include: { class: { include: { direction: true } } } },
      },
    });
    if (!result) throw new NotFoundException('Результат не найден');
    if (result.registrationClass.classId !== record.classId) {
      throw new ConflictException('Нельзя назначить рекорд результату из другого класса');
    }
    if (result.registration.status !== 'ACTIVE') {
      throw new ConflictException('Нельзя назначить рекорд отменённой регистрации');
    }
    if (result.isHistorical && result.verificationStatus !== 'VERIFIED') {
      throw new ConflictException('Сначала подтвердите исторический результат');
    }
    if (await this.isResultDisqualified(
      this.prisma,
      result.registration.participantId,
      result.registration.stageId,
      result.registration.stage.seasonId,
    )) {
      throw new ConflictException('Дисквалифицированный результат не может стать рекордом');
    }
    if (
      result.id !== record.resultId &&
      result.place !== 1 &&
      Number(result.value) <= Number(record.value)
    ) {
      throw new ConflictException('Для подтверждения рекорда на финале нужно занять 1-е место в этом классе или превысить действующее значение рекорда');
    }

    const cls = result.registrationClass.class;
    if (
      cls.direction?.name?.trim().toLowerCase() === 'bassrace' ||
      cls.code?.trim().toLowerCase().startsWith('bassrace') ||
      cls.name?.trim().toLowerCase().startsWith('bassrace')
    ) {
      throw new ConflictException('Для Bass Race исторические рекорды не ведутся');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const existingResultRecord = result.id === record.resultId
        ? null
        : await tx.record.findUnique({ where: { resultId: result.id } });
      if (existingResultRecord && existingResultRecord.classId !== record.classId) {
        throw new ConflictException('У выбранного результата уже есть запись рекорда в другом классе');
      }

      await tx.record.updateMany({
        where: { classId: record.classId, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.result.updateMany({
        where: { registrationClass: { classId: record.classId }, isBest: true },
        data: { isBest: false },
      });

      const targetRecordId = existingResultRecord?.id ?? id;
      if (targetRecordId !== id) {
        await tx.record.update({
          where: { id },
          data: { isCurrent: false, isManualOverride: false },
        });
      }

      const saved = await tx.record.update({
        where: { id: targetRecordId },
        data: {
          classId: record.classId,
          seasonId: result.registration.stage.seasonId,
          stageId: result.registration.stageId,
          participantId: result.registration.participantId,
          carId: result.registration.carId,
          resultId: result.id,
          value: result.value,
          unit: result.unit,
          achievedAt: result.registration.stage.date,
          isCurrent: true,
          isManualOverride: true,
          notes: notes?.trim() || result.notes || null,
        },
        include: this.adminInclude,
      });

      await tx.result.update({ where: { id: result.id }, data: { isBest: true } });
      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'RECORD_MANUALLY_ASSIGNED',
          entity: 'Record',
          entityId: saved.id,
          ipAddress: request.ip,
          metadata: {
            classId: record.classId,
            resultId: result.id,
            stageId: result.registration.stageId,
            participantId: result.registration.participantId,
            value: result.value.toString(),
          },
        },
      });
      return saved;
    });

    return updated;
  }

  async findAll() {
    return this.prisma.record.findMany({
      where: {
        result: {
          registration: {
            stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
          },
        },
      },
      include: this.publicInclude,
      orderBy: [
        { class: { direction: { sortOrder: 'asc' } } },
        { class: { sortOrder: 'asc' } },
        { achievedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    }).then((records) => records.map((record) => this.sanitizePublicRecord(record)));
  }

  async findCurrent() {
    return this.prisma.record.findMany({
      where: {
        isCurrent: true,
        result: {
          registration: {
            stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
          },
        },
      },
      include: this.publicInclude,
      orderBy: [
        { class: { direction: { sortOrder: 'asc' } } },
        { class: { sortOrder: 'asc' } },
      ],
    }).then((records) => records.map((record) => this.sanitizePublicRecord(record)));
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
            stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
          },
        },
      },
      include: this.publicInclude,
      orderBy: [
        { isCurrent: 'desc' },
        { achievedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    }).then((records) => records.map((record) => this.sanitizePublicRecord(record)));
  }

  async findBySeason(seasonId: string) {
    return this.prisma.record.findMany({
      where: {
        seasonId,
        result: {
          registration: {
            stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
          },
        },
      },
      include: this.publicInclude,
      orderBy: [
        { class: { direction: { sortOrder: 'asc' } } },
        { class: { sortOrder: 'asc' } },
        { achievedAt: 'desc' },
        { createdAt: 'desc' },
      ],
    }).then((records) => records.map((record) => this.sanitizePublicRecord(record)));
  }

  async findOne(id: string) {
    const record = await this.prisma.record.findUnique({
      where: {
        id,
        result: {
          registration: {
            stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
          },
        },
      },
      include: this.publicInclude,
    });

    if (!record) {
      throw new NotFoundException('Рекорд не найден');
    }

    return this.sanitizePublicRecord(record);
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
