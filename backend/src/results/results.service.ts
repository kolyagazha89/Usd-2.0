import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { ResultsRankingService } from './results-ranking.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import type { CreateResultDto, UpdateResultDto } from './dto/result.dto';

@Injectable()
export class ResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recordsService: RecordsService,
    private readonly rankingService: ResultsRankingService,
  ) {}

  private readonly publicInclude = {
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
        number: true,
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
    records: true,
  };

  private readonly adminInclude = {
    registration: {
      include: {
        stage: {
          include: {
            season: true,
          },
        },
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
            registrationCountry: true,
            registrationNumber: true,
            color: true,
            photoUrl: true,
            isPublic: true,
          },
        },
      },
    },
    registrationClass: {
      include: {
        number: true,
        class: {
          include: {
            direction: true,
          },
        },
      },
    },
    createdByUser: {
      select: {
        id: true,
        name: true,
        role: true,
      },
    },
    records: true,
    verifiedByUser: { select: { id: true, name: true, role: true } },
  };

  private isBassRace(className: string): boolean {
    return className.trim().toLowerCase().startsWith('bassrace');
  }

  private validateValue(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      throw new ConflictException(
        'Значение результата должно быть неотрицательным числом',
      );
    }
  }

  private validatePlace(place?: number | null) {
    if (
      place !== undefined &&
      place !== null &&
      (!Number.isInteger(place) || place < 1 || place > 999)
    ) {
      throw new ConflictException(
        'Место должно быть целым числом от 1 до 999',
      );
    }
  }

  private async assertResultAllowed(
    tx: any,
    participantId: string,
    stageId: string,
  ) {
    const stage = await tx.stage.findUnique({
      where: { id: stageId },
      select: { id: true, seasonId: true },
    });

    if (!stage) {
      throw new NotFoundException('Этап не найден');
    }

    const active = await tx.disqualification.findMany({
      where: {
        participantId,
        status: 'ACTIVE',
        OR: [
          { scope: 'FORMAT' },
          { scope: 'SEASON', seasonId: stage.seasonId },
          { scope: 'STAGE', stageId: stage.id },
        ],
      },
      select: { id: true, scope: true },
    });

    if (active.length === 0) return;

    const scopeMessage: Record<string, string> = {
      FORMAT: 'Участник дисквалифицирован по формату',
      SEASON: 'Участник дисквалифицирован на сезон',
      STAGE: 'Участник дисквалифицирован на этот этап',
    };

    const item = active[0];
    throw new ConflictException({
      message: scopeMessage[item.scope] ?? 'Участник дисквалифицирован',
      code: 'RESULT_DISQUALIFIED',
      disqualificationId: item.id,
    });
  }

  private async getRegistrationContext(tx: any, registrationId: string) {
    const registration = await tx.registration.findUnique({
      where: { id: registrationId },
      include: {
        inspection: true,
        stage: {
          select: {
            id: true,
            status: true,
            isDeleted: true,
            seasonId: true,
          },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException('Регистрация не найдена');
    }

    if (registration.status !== 'ACTIVE') {
      throw new ConflictException(
        'Нельзя внести результат для неактивной регистрации',
      );
    }

    if (
      registration.stage.isDeleted ||
      !['PUBLISHED', 'COMPLETED'].includes(registration.stage.status)
    ) {
      throw new ConflictException(
        'Результат нельзя внести для этого статуса этапа',
      );
    }

    if (!registration.inspection) {
      throw new ConflictException(
        'Участник не прошёл инспекцию: результат недоступен',
      );
    }

    if (registration.inspection.status !== 'PASSED') {
      throw new ConflictException(
        'Участник не допущен после инспекции: результат недоступен',
      );
    }

    await this.assertResultAllowed(
      tx,
      registration.participantId,
      registration.stageId,
    );

    return registration;
  }

  private async getRegistrationClassContext(
    tx: any,
    registrationId: string,
    registrationClassId: string,
  ) {
    const registrationClass = await tx.registrationClass.findUnique({
      where: { id: registrationClassId },
      include: {
        class: {
          include: {
            direction: true,
          },
        },
      },
    });

    if (!registrationClass) {
      throw new NotFoundException('Класс регистрации не найден');
    }

    if (registrationClass.registrationId !== registrationId) {
      throw new ConflictException(
        'Указанный класс не принадлежит данной регистрации',
      );
    }

    if (!registrationClass.class.isActive) {
      throw new ConflictException(
        'Нельзя внести результат для отключённого класса',
      );
    }

    const stageClass = await tx.stageClass.findUnique({
      where: {
        stageId_classId: {
          stageId: (
            await tx.registration.findUniqueOrThrow({
              where: { id: registrationId },
              select: { stageId: true },
            })
          ).stageId,
          classId: registrationClass.classId,
        },
      },
      select: { id: true, isActive: true },
    });

    if (!stageClass || !stageClass.isActive) {
      throw new ConflictException(
        'Класс не допущен к данному этапу',
      );
    }

    return registrationClass;
  }

  private async assertPublicStage(stageId: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
      select: { id: true, status: true, isDeleted: true },
    });

    if (!stage || stage.isDeleted) {
      throw new NotFoundException('Этап не найден');
    }

    if (!['PUBLISHED', 'COMPLETED'].includes(stage.status)) {
      throw new NotFoundException('Результаты этого этапа пока не опубликованы');
    }

    return stage;
  }

  async findOne(id: string) {
    const result = await this.prisma.result.findFirst({
      where: {
        id,
        registration: {
          participant: { isPublic: true },
          car: { isPublic: true },
          stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
        },
        OR: [
          { isHistorical: false },
          { isHistorical: true, verificationStatus: 'VERIFIED' },
        ],
      },
      include: this.publicInclude,
    });

    if (!result) {
      throw new NotFoundException('Результат не найден');
    }

    await this.assertPublicStage(result.registration.stage.id);

    return result;
  }

  async findOneAdmin(id: string) {
    const result = await this.prisma.result.findUnique({
      where: { id },
      include: this.adminInclude,
    });

    if (!result) {
      throw new NotFoundException('Результат не найден');
    }

    return result;
  }

  async findByRegistration(registrationId: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      select: { id: true, stageId: true },
    });

    if (!registration) {
      throw new NotFoundException('Регистрация не найдена');
    }

    await this.assertPublicStage(registration.stageId);

    return this.prisma.result.findMany({
      where: {
        registrationId,
        registration: {
          participant: { isPublic: true },
          car: { isPublic: true },
          stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
        },
        OR: [
          { isHistorical: false },
          { isHistorical: true, verificationStatus: 'VERIFIED' },
        ],
      },
      include: this.publicInclude,
      orderBy: [{ place: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findByRegistrationClass(registrationClassId: string) {
    const registrationClass = await this.prisma.registrationClass.findUnique({
      where: { id: registrationClassId },
      select: {
        id: true,
        registration: { select: { stageId: true } },
      },
    });

    if (!registrationClass) {
      throw new NotFoundException('Класс регистрации не найден');
    }

    await this.assertPublicStage(registrationClass.registration.stageId);

    return this.prisma.result.findMany({
      where: {
        registrationClassId,
        registration: {
          participant: { isPublic: true },
          car: { isPublic: true },
          stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
        },
        OR: [
          { isHistorical: false },
          { isHistorical: true, verificationStatus: 'VERIFIED' },
        ],
      },
      include: this.publicInclude,
      orderBy: [{ place: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findByStage(stageId: string) {
    await this.assertPublicStage(stageId);

    return this.prisma.result.findMany({
      where: {
        registration: {
          stageId,
          // Official published results are public competition data. The participant/car
          // profile visibility flags control directory cards, not result rows.
          stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] } },
        },
        OR: [
          { isHistorical: false },
          { isHistorical: true, verificationStatus: 'VERIFIED' },
        ],
      },
      include: this.publicInclude,
      orderBy: [
        { registrationClass: { class: { sortOrder: 'asc' } } },
        { place: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async findByStageAdmin(stageId: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
      select: { id: true },
    });

    if (!stage) {
      throw new NotFoundException('Этап не найден');
    }

    return this.prisma.result.findMany({
      where: { registration: { stageId } },
      include: this.adminInclude,
      orderBy: [
        { registrationClass: { class: { sortOrder: 'asc' } } },
        { place: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async create(
    data: CreateResultDto,
    request: AuthenticatedRequest,
  ) {
    if (!['ADMIN', 'JUDGE'].includes(request.user.role)) {
      throw new ForbiddenException('Недостаточно прав для внесения результата');
    }

    if (data.confirmed !== true) {
      throw new ConflictException(
        'Перед сохранением результата необходимо подтвердить проверку данных',
      );
    }

    this.validateValue(data.value);
    this.validatePlace(data.place);

    const result = await this.prisma.$transaction(
      async (tx) => {
        const registration = await this.getRegistrationContext(
          tx,
          data.registrationId,
        );

        const registrationClass = await this.getRegistrationClassContext(
          tx,
          data.registrationId,
          data.registrationClassId,
        );

        const existing = await tx.result.findFirst({
          where: {
            registrationClassId: data.registrationClassId,
          },
          select: { id: true },
        });

        if (existing) {
          throw new ConflictException(
            'Для этого класса результат уже внесён',
          );
        }

        const result = await tx.result.create({
          data: {
            registrationId: data.registrationId,
            registrationClassId: data.registrationClassId,
            value: data.value,
            unit: registrationClass.class.unit,
            place: data.place ?? null,
            isBest: false,
            notes: data.notes?.trim() || null,
            createdByUserId: request.user.sub,
            isHistorical: false,
            verificationStatus: 'NOT_REQUIRED',
          },
          include: this.adminInclude,
        });

        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: 'RESULT_CREATED',
            entity: 'Result',
            entityId: result.id,
            ipAddress: request.ip,
            metadata: {
              registrationId: data.registrationId,
              registrationClassId: data.registrationClassId,
              value: data.value,
              unit: registrationClass.class.unit,
              place: data.place ?? null,
            },
          },
        });

        return {
          result,
          stageId: registration.stageId,
          classId: registrationClass.classId,
        };
      },
      { isolationLevel: 'Serializable' },
    );

    await this.recordsService.createFromResultIfEligible(result.result.id);
    await this.rankingService.recalculateByStageClass(
      result.stageId,
      result.classId,
    );

    return this.findOneAdmin(result.result.id);
  }

  async update(
    id: string,
    data: UpdateResultDto,
    request: AuthenticatedRequest,
  ) {
    if (request.user.role !== 'ADMIN') {
      throw new ForbiddenException('Исправлять результаты может только администратор');
    }

    this.validateValue(data.value ?? 0);
    this.validatePlace(data.place);

    const updated = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.result.findUnique({
          where: { id },
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
        });

        if (!existing) {
          throw new NotFoundException('Результат не найден');
        }
        if (existing.isHistorical) {
          throw new ConflictException('Исторический результат редактируется через специальный административный workflow');
        }

        if (existing.registration.status !== 'ACTIVE') {
          throw new ConflictException(
            'Нельзя изменить результат неактивной регистрации',
          );
        }

        if (
          existing.registration.stage.isDeleted ||
          !['PUBLISHED', 'COMPLETED'].includes(
            existing.registration.stage.status,
          )
        ) {
          throw new ConflictException(
            'Нельзя изменить результат для этого статуса этапа',
          );
        }

        if (!existing.registration.inspection) {
          throw new ConflictException(
            'Нельзя изменить результат без пройденной инспекции',
          );
        }

        if (existing.registration.inspection.status !== 'PASSED') {
          throw new ConflictException(
            'Нельзя изменить результат участника, не допущенного к соревнованиям',
          );
        }

        await this.assertResultAllowed(
          tx,
          existing.registration.participantId,
          existing.registration.stageId,
        );

        const before = {
          value: existing.value.toString(),
          unit: existing.unit,
          place: existing.place,
          notes: existing.notes,
        };

        const nextValue = data.value ?? Number(existing.value);
        const nextPlace =
          data.place !== undefined ? data.place : existing.place;
        const nextNotes =
          data.notes !== undefined
            ? data.notes?.trim() || null
            : existing.notes;

        this.validateValue(nextValue);
        this.validatePlace(nextPlace);

        const updated = await tx.result.update({
          where: { id },
          data: {
            value: nextValue,
            place: nextPlace,
            notes: nextNotes,
          },
          include: this.adminInclude,
        });

        await tx.auditLog.create({
          data: {
            userId: request.user.sub,
            action: 'RESULT_CORRECTED',
            entity: 'Result',
            entityId: id,
            ipAddress: request.ip,
            metadata: {
              before,
              after: {
                value: updated.value.toString(),
                unit: updated.unit,
                place: updated.place,
                notes: updated.notes,
              },
            },
          },
        });

        return {
          result: updated,
          stageId: existing.registration.stageId,
          classId: existing.registrationClass.classId,
        };
      },
      { isolationLevel: 'Serializable' },
    );

    await this.recordsService.syncAfterResultUpdate(updated.result.id);
    await this.rankingService.recalculateByStageClass(
      updated.stageId,
      updated.classId,
    );

    return this.findOneAdmin(updated.result.id);
  }
}
