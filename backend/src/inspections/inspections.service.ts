import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailNotificationsService } from '../mail/email-notifications.service';

type InspectionStatus = 'PASSED' | 'FAILED';
type Actor = {
  userId: string;
  role: 'ADMIN' | 'PARTICIPANT';
  customRoleId?: string;
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

const participantStageInspectionInclude = {
  participant: { select: { id: true, firstName: true, lastName: true, middleName: true, team: true, city: true, photoUrl: true } },
  stage: { include: { season: true } },
  registrations: { include: { car: { select: { id: true, brand: true, model: true, registrationNumber: true, registrationCountry: true } }, classes: { include: { class: { include: { direction: true } }, number: true, results: { select: { id: true } } } }, results: { select: { id: true } } } },
  checkedByUser: { select: { id: true, name: true, role: true } },
  createdByUser: { select: { id: true, name: true, role: true } },
} satisfies Prisma.ParticipantStageInspectionInclude;

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
          number: true,
          inspection: true,
        },
      },
      numbers: { orderBy: { number: 'asc' } },
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly emailNotifications?: EmailNotificationsService,
  ) {}

  async findOne(id: string) {
    const vehicleInspection = await this.prisma.inspection.findUnique({ where: { id }, include: inspectionInclude });
    if (vehicleInspection) return vehicleInspection;
    const shared = await this.prisma.participantStageInspection.findUnique({ where: { id }, include: participantStageInspectionInclude });
    if (!shared) throw new NotFoundException('Проверка не найдена');
    return shared;
  }

  async findByRegistration(registrationId: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: { inspection: { include: inspectionInclude }, stageInspection: { include: participantStageInspectionInclude } },
    });
    if (!registration) throw new NotFoundException('Регистрация не найдена');
    if (registration.inspection) return registration.inspection;
    if (registration.stageInspection) return registration.stageInspection;
    throw new NotFoundException('Инспекция автомобиля на этом этапе не найдена');
  }

  private isBassRaceClass(className: string, directionName = ''): boolean {
    const normalize = (value: string) => value.trim().toLocaleUpperCase('ru-RU').replace(/\s/g, '').replace(/[_-]/g, '');
    return normalize(className).includes('BASSRACE') || normalize(directionName).includes('BASSRACE');
  }

  private async pendingRegistrationRows(stageId: string) {
    return this.prisma.registration.findMany({
      where: { stageId, status: 'ACTIVE' },
      include: { stageInspection: true, inspection: true, classes: { include: { class: { include: { direction: true } }, inspection: true, results: { select: { id: true } } } } },
      orderBy: { participantNumber: 'asc' },
    });
  }

  private async processPending(stageId: string, status: InspectionStatus, actor: Actor, notes?: string) {
    const registrations = await this.pendingRegistrationRows(stageId);
    let processed = 0;
    for (const registration of registrations as any[]) {
      // Registration is unique per car and stage: inspect each vehicle independently.
      if (registration.inspection || registration.stageInspection) continue;
      await this.create({ registrationId: registration.id, status, notes }, actor);
      processed += 1;
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


  async updateRegistrationClasses(registrationId: string, classIds: string[], actor: Actor) {
    const requestedIds = [...new Set((classIds ?? []).filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()))];
    if (!requestedIds.length) throw new BadRequestException('У регистрации должен остаться хотя бы один класс');

    return this.prisma.$transaction(async (tx) => {
      const registration = await tx.registration.findUnique({
        where: { id: registrationId },
        include: {
          stage: true,
          inspection: { select: { status: true } },
          numbers: { orderBy: [{ isPrimary: 'desc' }, { number: 'asc' }] },
          classes: { include: { class: { include: { direction: true } }, number: true, results: { select: { id: true } }, inspection: true } },
        },
      });
      if (!registration) throw new NotFoundException('Регистрация не найдена');
      if (registration.status !== 'ACTIVE') throw new ConflictException('Нельзя менять классы неактивной регистрации');
      if (registration.stage.isDeleted || registration.stage.status === 'CANCELLED') throw new ConflictException('Нельзя менять классы на отменённом этапе');

      const existing = registration.classes as any[];
      const existingByClassId = new Map(existing.map((item) => [item.classId, item]));
      const requestedSet = new Set(requestedIds);
      const removed = existing.filter((item) => !requestedSet.has(item.classId));

      // Check result protection before validating the requested stage classes, so
      // a class with a recorded result always returns the explicit conflict.
      const resultClass = removed.find((item: any) => item.results?.length);
      if (resultClass) {
        throw new ConflictException('Нельзя убрать класс «' + resultClass.class.name + '»: по нему уже записан результат. Сначала исправьте результат.');
      }

      const stageClasses = await tx.stageClass.findMany({
        where: { stageId: registration.stageId, classId: { in: requestedIds }, isActive: true, class: { isActive: true } },
        include: { class: { include: { direction: true } } },
      });
      if (stageClasses.length !== requestedIds.length) {
        throw new BadRequestException('Один или несколько выбранных классов недоступны на этом этапе');
      }
      const added = stageClasses.filter((item: any) => !existingByClassId.has(item.classId));
      if (!registration.numbers.length) throw new ConflictException('У регистрации нет закреплённого номера участника');

      // Serialize number allocation with ordinary registration creation so two
      // simultaneous class edits cannot reserve the same stage number.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${registration.stageId}))`;

      const numberRows = [...registration.numbers] as any[];
      const primaryNumber = numberRows.find((number: any) => number.isPrimary) ?? numberRows[0];
      const isBassRace = (item: any) => this.isBassRaceClass(
        item.class?.name ?? item.name ?? '',
        item.class?.direction?.name ?? item.direction?.name ?? '',
      );

      // Keep numbers already assigned to BassRace classes that remain selected.
      // Number rows from removed classes stay reserved and are deliberately reused
      // before allocating fresh numbers.
      const retainedBassRace = stageClasses.filter((item: any) => isBassRace(item) && existingByClassId.has(item.classId));
      const usedBassRaceNumberIds = new Set(
        retainedBassRace.map((item: any) => existingByClassId.get(item.classId)?.numberId).filter(Boolean),
      );
      let highestStageNumber: number | null = null;
      const allocateNewBassRaceNumber = async () => {
        if (highestStageNumber === null) {
          const lastNumber = await tx.registrationNumber.findFirst({
            where: { stageId: registration.stageId },
            orderBy: { number: 'desc' },
            select: { number: true },
          });
          highestStageNumber = Math.max(Number(lastNumber?.number ?? 0), ...numberRows.map((item: any) => Number(item.number ?? 0)));
        }
        const number = ++highestStageNumber;
        const created = await tx.registrationNumber.create({
          data: { stageId: registration.stageId, registrationId, number, isPrimary: false },
        });
        numberRows.push(created);
        return created;
      };

      for (const item of added as any[]) {
        let chosenNumber: any;
        if (isBassRace(item)) {
          const reusable = numberRows
            .filter((number: any) => !usedBassRaceNumberIds.has(number.id))
            .sort((a: any, b: any) => Number(b.isPrimary) - Number(a.isPrimary) || Number(a.number) - Number(b.number))[0];
          chosenNumber = reusable ?? await allocateNewBassRaceNumber();
          usedBassRaceNumberIds.add(chosenNumber.id);
        } else {
          const directionId = item.class.directionId;
          const sameDirection = existing.find((current: any) => current.class.directionId === directionId);
          chosenNumber = (sameDirection?.numberId
            ? numberRows.find((number: any) => number.id === sameDirection.numberId)
            : undefined) ?? primaryNumber;
        }
        if (!chosenNumber) throw new ConflictException('Не удалось определить номер для нового класса «' + item.class.name + '»');
        await tx.registrationClass.create({
          data: { registrationId, classId: item.classId, numberId: chosenNumber.id },
        });
      }

      if (removed.length) {
        await tx.registrationClass.deleteMany({ where: { id: { in: removed.map((item: any) => item.id) } } });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: 'REGISTRATION_CLASSES_CHANGED',
          entity: 'Registration',
          entityId: registrationId,
          ipAddress: actor.ipAddress ?? null,
          metadata: {
            stageId: registration.stageId,
            participantId: registration.participantId,
            before: existing.map((item: any) => ({ classId: item.classId, className: item.class.name, number: item.number?.number })),
            after: stageClasses.map((item: any) => ({ classId: item.classId, className: item.class.name })),
            added: added.map((item: any) => ({ classId: item.classId, className: item.class.name })),
            removed: removed.map((item: any) => ({ classId: item.classId, className: item.class.name })),
            inspectionStatus: registration.inspection?.status ?? null,
          },
        },
      });

      return {
        success: true,
        registrationId,
        added: added.map((item: any) => item.class.name),
        removed: removed.map((item: any) => item.class.name),
        classes: stageClasses.map((item: any) => ({ id: item.classId, name: item.class.name, direction: item.class.direction?.name ?? null })),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
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
    const saved = await this.prisma.$transaction(async (tx) => {
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
    if (typeof this.emailNotifications?.inspectionChanged === 'function') await Promise.resolve(this.emailNotifications.inspectionChanged(saved.registrationClass.registration.id, saved.id, saved.status, saved.notes, saved.registrationClass.class.name, saved.updatedAt)).catch(() => undefined);
    return saved;
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
    const saved = await this.prisma.$transaction(async (tx) => {
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
    if (current.status !== saved.status) {
      await this.emailNotifications?.inspectionChanged(saved.registrationClass.registration.id, saved.id, saved.status, saved.notes, saved.registrationClass.class.name, saved.updatedAt).catch(() => undefined);
    }
    return saved;
  }

  async removeClassInspection(id: string, actor: Actor) {
    
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
    const saved = await this.prisma.$transaction(async (tx) => {
      const registration = await tx.registration.findUnique({
        where: { id: data.registrationId },
        include: {
          stage: true,
          inspection: true,
          stageInspection: true,
          results: { select: { id: true } },
          classes: { select: { results: { select: { id: true } } } },
        },
      });
      if (!registration) throw new NotFoundException('Регистрация не найдена');
      if (registration.status !== 'ACTIVE') throw new ConflictException('Нельзя проверить неактивную регистрацию');
      if (registration.stage.isDeleted || registration.stage.status === 'CANCELLED') throw new ConflictException('Нельзя проверить регистрацию отменённого этапа');
      if (registration.inspection) throw new ConflictException('Для этого автомобиля на этапе инспекция уже существует');
      if (registration.stageInspection) throw new ConflictException('Старая общая инспекция ещё не перенесена на автомобиль. Обновите миграции и повторите попытку.');
      if (data.status === 'FAILED' && (registration.results.length || registration.classes.some((item: any) => item.results.length))) {
        throw new ConflictException('Нельзя отказать в допуске: по этому автомобилю уже есть результат');
      }
      const created = await tx.inspection.create({
        data: {
          registrationId: registration.id,
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
          action: 'VEHICLE_INSPECTION_CREATED',
          entity: 'Inspection',
          entityId: created.id,
          ipAddress: actor.ipAddress ?? null,
          metadata: { registrationId: registration.id, carId: registration.carId, stageId: registration.stageId, status: created.status, notes: created.notes },
        },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (typeof this.emailNotifications?.inspectionChanged === 'function') await Promise.resolve(this.emailNotifications.inspectionChanged(saved.registrationId, saved.id, saved.status, saved.notes, null, saved.updatedAt)).catch(() => undefined);
    return saved;
  }

  async update(
    id: string,
    data: { status?: InspectionStatus; notes?: string | null },
    actor: Actor,
  ) {
    const vehicleInspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: { registration: { include: { results: { select: { id: true } }, classes: { select: { results: { select: { id: true } } } } } } },
    });
    if (vehicleInspection) {
      this.assertCanEdit(vehicleInspection.createdByUserId ?? vehicleInspection.checkedByUserId, actor);
      const nextStatus = data.status ?? vehicleInspection.status;
      const nextNotes = data.notes === undefined ? vehicleInspection.notes : data.notes;
      this.validateNotes(nextStatus, nextNotes);
      if (nextStatus === 'FAILED' && (vehicleInspection.registration.results.length || vehicleInspection.registration.classes.some((item: any) => item.results.length))) {
        throw new ConflictException('Нельзя отказать в допуске: по этому автомобилю уже есть результат');
      }
      const saved = await this.prisma.$transaction(async (tx) => {
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
            action: 'VEHICLE_INSPECTION_UPDATED',
            entity: 'Inspection',
            entityId: id,
            ipAddress: actor.ipAddress ?? null,
            metadata: { before: { status: vehicleInspection.status, notes: vehicleInspection.notes }, after: { status: updated.status, notes: updated.notes } },
          },
        });
        return updated;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (vehicleInspection.status !== saved.status) {
      await this.emailNotifications?.inspectionChanged(saved.registrationId, saved.id, saved.status, saved.notes, null, saved.updatedAt).catch(() => undefined);
    }
    return saved;
    }

    // Backward compatibility for historical participant-stage inspection IDs.
    const current = await this.prisma.participantStageInspection.findUnique({
      where: { id },
      include: {
        registrations: {
          select: {
            results: { select: { id: true } },
            classes: { select: { results: { select: { id: true } } } },
          },
        },
      },
    });
    if (!current) throw new NotFoundException('Инспекция не найдена');
    this.assertCanEdit(current.createdByUserId ?? current.checkedByUserId, actor);
    const nextStatus = data.status ?? current.status;
    const nextNotes = data.notes === undefined ? current.notes : data.notes;
    this.validateNotes(nextStatus, nextNotes);
    if (nextStatus === 'FAILED' && current.registrations.some((item: any) => item.results.length || item.classes.some((cls: any) => cls.results.length))) {
      throw new ConflictException('Нельзя отказать в допуске: у участника уже есть результат на этом этапе');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.participantStageInspection.update({
        where: { id },
        data: { ...(data.status !== undefined ? { status: data.status } : {}), ...(data.notes !== undefined ? { notes: this.normalizeNotes(data.notes ?? undefined) } : {}), checkedByUserId: actor.userId },
        include: participantStageInspectionInclude,
      });
      await tx.auditLog.create({
        data: { userId: actor.userId, action: 'PARTICIPANT_STAGE_INSPECTION_UPDATED', entity: 'ParticipantStageInspection', entityId: id, ipAddress: actor.ipAddress ?? null, metadata: { before: { status: current.status, notes: current.notes }, after: { status: updated.status, notes: updated.notes } } },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async remove(id: string, actor: Actor) {
    
    const vehicleInspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        registration: {
          include: {
            results: { select: { id: true } },
            classes: { select: { results: { select: { id: true } } } },
          },
        },
      },
    });
    if (vehicleInspection) {
      if (vehicleInspection.registration.results.length || vehicleInspection.registration.classes.some((item: any) => item.results.length)) {
        throw new ConflictException('Нельзя удалить инспекцию: по этому автомобилю уже есть результат');
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.inspection.delete({ where: { id } });
        await tx.auditLog.create({
          data: { userId: actor.userId, action: 'VEHICLE_INSPECTION_DELETED', entity: 'Inspection', entityId: id, ipAddress: actor.ipAddress ?? null, metadata: { registrationId: vehicleInspection.registrationId, status: vehicleInspection.status, notes: vehicleInspection.notes } },
        });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return { success: true, id };
    }

    const current = await this.prisma.participantStageInspection.findUnique({
      where: { id },
      include: {
        registrations: {
          select: {
            results: { select: { id: true } },
            classes: { select: { results: { select: { id: true } } } },
          },
        },
      },
    });
    if (!current) throw new NotFoundException('Инспекция не найдена');
    if (current.registrations.some((item: any) => item.results.length || item.classes.some((cls: any) => cls.results.length))) {
      throw new ConflictException('Нельзя удалить инспекцию: у участника уже есть результат на этом этапе');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.participantStageInspection.delete({ where: { id } });
      await tx.auditLog.create({
        data: { userId: actor.userId, action: 'PARTICIPANT_STAGE_INSPECTION_DELETED', entity: 'ParticipantStageInspection', entityId: id, ipAddress: actor.ipAddress ?? null, metadata: { participantId: current.participantId, stageId: current.stageId, status: current.status, notes: current.notes } },
      });
      return { success: true, id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private assertCanEdit(ownerId: string | null, actor: Actor) {
    if (actor.role === 'ADMIN') return;
    if (!actor.customRoleId || ownerId !== actor.userId) {
      throw new ForbiddenException('Пользователь может изменять только собственные проверки');
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
