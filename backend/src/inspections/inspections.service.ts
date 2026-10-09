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

  async failPending(stageId: string, notes: string | undefined, actor: Actor) {
    const normalized = notes?.trim() || 'Не прошёл общую техническую проверку перед въездом';
    return this.prisma.$transaction(async (tx) => {
      const stage = await tx.stage.findUnique({
        where: { id: stageId },
        select: { id: true, isDeleted: true, status: true },
      });
      if (!stage) throw new NotFoundException('Этап не найден');
      if (stage.isDeleted || stage.status === 'CANCELLED') {
        throw new ConflictException('Нельзя завершить инспекции отменённого этапа');
      }

      const registrations = await tx.registration.findMany({
        where: { stageId, status: 'ACTIVE', inspection: null },
        select: { id: true },
        orderBy: { participantNumber: 'asc' },
      });
      if (!registrations.length) {
        return { success: true, processed: 0, message: 'Ожидающих проверку регистраций нет' };
      }

      const createdAt = new Date();
      await tx.inspection.createMany({
        data: registrations.map(({ id }) => ({
          registrationId: id,
          status: 'FAILED' as const,
          notes: normalized,
          checkedByUserId: actor.userId,
          createdByUserId: actor.userId,
          createdAt,
          updatedAt: createdAt,
        })),
      });
      const createdInspections = await tx.inspection.findMany({
        where: { registrationId: { in: registrations.map(({ id }) => id) } },
        select: { id: true, registrationId: true },
      });
      await tx.auditLog.createMany({
        data: createdInspections.map((inspection) => ({
          userId: actor.userId,
          action: 'INSPECTION_CREATED',
          entity: 'Inspection',
          entityId: inspection.id,
          ipAddress: actor.ipAddress ?? null,
          metadata: {
            registrationId: inspection.registrationId,
            status: 'FAILED',
            notes: normalized,
            bulk: true,
          },
        })),
      });
      return { success: true, processed: registrations.length, notes: normalized };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async passPending(stageId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const stage = await tx.stage.findUnique({
        where: { id: stageId },
        select: { id: true, isDeleted: true, status: true },
      });
      if (!stage) throw new NotFoundException('Этап не найден');
      if (stage.isDeleted || stage.status === 'CANCELLED') {
        throw new ConflictException('Нельзя завершить инспекции отменённого этапа');
      }

      const registrations = await tx.registration.findMany({
        where: { stageId, status: 'ACTIVE', inspection: null },
        select: { id: true },
        orderBy: { participantNumber: 'asc' },
      });
      if (!registrations.length) {
        return { success: true, processed: 0, message: 'Ожидающих проверку регистраций нет' };
      }

      const createdAt = new Date();
      await tx.inspection.createMany({
        data: registrations.map(({ id }) => ({
          registrationId: id,
          status: 'PASSED' as const,
          notes: null,
          checkedByUserId: actor.userId,
          createdByUserId: actor.userId,
          createdAt,
          updatedAt: createdAt,
        })),
      });
      const createdInspections = await tx.inspection.findMany({
        where: { registrationId: { in: registrations.map(({ id }) => id) } },
        select: { id: true, registrationId: true },
      });
      await tx.auditLog.createMany({
        data: createdInspections.map((inspection) => ({
          userId: actor.userId,
          action: 'INSPECTION_CREATED',
          entity: 'Inspection',
          entityId: inspection.id,
          ipAddress: actor.ipAddress ?? null,
          metadata: {
            registrationId: inspection.registrationId,
            status: 'PASSED',
            notes: null,
            bulk: true,
          },
        })),
      });
      return { success: true, processed: registrations.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
