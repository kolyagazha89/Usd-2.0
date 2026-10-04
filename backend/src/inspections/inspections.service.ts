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
    const current = await this.prisma.inspection.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Проверка не найдена');
    this.assertCanEdit(current.createdByUserId ?? current.checkedByUserId, actor);

    const nextStatus = data.status ?? current.status;
    const nextNotes = data.notes === undefined ? current.notes : data.notes;
    this.validateNotes(nextStatus, nextNotes ?? undefined);

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
    });
  }

  async remove(id: string, actor: Actor) {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Удалять проверки может только ADMIN');
    }
    const current = await this.prisma.inspection.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Проверка не найдена');

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
    });
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
