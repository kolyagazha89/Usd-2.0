import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type InspectionStatus = 'PASSED' | 'FAILED';
type Actor = {
  userId: string;
  role: 'ADMIN' | 'JUDGE' | 'PARTICIPANT';
  ipAddress?: string;
};

const classInspectionInclude = {
  registrationClass: {
    include: {
      class: { include: { direction: true } },
      number: true,
      registration: {
        include: {
          stage: { include: { season: true } },
          participant: { select: { id: true, firstName: true, lastName: true, middleName: true, team: true, city: true, photoUrl: true } },
          car: { select: { id: true, brand: true, model: true, color: true, photoUrl: true, isActive: true, registrationCountry: true, registrationNumber: true } },
        },
      },
    },
  },
} satisfies Prisma.RegistrationClassInspectionInclude;

const inspectionInclude = {
  registration: {
    include: {
      stage: { include: { season: true } },
      participant: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          team: true,
          city: true,
          photoUrl: true,
        },
      },
      car: {
        select: {
          id: true,
          brand: true,
          model: true,
          color: true,
          photoUrl: true,
          isActive: true,
        },
      },
      classes: {
        include: {
          class: { include: { direction: true } },
        },
      },
    },
  },
  checkedByUser: {
    select: { id: true, name: true, role: true },
  },
  createdByUser: {
    select: { id: true, name: true, role: true },
  },
} satisfies Prisma.InspectionInclude;

@Injectable()
export class InspectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(id: string) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: inspectionInclude,
    });
    if (!inspection) throw new NotFoundException('Проверка не найдена');
    return inspection;
  }

  async findByRegistration(registrationId: string) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { registrationId },
      include: inspectionInclude,
    });
    if (!inspection) {
      throw new NotFoundException('Проверка для этой регистрации не найдена');
    }
    return inspection;
  }

  private isBassRaceClass(className: string, directionName = ''): boolean {
    const normalize = (value: string) => value.trim().toLocaleUpperCase('ru-RU').replace(/\\s/g, '').replace(/[_-]/g, '');
    return normalize(className).includes('BASSRACE') || normalize(directionName).includes('BASSRACE');
  }

  private async pendingRegistrationRows(stageId: string) {
    return this.prisma.registration.findMany({
      where: { stageId, status: 'ACTIVE' },
      include: {
        inspection: true,
        classes: { include: { class: { include: { direction: true } }, inspection: true, results: { select: { id: true } } } },
      },
      orderBy: { participantNumber: 'asc' },
    });
  }

  private async processPending(stageId: string, status: InspectionStatus, actor: Actor, notes?: string) {
    const registrations = await this.pendingRegistrationRows(stageId);
    let processed = 0;
    for (const registration of registrations as any[]) {
      const bassRaceClasses = (registration.classes ?? []).filter((item: any) => this.isBassRaceClass(item.class?.name ?? '', item.class?.direction?.name ?? ''));
      const otherClasses = (registration.classes ?? []).filter((item: any) => !this.isBassRaceClass(item.class?.name ?? '', item.class?.direction?.name ?? ''));
      for (const item of bassRaceClasses) {
        if (item.inspection) continue;
        await this.createClassInspection({ registrationClassId: item.id, status, notes }, actor);
        processed += 1;
      }
      const needsRegistrationInspection = !registration.inspection && (otherClasses.length > 0 || bassRaceClasses.length === 0);
      if (needsRegistrationInspection) {
        await this.create({ registrationId: registration.id, status, notes }, actor);
        processed += 1;
      }
    }
    return processed;
  }

  async failPending(stageId: string, notes: string | undefined, actor: Actor) {
    const normalized = notes?.trim() || 'Не прошёл общую техническую проверку перед въездом';
    const processed = await this.processPending(stageId, 'FAILED', actor, normalized);
    return processed ? { success: true, processed, notes: normalized } : { success: true, processed: 0, message: 'Ожидающих проверку регистраций нет' };
  }

  async passPending(stageId: string, actor: Actor) {
    const processed = await this.processPending(stageId, 'PASSED', actor);
    return processed ? { success: true, processed } : { success: true, processed: 0, message: 'Ожидающих проверку регистраций нет' };
  }


  async findByRegistrationClass(registrationClassId: string) {
    const inspection = await this.prisma.registrationClassInspection.findUnique({
      where: { registrationClassId },
      include: classInspectionInclude,
    });
    if (!inspection) throw new NotFoundException('Проверка класса не найдена');
    return inspection;
  }

  async createClassInspection(
    data: { registrationClassId: string; status: InspectionStatus; notes?: string },
    actor: Actor,
  ) {
    this.validateNotes(data.status, data.notes);
    return this.prisma.$transaction(async (tx) => {
      const registrationClass = await tx.registrationClass.findUnique({
        where: { id: data.registrationClassId },
        include: {
          inspection: true,
          class: { include: { direction: true } },
          results: { select: { id: true } },
          registration: { include: { stage: true } },
        },
      });
      if (!registrationClass) throw new NotFoundException('Класс регистрации не найден');
      if (!this.isBassRaceClass(registrationClass.class.name, registrationClass.class.direction?.name ?? '')) {
        throw new BadRequestException('Отдельная инспекция по классу используется для выступлений BassRace');
      }
      if (registrationClass.registration.status !== 'ACTIVE') throw new ConflictException('Нельзя проверить неактивную регистрацию');
      if (registrationClass.registration.stage.isDeleted || registrationClass.registration.stage.status === 'CANCELLED') {
        throw new ConflictException('Нельзя проверить регистрацию отменённого этапа');
      }
      if (registrationClass.inspection) throw new ConflictException('Для этого выступления BassRace проверка уже существует');
      if (data.status === 'FAILED' && registrationClass.results.length > 0) {
        throw new ConflictException('Нельзя отказать в допуске: по этому классу уже есть результат');
      }
      const created = await tx.registrationClassInspection.create({
        data: {
          registrationClassId: data.registrationClassId,
          status: data.status,
          notes: this.normalizeNotes(data.notes),
          checkedByUserId: actor.userId,
          createdByUserId: actor.userId,
        },
        include: classInspectionInclude,
      });
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'BASSRACE_CLASS_INSPECTION_CREATED',
          entity: 'RegistrationClassInspection',
          entityId: created.id,
          ipAddress: actor.ipAddress ?? null,
          metadata: { registrationClassId: data.registrationClassId, status: created.status, notes: created.notes },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async updateClassInspection(
    id: string,
    data: { status?: InspectionStatus; notes?: string | null },
    actor: Actor,
  ) {
    const current = await this.prisma.registrationClassInspection.findUnique({
      where: { id },
      include: { registrationClass: { include: { results: { select: { id: true } } } } },
    });
    if (!current) throw new NotFoundException('Проверка класса не найдена');
    this.assertCanEdit(current.createdByUserId ?? current.checkedByUserId, actor);
    const nextStatus = data.status ?? current.status;
    const nextNotes = data.notes === undefined ? current.notes : data.notes;
    this.validateNotes(nextStatus, nextNotes);
    if (nextStatus === 'FAILED' && current.registrationClass.results.length > 0) {
      throw new ConflictException('Нельзя перевести инспекцию в FAILED: по классу уже есть результат');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.registrationClassInspection.update({
        where: { id },
        data: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.notes !== undefined ? { notes: this.normalizeNotes(data.notes ?? undefined) } : {}),
          checkedByUserId: actor.userId,
        },
        include: classInspectionInclude,
      });
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'BASSRACE_CLASS_INSPECTION_UPDATED',
          entity: 'RegistrationClassInspection',
          entityId: id,
          ipAddress: actor.ipAddress ?? null,
          metadata: { before: { status: current.status, notes: current.notes }, after: { status: updated.status, notes: updated.notes } },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async removeClassInspection(id: string, actor: Actor) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Удалять проверки может только ADMIN');
    const current = await this.prisma.registrationClassInspection.findUnique({
      where: { id },
      include: { registrationClass: { include: { results: { select: { id: true } } } } },
    });
    if (!current) throw new NotFoundException('Проверка класса не найдена');
    if (current.registrationClass.results.length > 0) throw new ConflictException('Нельзя удалить инспекцию: по классу уже есть результат');
    await this.prisma.$transaction(async (tx) => {
      await tx.registrationClassInspection.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'BASSRACE_CLASS_INSPECTION_DELETED',
          entity: 'RegistrationClassInspection',
          entityId: id,
          ipAddress: actor.ipAddress ?? null,
          metadata: { registrationClassId: current.registrationClassId, status: current.status, notes: current.notes },
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { success: true, id };
  }

  async create(
    data: { registrationId: string; status: InspectionStatus; notes?: string },
    actor: Actor,
  ) {
    this.validateNotes(data.status, data.notes);

    return this.prisma.$transaction(async (tx) => {
      const registration = await tx.registration.findUnique({
        where: { id: data.registrationId },
        include: { inspection: true, stage: true },
      });

      if (!registration) throw new NotFoundException('Регистрация не найдена');
      if (registration.status !== 'ACTIVE') {
        throw new ConflictException('Нельзя проверить неактивную регистрацию');
      }
      if (registration.stage.isDeleted || registration.stage.status === 'CANCELLED') {
        throw new ConflictException('Нельзя проверить регистрацию отменённого этапа');
      }
      if (registration.inspection) {
        throw new ConflictException('Для этой регистрации проверка уже существует');
      }

      const created = await tx.inspection.create({
        data: {
          registrationId: data.registrationId,
          status: data.status,
          notes: this.normalizeNotes(data.notes),
          checkedByUserId: actor.userId,
          createdByUserId: actor.userId,
        },
        include: inspectionInclude,
      });

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'INSPECTION_CREATED',
          entity: 'Inspection',
          entityId: created.id,
          ipAddress: actor.ipAddress ?? null,
          metadata: {
            registrationId: created.registrationId,
            status: created.status,
            notes: created.notes,
          },
        },
      });
      return created;
    });
  }

  async update(
    id: string,
    data: { status?: InspectionStatus; notes?: string | null },
    actor: Actor,
  ) {
    const current = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        registration: {
          select: {
            results: { select: { id: true } },
          },
        },
      },
    });
    if (!current) throw new NotFoundException('Проверка не найдена');
    this.assertCanEdit(current.createdByUserId ?? current.checkedByUserId, actor);

    const nextStatus = data.status ?? current.status;
    const nextNotes = data.notes === undefined ? current.notes : data.notes;
    this.validateNotes(nextStatus, nextNotes);

    if (nextStatus === 'FAILED' && current.registration.results.length > 0) {
      throw new ConflictException(
        'Нельзя перевести инспекцию в FAILED: по регистрации уже есть результат',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspection.update({
        where: { id },
        data: {
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.notes !== undefined ? { notes: this.normalizeNotes(data.notes ?? undefined) } : {}),
          checkedByUserId: actor.userId,
        },
        include: inspectionInclude,
      });
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'INSPECTION_UPDATED',
          entity: 'Inspection',
          entityId: id,
          ipAddress: actor.ipAddress ?? null,
          metadata: {
            before: {
              status: current.status,
              notes: current.notes,
              checkedByUserId: current.checkedByUserId,
            },
            after: {
              status: updated.status,
              notes: updated.notes,
              checkedByUserId: updated.checkedByUserId,
            },
          },
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async remove(id: string, actor: Actor) {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Удалять проверки может только ADMIN');
    }
    const current = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        registration: {
          select: {
            results: { select: { id: true } },
          },
        },
      },
    });
    if (!current) throw new NotFoundException('Проверка не найдена');

    if (current.registration.results.length > 0) {
      throw new ConflictException(
        'Нельзя удалить инспекцию: по регистрации уже есть результат',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.inspection.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'INSPECTION_DELETED',
          entity: 'Inspection',
          entityId: id,
          ipAddress: actor.ipAddress ?? null,
          metadata: {
            registrationId: current.registrationId,
            status: current.status,
            notes: current.notes,
            createdByUserId: current.createdByUserId,
            checkedByUserId: current.checkedByUserId,
          },
        },
      });
      return { success: true, id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private assertCanEdit(ownerId: string | null, actor: Actor) {
    if (actor.role === 'ADMIN') return;
    if (actor.role !== 'JUDGE' || ownerId !== actor.userId) {
      throw new ForbiddenException('Судья может изменять только собственные проверки');
    }
  }

  private validateNotes(status: InspectionStatus, notes?: string | null) {
    if (status === 'FAILED' && !notes?.trim()) {
      throw new BadRequestException('При непрохождении проверки необходимо указать комментарий');
    }
  }

  private normalizeNotes(notes?: string) {
    const normalized = notes?.trim();
    return normalized ? normalized : null;
  }
}
