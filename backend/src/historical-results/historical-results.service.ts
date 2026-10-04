import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { ResultsRankingService } from '../results/results-ranking.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type {
  CreateHistoricalResultDto,
  UpdateHistoricalResultDto,
} from './dto/historical-result.dto';

@Injectable()
export class HistoricalResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recordsService: RecordsService,
    private readonly rankingService: ResultsRankingService,
  ) {}

  private validateValue(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new ConflictException('Значение результата должно быть неотрицательным числом');
    }
  }

  private validatePlace(place?: number | null) {
    if (place !== undefined && place !== null && (!Number.isInteger(place) || place < 1 || place > 999)) {
      throw new ConflictException('Место должно быть целым числом от 1 до 999');
    }
  }

  private include() {
    return {
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
      createdByUser: { select: { id: true, name: true, role: true } },
      verifiedByUser: { select: { id: true, name: true, role: true } },
      records: true,
    };
  }

  private publicInclude() {
    return {
      registration: {
        select: {
          id: true,
          participantNumber: true,
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
          },
        },
      },
      registrationClass: {
        select: {
          id: true,
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
  }

  async findPublic(stageId?: string) {
    return this.prisma.result.findMany({
      where: {
        isHistorical: true,
        verificationStatus: 'VERIFIED',
        registration: {
          ...(stageId ? { stageId } : {}),
          participant: { isPublic: true },
          car: { isPublic: true },
        },
      },
      include: this.publicInclude(),
      orderBy: [
        { registrationClass: { class: { sortOrder: 'asc' } } },
        { place: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async findPublicOne(id: string) {
    const result = await this.prisma.result.findFirst({
      where: {
        id,
        isHistorical: true,
        verificationStatus: 'VERIFIED',
        registration: {
          participant: { isPublic: true },
          car: { isPublic: true },
        },
      },
      include: this.publicInclude(),
    });

    if (!result) {
      throw new NotFoundException('Исторический результат не найден');
    }

    return result;
  }

  async findPending() {
    return this.prisma.result.findMany({
      where: {
        isHistorical: true,
        verificationStatus: 'PENDING',
      },
      include: this.include(),
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAllAdmin() {
    return this.prisma.result.findMany({
      where: { isHistorical: true },
      include: this.include(),
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneAdmin(id: string) {
    const result = await this.prisma.result.findFirst({
      where: { id, isHistorical: true },
      include: this.include(),
    });

    if (!result) throw new NotFoundException('Исторический результат не найден');
    return result;
  }

  private async getOrCreateCar(tx: any, data: CreateHistoricalResultDto) {
    if (data.carId) {
      const car = await tx.car.findUnique({
        where: { id: data.carId },
        select: { id: true, participantId: true },
      });
      if (!car) throw new NotFoundException('Автомобиль не найден');
      if (car.participantId !== data.participantId) {
        throw new ConflictException('Автомобиль не принадлежит выбранному участнику');
      }
      return car.id;
    }

    if (!data.carBrand?.trim() || !data.carModel?.trim() || !data.registrationNumber?.trim()) {
      throw new ConflictException(
        'Для создания архивного автомобиля укажите марку, модель и регистрационный номер',
      );
    }

    const car = await tx.car.create({
      data: {
        participantId: data.participantId,
        brand: data.carBrand.trim(),
        model: data.carModel.trim(),
        registrationNumber: data.registrationNumber.trim(),
        registrationCountry: data.registrationCountry ?? 'RU',
        isActive: false,
        isPublic: true,
      },
      select: { id: true },
    });

    return car.id;
  }

  private async getConfigurationVersion(tx: any, carId: string) {
    const existing = await tx.carConfigurationVersion.findFirst({
      where: { configuration: { carId } },
      orderBy: [{ createdAt: 'asc' }, { version: 'asc' }],
      select: { id: true },
    });

    if (existing) return existing.id;

    const configuration = await tx.carConfiguration.create({
      data: {
        carId,
        name: 'Архивная конфигурация',
        currentVersion: 1,
        isActive: false,
      },
      select: { id: true },
    });

    const version = await tx.carConfigurationVersion.create({
      data: {
        configurationId: configuration.id,
        version: 1,
        additionalDescription: 'Создано для исторического результата',
      },
      select: { id: true },
    });

    return version.id;
  }

  async create(data: CreateHistoricalResultDto, request: AuthenticatedRequest) {
    if (request.user.role !== 'ADMIN') {
      throw new ForbiddenException('Исторические результаты может вносить только администратор');
    }

    this.validateValue(data.value);
    this.validatePlace(data.place);

    const result = await this.prisma.$transaction(async (tx) => {
      const stage = await tx.stage.findUnique({
        where: { id: data.stageId },
        include: { season: true },
      });
      if (!stage || stage.isDeleted) throw new NotFoundException('Этап не найден');
      if (!['PUBLISHED', 'COMPLETED'].includes(stage.status)) {
        throw new ConflictException('Исторический результат можно привязать только к опубликованному или завершённому этапу');
      }

      const participant = await tx.participant.findUnique({
        where: { id: data.participantId },
        select: { id: true },
      });
      if (!participant) throw new NotFoundException('Участник не найден');

      const cls = await tx.class.findUnique({
        where: { id: data.classId },
        include: { direction: true },
      });
      if (!cls || !cls.isActive) throw new NotFoundException('Класс не найден или отключён');

      const stageClass = await tx.stageClass.findUnique({
        where: { stageId_classId: { stageId: data.stageId, classId: data.classId } },
        select: { id: true, isActive: true },
      });
      if (!stageClass || !stageClass.isActive) {
        throw new ConflictException('Класс не подключён к выбранному этапу');
      }

      const carId = await this.getOrCreateCar(tx, data);
      const configurationVersionId = await this.getConfigurationVersion(tx, carId);

      let registration = await tx.registration.findUnique({
        where: { stageId_carId: { stageId: data.stageId, carId } },
        select: { id: true, participantId: true, participantNumber: true, status: true, configurationVersionId: true, configurationSnapshot: true },
      });

      if (registration && registration.participantId !== data.participantId) {
        throw new ConflictException('Регистрация автомобиля на этом этапе принадлежит другому участнику');
      }

      if (registration && registration.participantNumber !== data.participantNumber) {
        throw new ConflictException('Номер участника не совпадает с существующей регистрацией этого автомобиля на этапе');
      }

      if (!registration) {
        const snapshot = await tx.carConfigurationVersion.findUnique({
          where: { id: configurationVersionId },
          include: {
            configuration: true,
            headUnits: true,
            audioComponents: true,
            amplifiers: true,
            batteries: true,
            generators: true,
          },
        });

        registration = await tx.registration.create({
          data: {
            stageId: data.stageId,
            participantId: data.participantId,
            carId,
            configurationVersionId,
            configurationSnapshot: snapshot ?? {},
            participantNumber: data.participantNumber,
            source: 'IMPORT',
            status: 'ACTIVE',
          },
          select: { id: true, participantId: true, participantNumber: true, status: true, configurationVersionId: true, configurationSnapshot: true },
        });

        if (!registration) {
          throw new ConflictException('Не удалось создать архивную регистрацию');
        }

        await tx.inspection.create({
          data: {
            registrationId: registration.id,
            status: 'PASSED',
            checkedByUserId: request.user.sub,
            checkedByName: 'Архивная историческая запись',
            notes: 'Архивная инспекция для исторического результата',
          },
        });
      }

      if (registration.status !== 'ACTIVE') {
        throw new ConflictException('Регистрация автомобиля отменена и не может использоваться для исторического результата');
      }

      const registrationClass = await tx.registrationClass.upsert({
        where: {
          registrationId_classId: {
            registrationId: registration.id,
            classId: data.classId,
          },
        },
        update: {},
        create: {
          registrationId: registration.id,
          classId: data.classId,
        },
        select: { id: true },
      });

      const existing = await tx.result.findUnique({
        where: { registrationClassId: registrationClass.id },
        select: { id: true, isHistorical: true },
      });
      if (existing) {
        throw new ConflictException('Для этого класса и этой регистрации результат уже существует');
      }

      const created = await tx.result.create({
        data: {
          registrationId: registration.id,
          registrationClassId: registrationClass.id,
          value: data.value,
          unit: cls.unit,
          place: data.place ?? null,
          notes: data.notes?.trim() || null,
          createdByUserId: request.user.sub,
          isHistorical: true,
          verificationStatus: 'PENDING',
        },
        include: this.include(),
      });

      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'HISTORICAL_RESULT_CREATED',
          entity: 'Result',
          entityId: created.id,
          ipAddress: request.ip,
          metadata: {
            stageId: data.stageId,
            participantId: data.participantId,
            carId,
            classId: data.classId,
            value: data.value,
            competitionDate: stage.date.toISOString(),
            verificationStatus: 'PENDING',
          },
        },
      });

      return created;
    }, { isolationLevel: 'Serializable' });

    return result;
  }

  async verify(id: string, request: AuthenticatedRequest) {
    if (request.user.role !== 'ADMIN') {
      throw new ForbiddenException('Подтверждать исторические результаты может только администратор');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.result.findUnique({
        where: { id },
        select: {
          id: true,
          isHistorical: true,
          verificationStatus: true,
          createdByUserId: true,
        },
      });

      if (!existing || !existing.isHistorical) {
        throw new NotFoundException('Исторический результат не найден');
      }
      if (existing.verificationStatus !== 'PENDING') {
        throw new ConflictException('Исторический результат не ожидает подтверждения');
      }
      const updated = await tx.result.update({
        where: { id },
        data: {
          verificationStatus: 'VERIFIED',
          verifiedByUserId: request.user.sub,
          verifiedAt: new Date(),
        },
        include: this.include(),
      });

      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'HISTORICAL_RESULT_VERIFIED',
          entity: 'Result',
          entityId: id,
          ipAddress: request.ip,
          metadata: {
            createdByUserId: existing.createdByUserId,
            verifiedByUserId: request.user.sub,
          },
        },
      });

      return updated;
    }, { isolationLevel: 'Serializable' });

    await this.recordsService.createFromResultIfEligible(result.id);
    await this.rankingService.recalculateByStageClass(
      result.registration.stageId,
      result.registrationClass.classId,
    );
    return this.findOneAdmin(result.id);
  }

  async update(id: string, data: UpdateHistoricalResultDto, request: AuthenticatedRequest) {
    if (request.user.role !== 'ADMIN') {
      throw new ForbiddenException('Исправлять исторические результаты может только администратор');
    }

    this.validateValue(data.value ?? 0);
    this.validatePlace(data.place);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.result.findUnique({
        where: { id },
        include: {
          registration: { include: { stage: true } },
        },
      });

      if (!existing || !existing.isHistorical) {
        throw new NotFoundException('Исторический результат не найден');
      }

      if (existing.verificationStatus !== 'VERIFIED') {
        throw new ConflictException('Редактировать можно только подтверждённый исторический результат');
      }

      const before = {
        value: existing.value.toString(),
        place: existing.place,
        notes: existing.notes,
      };

      const updated = await tx.result.update({
        where: { id },
        data: {
          value: data.value ?? existing.value,
          place: data.place !== undefined ? data.place : existing.place,
          notes: data.notes !== undefined ? data.notes?.trim() || null : existing.notes,
          verificationStatus: 'PENDING',
          verifiedByUserId: null,
          verifiedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: request.user.sub,
          action: 'HISTORICAL_RESULT_CORRECTED',
          entity: 'Result',
          entityId: id,
          ipAddress: request.ip,
          metadata: {
            before,
            after: {
              value: updated.value.toString(),
              place: updated.place,
              notes: updated.notes,
            },
            verificationStatus: 'PENDING',
          },
        },
      });
    }, { isolationLevel: 'Serializable' });

    await this.recordsService.syncAfterResultUpdate(id);
    const refreshed = await this.prisma.result.findUniqueOrThrow({
      where: { id },
      select: { registration: { select: { stageId: true } }, registrationClass: { select: { classId: true } } },
    });
    await this.rankingService.recalculateByStageClass(
      refreshed.registration.stageId,
      refreshed.registrationClass.classId,
    );
    return this.findOneAdmin(id);
  }
}
