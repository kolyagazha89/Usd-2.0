import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AuditService } from '../common/audit/audit.service';
import {
  CreateClassDto,
  CreateDirectionDto,
  UpdateClassDto,
  UpdateDirectionDto,
  AddStageClassDto,
  ReplaceStageClassesDto,
  UpdateStageClassDto,
} from './dto/class.dto';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Injectable()
export class ClassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAllDirections() {
    return this.prisma.direction.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        classes: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
  }

  async findDirection(id: string) {
    const direction = await this.prisma.direction.findUnique({
      where: { id },
      include: {
        classes: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
    if (!direction) throw new NotFoundException('Направление не найдено');
    return direction;
  }

  async createDirection(dto: CreateDirectionDto, request: AuthenticatedRequest) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Название направления обязательно');

    const existing = await this.prisma.direction.findFirst({ where: { name } });
    if (existing) throw new BadRequestException(`Направление "${name}" уже существует`);

    const direction = await this.prisma.direction.create({
      data: { name, sortOrder: dto.sortOrder ?? 0 },
    });

    await this.audit.log({
      userId: request.user.sub,
      action: 'DIRECTION_CREATED',
      entity: 'Direction',
      entityId: direction.id,
      ipAddress: request.ip,
      metadata: { name: direction.name },
    });

    return direction;
  }

  async updateDirection(id: string, dto: UpdateDirectionDto, request: AuthenticatedRequest) {
    const direction = await this.prisma.direction.findUnique({ where: { id } });
    if (!direction) throw new NotFoundException('Направление не найдено');

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Название направления не может быть пустым');
      const existing = await this.prisma.direction.findFirst({ where: { name, NOT: { id } } });
      if (existing) throw new BadRequestException(`Направление "${name}" уже существует`);
    }

    if (dto.isActive === false) {
      const activeClasses = await this.prisma.class.count({ where: { directionId: id, isActive: true } });
      if (activeClasses > 0) {
        throw new BadRequestException('Сначала отключите активные классы направления');
      }
    }

    const updated = await this.prisma.direction.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { classes: { orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.log({
      userId: request.user.sub,
      action: 'DIRECTION_UPDATED',
      entity: 'Direction',
      entityId: id,
      ipAddress: request.ip,
      metadata: {
        before: { name: direction.name, sortOrder: direction.sortOrder, isActive: direction.isActive },
        after: { name: updated.name, sortOrder: updated.sortOrder, isActive: updated.isActive },
      },
    });

    return updated;
  }

  async deleteDirection(id: string, request: AuthenticatedRequest) {
    return this.updateDirection(id, { isActive: false }, request);
  }

  async findAllClasses(directionId?: string) {
    return this.prisma.class.findMany({
      where: {
        isActive: true,
        ...(directionId ? { directionId } : {}),
      },
      orderBy: [
        { direction: { sortOrder: 'asc' } },
        { sortOrder: 'asc' },
        { name: 'asc' },
      ],
      include: { direction: true },
    });
  }

  async findClass(id: string) {
    const item = await this.prisma.class.findUnique({
      where: { id },
      include: { direction: true },
    });
    if (!item) throw new NotFoundException('Класс не найден');
    return item;
  }

  async createClass(dto: CreateClassDto, request: AuthenticatedRequest) {
    const code = dto.code.trim();
    const name = dto.name.trim();
    if (!code) throw new BadRequestException('Код класса обязателен');
    if (!name) throw new BadRequestException('Название класса обязательно');

    const direction = await this.prisma.direction.findUnique({ where: { id: dto.directionId } });
    if (!direction) throw new NotFoundException('Направление не найдено');
    if (!direction.isActive) throw new BadRequestException('Нельзя создать класс в отключённом направлении');

    const existingCode = await this.prisma.class.findUnique({ where: { code } });
    if (existingCode) throw new BadRequestException(`Класс с кодом "${code}" уже существует`);

    const item = await this.prisma.class.create({
      data: {
        directionId: dto.directionId,
        code,
        name,
        unit: dto.unit ?? 'DB',
        sortOrder: dto.sortOrder ?? 0,
      },
      include: { direction: true },
    });

    await this.audit.log({
      userId: request.user.sub,
      action: 'CLASS_CREATED',
      entity: 'Class',
      entityId: item.id,
      ipAddress: request.ip,
      metadata: { directionId: item.directionId, code: item.code, unit: item.unit },
    });

    return item;
  }

  async updateClass(id: string, dto: UpdateClassDto, request: AuthenticatedRequest) {
    const item = await this.prisma.class.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Класс не найден');

    if ((dto.directionId !== undefined && dto.directionId !== item.directionId) ||
        (dto.unit !== undefined && dto.unit !== item.unit)) {
      const [registrationCount, resultCount, recordCount] = await Promise.all([
        this.prisma.registrationClass.count({ where: { classId: id } }),
        this.prisma.result.count({ where: { registrationClass: { classId: id } } }),
        this.prisma.record.count({ where: { classId: id } }),
      ]);
      if (registrationCount > 0 || resultCount > 0 || recordCount > 0) {
        throw new BadRequestException('Нельзя менять направление или единицу измерения класса после появления исторических данных');
      }
    }

    if (dto.directionId !== undefined) {
      const direction = await this.prisma.direction.findUnique({ where: { id: dto.directionId } });
      if (!direction) throw new NotFoundException('Направление не найдено');
      if (!direction.isActive && dto.isActive !== false) {
        throw new BadRequestException('Нельзя включить класс в отключённом направлении');
      }
    }

    if (dto.code !== undefined) {
      const code = dto.code.trim();
      if (!code) throw new BadRequestException('Код класса не может быть пустым');
      const existing = await this.prisma.class.findUnique({ where: { code } });
      if (existing && existing.id !== id) throw new BadRequestException(`Класс с кодом "${code}" уже существует`);
    }

    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('Название класса не может быть пустым');
    }

    if (dto.isActive === true) {
      const directionId = dto.directionId ?? item.directionId;
      const direction = await this.prisma.direction.findUnique({ where: { id: directionId } });
      if (!direction?.isActive) throw new BadRequestException('Нельзя включить класс в отключённом направлении');
    }

    const updated = await this.prisma.class.update({
      where: { id },
      data: {
        ...(dto.directionId !== undefined ? { directionId: dto.directionId } : {}),
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: { direction: true },
    });

    await this.audit.log({
      userId: request.user.sub,
      action: 'CLASS_UPDATED',
      entity: 'Class',
      entityId: id,
      ipAddress: request.ip,
      metadata: {
        before: { directionId: item.directionId, code: item.code, name: item.name, unit: item.unit, sortOrder: item.sortOrder, isActive: item.isActive },
        after: { directionId: updated.directionId, code: updated.code, name: updated.name, unit: updated.unit, sortOrder: updated.sortOrder, isActive: updated.isActive },
      },
    });

    return updated;
  }

  async deleteClass(id: string, request: AuthenticatedRequest) {
    return this.updateClass(id, { isActive: false }, request);
  }

  async findStageClasses(stageId: string, includeInactive = false) {
    const stage = await this.prisma.stage.findFirst({ where: { id: stageId, isDeleted: false } });
    if (!stage) throw new NotFoundException('Этап не найден');

    return this.prisma.stageClass.findMany({
      where: {
        stageId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [
        { sortOrder: 'asc' },
        { class: { direction: { sortOrder: 'asc' } } },
        { class: { sortOrder: 'asc' } },
      ],
      include: { class: { include: { direction: true } } },
    });
  }

  private async getStageClass(stageId: string, classId: string) {
    return this.prisma.stageClass.findUnique({
      where: { stageId_classId: { stageId, classId } },
      include: { class: { include: { direction: true } }, stage: true },
    });
  }

  async addClassToStage(stageId: string, dto: AddStageClassDto, request: AuthenticatedRequest) {
    const stage = await this.prisma.stage.findFirst({ where: { id: stageId, isDeleted: false } });
    if (!stage) throw new NotFoundException('Этап не найден');

    const item = await this.prisma.class.findUnique({
      where: { id: dto.classId },
      include: { direction: true },
    });
    if (!item || !item.isActive || !item.direction.isActive) {
      throw new NotFoundException('Активный класс не найден');
    }

    const existing = await this.prisma.stageClass.findUnique({
      where: { stageId_classId: { stageId, classId: dto.classId } },
    });
    if (existing) {
      if (existing.isActive) throw new BadRequestException('Этот класс уже добавлен на этап');
      const restored = await this.prisma.stageClass.update({
        where: { id: existing.id },
        data: { isActive: true },
        include: { class: { include: { direction: true } } },
      });
      await this.audit.log({
        userId: request.user.sub,
        action: 'STAGE_CLASS_RESTORED',
        entity: 'StageClass',
        entityId: restored.id,
        ipAddress: request.ip,
        metadata: { stageId, classId: dto.classId },
      });
      return restored;
    }

    const created = await this.prisma.stageClass.create({
      data: { stageId, classId: dto.classId },
      include: { class: { include: { direction: true } } },
    });

    await this.audit.log({
      userId: request.user.sub,
      action: 'STAGE_CLASS_CREATED',
      entity: 'StageClass',
      entityId: created.id,
      ipAddress: request.ip,
      metadata: { stageId, classId: dto.classId },
    });

    return created;
  }

  async updateStageClass(stageId: string, classId: string, dto: UpdateStageClassDto, request: AuthenticatedRequest) {
    const existing = await this.getStageClass(stageId, classId);
    if (!existing) throw new NotFoundException('Класс не привязан к этапу');

    if (dto.isActive === true && (!existing.class.isActive || !existing.class.direction.isActive)) {
      throw new BadRequestException('Нельзя включить StageClass для отключённого класса или направления');
    }

    if (dto.participantLimit !== undefined && dto.participantLimit !== null) {
      const currentCount = await this.prisma.registrationClass.count({
        where: {
          classId,
          registration: { stageId, status: 'ACTIVE' },
        },
      });
      if (dto.participantLimit < currentCount) {
        throw new BadRequestException(`Лимит не может быть меньше текущего количества регистраций: ${currentCount}`);
      }
    }

    const updated = await this.prisma.stageClass.update({
      where: { id: existing.id },
      data: {
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.participantLimit !== undefined ? { participantLimit: dto.participantLimit } : {}),
        ...(dto.customName !== undefined ? { customName: dto.customName?.trim() || null } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.settings !== undefined ? { settings: dto.settings === null ? Prisma.JsonNull : dto.settings } : {}),
      },
      include: { class: { include: { direction: true } } },
    });

    await this.audit.log({
      userId: request.user.sub,
      action: 'STAGE_CLASS_UPDATED',
      entity: 'StageClass',
      entityId: existing.id,
      ipAddress: request.ip,
      metadata: {
        before: {
          sortOrder: existing.sortOrder,
          isActive: existing.isActive,
          participantLimit: existing.participantLimit,
          customName: existing.customName,
          description: existing.description,
          settings: existing.settings,
        },
        after: {
          sortOrder: updated.sortOrder,
          isActive: updated.isActive,
          participantLimit: updated.participantLimit,
          customName: updated.customName,
          description: updated.description,
          settings: updated.settings,
        },
      },
    });

    return updated;
  }

  async removeClassFromStage(stageId: string, classId: string, request: AuthenticatedRequest) {
    const existing = await this.getStageClass(stageId, classId);
    if (!existing) throw new NotFoundException('Этот класс не привязан к этапу');

    if (!existing.isActive) return existing;

    const updated = await this.prisma.stageClass.update({
      where: { id: existing.id },
      data: { isActive: false },
      include: { class: { include: { direction: true } } },
    });

    await this.audit.log({
      userId: request.user.sub,
      action: 'STAGE_CLASS_DEACTIVATED',
      entity: 'StageClass',
      entityId: existing.id,
      ipAddress: request.ip,
      metadata: { stageId, classId },
    });

    return updated;
  }

  async replaceStageClasses(stageId: string, dto: ReplaceStageClassesDto, request: AuthenticatedRequest) {
    const stage = await this.prisma.stage.findFirst({ where: { id: stageId, isDeleted: false } });
    if (!stage) throw new NotFoundException('Этап не найден');

    const uniqueClassIds = [...new Set(dto.classIds)];
    const classes = await this.prisma.class.findMany({
      where: {
        id: { in: uniqueClassIds },
        isActive: true,
        direction: { isActive: true },
      },
    });
    if (classes.length !== uniqueClassIds.length) {
      throw new BadRequestException('Один или несколько классов не найдены или отключены');
    }

    const existing = await this.prisma.stageClass.findMany({ where: { stageId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.stageClass.updateMany({
        where: {
          stageId,
          classId: { notIn: uniqueClassIds },
          isActive: true,
        },
        data: { isActive: false },
      });

      for (let index = 0; index < uniqueClassIds.length; index += 1) {
        const classId = uniqueClassIds[index];
        const found = existing.find((row) => row.classId === classId);
        if (found) {
          await tx.stageClass.update({
            where: { id: found.id },
            data: { isActive: true, sortOrder: index },
          });
        } else {
          await tx.stageClass.create({
            data: { stageId, classId, sortOrder: index, isActive: true },
          });
        }
      }
    });

    await this.audit.log({
      userId: request.user.sub,
      action: 'STAGE_CLASSES_REPLACED',
      entity: 'Stage',
      entityId: stageId,
      ipAddress: request.ip,
      metadata: {
        previousActiveClassIds: existing.filter((x) => x.isActive).map((x) => x.classId),
        activeClassIds: uniqueClassIds,
      },
    });

    return this.findStageClasses(stageId, true);
  }
}

