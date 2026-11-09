import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {MAX_REGISTRATION_CLASS_IDS,planRegistrationClassNumbers,isBassRaceStageClass} from '../registrations/registration-class-numbering';
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

  /** Resolve a scanned permanent USD ID only inside the staff inspection module.
   * This is not a public profile endpoint and never returns contact details.
   * Registration QR lookup remains unchanged.
   */
  async resolveUsdId(token: string, stageId?: string) {
    if (!/^[a-f0-9]{48}$/.test(token)) throw new NotFoundException('USD ID не найден');
    const select={
      id: true, firstName: true, lastName: true, middleName: true,
      mergeAsSource: { select: { targetId: true } },
      registrations: {
        where: {
          status: 'ACTIVE' as const,
          stage: { isDeleted: false },
          ...(stageId ? { stageId } : {}),
        },
        orderBy: { registeredAt: 'desc' as const },
        take: 30,
        select: {
          id: true, stageId: true, participantNumber: true,
          inspection: { select: { status: true } },
          stageInspection: { select: { status: true } },
          stage: { select: { id: true, name: true, date: true } },
          car: { select: { brand: true, model: true, registrationNumber: true } },
        },
      },
    } as const;
    const original=await this.prisma.participant.findUnique({
      where:{usdIdToken:token},select,
    });
    if (!original) throw new NotFoundException('USD ID не найден или перевыпущен');
    const resolved=original.mergeAsSource?.targetId
      ?await this.prisma.participant.findUnique({where:{id:original.mergeAsSource.targetId},select})
      :original;
    if(!resolved)throw new NotFoundException('Профиль USD ID не найден');
    const {mergeAsSource:_alias,...participant}=resolved;
    return participant;
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
    if (requestedIds.length>MAX_REGISTRATION_CLASS_IDS)
      throw new BadRequestException('Превышен технический лимит классов в одной заявке');

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
      let numbering:ReturnType<typeof planRegistrationClassNumbers>;
      try{numbering=planRegistrationClassNumbers(requestedIds,stageClasses)}
      catch(error){throw new BadRequestException(error instanceof Error?error.message:'Недопустимый выбор классов')}
      const nonBassDirections=numbering.regularClassIds.map(id=>
        stageClasses.find(item=>item.classId===id)!.class.directionId);
      if(new Set(nonBassDirections).size!==nonBassDirections.length)
        throw new BadRequestException('Нельзя выбрать несколько классов одного направления (кроме BassRace)');
      const added = stageClasses.filter((item: any) => !existingByClassId.has(item.classId));
      if (!registration.numbers.length) throw new ConflictException('У регистрации нет закреплённого номера участника');

      // Serialize number allocation with ordinary registration creation so two
      // simultaneous class edits cannot reserve the same stage number.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${registration.stageId}))`;

      const numberRows = [...registration.numbers] as any[];
      const primaryNumber = numberRows.find((number: any) => number.isPrimary) ?? numberRows[0];

      // Prefer preserving the existing BassRace class on the primary sticker
      // if primary has room. Never renumber a recorded class silently.
      const oldPrimaryBass=existing.find((item:any)=>
        item.numberId===primaryNumber.id && isBassRaceStageClass(item.class.name,item.class.direction?.name??'')
        && requestedSet.has(item.classId));
      const primaryBassId=numbering.bassOnPrimaryId
        ?oldPrimaryBass?.classId??numbering.bassOnPrimaryId:null;
      const occupiedBassIds=new Set<string>();
      const preservedBassIds=new Set(numbering.bassRaceClassIds.flatMap(id=>{
        const row=existingByClassId.get(id);
        return row?.numberId&&row.numberId!==primaryNumber.id?[row.numberId]:[];
      }));
      let nextStageNumber=1;
      let occupiedStageNumbers:Set<number>|null=null;
      const allocateNewBassRaceNumber=async()=>{
        if(!occupiedStageNumbers){
          await tx.registrationNumber.deleteMany({
            where:{stageId:registration.stageId,registrationId:{not:registrationId},
              isPrimary:false,classes:{none:{}}},
          });
          const rows=await tx.registrationNumber.findMany({
            where:{stageId:registration.stageId},select:{number:true},
          });
          occupiedStageNumbers=new Set(rows.map((row:any)=>Number(row.number)));
        }
        while(occupiedStageNumbers.has(nextStageNumber))nextStageNumber++;
        const newNumber=nextStageNumber++;
        occupiedStageNumbers.add(newNumber);
        const created=await tx.registrationNumber.create({
          data:{stageId:registration.stageId,registrationId,number:newNumber,isPrimary:false},
        });
        numberRows.push(created);
        return created;
      };
      const assignClass=async(classId:string,numberId:string)=>{
        const existingClass=existingByClassId.get(classId);
        if(existingClass){
          if(existingClass.numberId===numberId)return;
          if(existingClass.results?.length)
            throw new ConflictException('Нельзя перенести класс с записанным результатом на другой номер. Требуется проверка администратором.');
          await tx.registrationClass.update({where:{id:existingClass.id},data:{numberId}});
        }else{
          await tx.registrationClass.create({data:{registrationId,classId,numberId}});
        }
      };
      for(const classId of numbering.regularClassIds)await assignClass(classId,primaryNumber.id);
      // Retained BassRace numbers are allocated before new entries so adding
      // a new class cannot steal a sticker from a previously judged class.
      const orderedBass=[...numbering.bassRaceClassIds.filter(id=>existingByClassId.has(id)),
        ...numbering.bassRaceClassIds.filter(id=>!existingByClassId.has(id))];
      for(const classId of orderedBass){
        const oldId=existingByClassId.get(classId)?.numberId;
        let chosenNumber:any;
        if(classId===primaryBassId)chosenNumber=primaryNumber;
        else{
          if(oldId && oldId!==primaryNumber.id && !occupiedBassIds.has(oldId))
            chosenNumber=numberRows.find((row:any)=>row.id===oldId);
          if(!chosenNumber)chosenNumber=numberRows
            .filter((row:any)=>!row.isPrimary&&!occupiedBassIds.has(row.id)&&!preservedBassIds.has(row.id))
            .sort((a:any,b:any)=>Number(a.number)-Number(b.number))[0];
          if(!chosenNumber)chosenNumber=await allocateNewBassRaceNumber();
        }
        occupiedBassIds.add(chosenNumber.id);
        await assignClass(classId,chosenNumber.id);
      }

      if (removed.length) {
        await tx.registrationClass.deleteMany({ where: { id: { in: removed.map((item: any) => item.id) } } });
      }

      // Keep only the primary participant number and numbers still attached to
      // a class. Removed BassRace classes must not leave ghost numbers on the
      // inspection card or block allocation for another car.
      await tx.registrationNumber.deleteMany({
        where: { registrationId, isPrimary: false, classes: { none: {} } },
      });

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

  /**
   * Freeze team identity at the first successful vehicle inspection.
   * Even a missing/unenrolled team is frozen explicitly; subsequent changes
   * cannot transfer yesterday's published performance to a new team.
   */
  private async captureTeamAtFirstPass(
    tx: Prisma.TransactionClient,
    registration: { id: string; stageId: string; participantId: string },
  ) {
    const current = await tx.registration.findUnique({
      where: { id: registration.id },
      select: {
        teamAffiliationCapturedAt: true,
        stage: { select: { resultsPublishedAt: true } },
      },
    });
    // No post-publication retroactive attribution: even a late inspection
    // correction must not invent a team for an already published stage.
    if (!current || current.teamAffiliationCapturedAt || current.stage.resultsPublishedAt) return;
    // Unpublishing results clears resultsPublishedAt. The audit trail still
    // records an earlier publication, so never use a temporary unpublish
    // window to fabricate historical team membership.
    const previouslyPublished = await tx.auditLog.findFirst({
      where: {
        entity: 'Stage',
        entityId: registration.stageId,
        action: 'STAGE_RESULTS_PUBLISHED',
      },
      select: { id: true },
    });
    if (previouslyPublished) return;
    // Multiple vehicles of one participant must retain ONE event affiliation.
    // Reuse the earliest frozen registration, even if the participant later
    // joins, leaves or renames a team between vehicle inspections.
    const prior = await tx.registration.findFirst({
      where: {
        stageId: registration.stageId,
        participantId: registration.participantId,
        id: { not: registration.id },
        teamAffiliationCapturedAt: { not: null },
      },
      orderBy: [{ teamAffiliationCapturedAt: 'asc' }, { id: 'asc' }],
      select: {
        teamIdAtInspection: true,
        teamNameAtInspection: true,
        teamAffiliationCapturedAt: true,
      },
    });
    const membership = prior ? null : await tx.teamMembership.findUnique({
      where: { participantId: registration.participantId },
      select: {
        status: true,
        team: { select: { id: true, name: true, isActive: true } },
      },
    });
    const team = membership?.status === 'APPROVED' && membership.team.isActive
      ? membership.team : null;
    await tx.registration.updateMany({
      where: { id: registration.id, teamAffiliationCapturedAt: null },
      data: {
        teamIdAtInspection: prior ? prior.teamIdAtInspection : (team?.id ?? null),
        teamNameAtInspection: prior ? prior.teamNameAtInspection : (team?.name ?? null),
        teamAffiliationCapturedAt: prior?.teamAffiliationCapturedAt ?? new Date(),
      },
    });
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
      if (data.status === 'PASSED') await this.captureTeamAtFirstPass(tx, registration);
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


  /**
   * Explicit, single-operation import of a previously saved offline decision.
   * This endpoint does NOT trust a device's cached permissions or snapshot:
   * registration status, stage, inspection and result constraints are re-read
   * inside the central PostgreSQL transaction.
   *
   * The committed audit row is the durable idempotency receipt. An advisory
   * transaction lock on the UUID serializes retries across API processes,
   * without a new schema or a potentially unsafe production migration.
   */
  async syncOfflineInspection(
    data: {
      operationId: string; stageId: string; registrationId: string;
      actorId: string; createdAt: string; baseInspectionId?: string | null;
      status: InspectionStatus; notes?: string;
    },
    actor: Actor,
  ) {
    if (data.actorId !== actor.userId) {
      throw new ForbiddenException('Операции другого судьи нельзя отправить из текущей учётной записи');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.operationId)) {
      throw new BadRequestException('Недопустимый идентификатор офлайн-операции');
    }
    const recordedAt = Date.parse(data.createdAt);
    if (!Number.isFinite(recordedAt) || recordedAt > Date.now() + 5 * 60_000 ||
        recordedAt < Date.now() - 72 * 60 * 60_000) {
      throw new ConflictException('Автономный пакет устарел или время устройства неверно; нужна ручная сверка');
    }
    if (data.baseInspectionId) {
      throw new ConflictException('Изменение уже существующей инспекции из офлайн-пакета запрещено');
    }
    this.validateNotes(data.status, data.notes);
    const notes = data.status === 'FAILED' ? (data.notes ?? '').trim() : '';
    if (notes.length > 2000) throw new BadRequestException('Комментарий превышает 2000 символов');
    const payloadHash = createHash('sha256').update(JSON.stringify([
      data.operationId, data.stageId, data.registrationId, data.actorId,
      data.createdAt, data.status, notes, data.baseInspectionId ?? null,
    ])).digest('hex');

    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize concurrent retries for one immutable operation ID.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${data.operationId}))`;
      const previous = await tx.auditLog.findFirst({
        where: {
          action: 'OFFLINE_INSPECTION_SYNCED',
          entity: 'OfflineInspectionOperation',
          entityId: data.operationId,
        },
        select: { userId: true, metadata: true },
      });
      if (previous) {
        const metadata = previous.metadata as Record<string, unknown> | null;
        if (previous.userId !== actor.userId || metadata?.payloadHash !== payloadHash ||
            typeof metadata?.inspectionId !== 'string') {
          throw new ConflictException('Этот идентификатор операции уже использован для других данных');
        }
        return {
          success: true, operationId: data.operationId, registrationId: data.registrationId,
          inspectionId: metadata.inspectionId, repeated: true,
        };
      }

      const registration = await tx.registration.findUnique({
        where: { id: data.registrationId },
        include: {
          stage: true, inspection: true, stageInspection: true,
          results: { select: { id: true } },
          classes: { select: { results: { select: { id: true } } } },
        },
      });
      if (!registration || registration.stageId !== data.stageId) {
        throw new ConflictException('Регистрация не принадлежит этапу из автономного пакета');
      }
      if (registration.status !== 'ACTIVE' || registration.stage.isDeleted ||
          registration.stage.status === 'CANCELLED' || registration.stage.resultsPublishedAt) {
        throw new ConflictException('Регистрация или этап уже закрыты для переноса инспекции');
      }
      if (registration.inspection || registration.stageInspection) {
        throw new ConflictException('На сервере уже существует инспекция; нужна ручная сверка');
      }
      if (data.status === 'FAILED' && (
        registration.results.length ||
        registration.classes.some((item: { results: { id: string }[] }) => item.results.length)
      )) {
        throw new ConflictException('Для отказа уже есть результат; решение требует проверки администратора');
      }
      const created = await tx.inspection.create({
        data: {
          registrationId: registration.id, status: data.status,
          notes: notes || null, checkedByUserId: actor.userId,
          createdByUserId: actor.userId,
        },
        include: inspectionInclude,
      });
      if (data.status === 'PASSED') await this.captureTeamAtFirstPass(tx, registration);
      await tx.auditLog.create({
        data: {
          userId: actor.userId, action: 'VEHICLE_INSPECTION_CREATED',
          entity: 'Inspection', entityId: created.id, ipAddress: actor.ipAddress ?? null,
          metadata: {
            registrationId: registration.id, carId: registration.carId,
            stageId: registration.stageId, status: data.status,
            notes: notes || null, source: 'OFFLINE_SYNC',
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: actor.userId, action: 'OFFLINE_INSPECTION_SYNCED',
          entity: 'OfflineInspectionOperation', entityId: data.operationId,
          ipAddress: actor.ipAddress ?? null,
          metadata: {
            payloadHash, inspectionId: created.id,
            registrationId: registration.id, stageId: registration.stageId,
            deviceRecordedAt: data.createdAt,
          },
        },
      });
      return {
        success: true, operationId: data.operationId, registrationId: data.registrationId,
        inspectionId: created.id, repeated: false,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!result.repeated && typeof this.emailNotifications?.inspectionChanged === 'function') {
      await Promise.resolve(this.emailNotifications.inspectionChanged(
        data.registrationId, result.inspectionId, data.status, notes || null, null, new Date(),
      )).catch(() => undefined);
    }
    return result;
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
        if (vehicleInspection.status !== 'PASSED' && updated.status === 'PASSED')
          await this.captureTeamAtFirstPass(tx, vehicleInspection.registration);
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
