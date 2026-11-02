import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InspectionsService', () => {
  const actor = { userId: 'judge-1', role: 'PARTICIPANT' as const, customRoleId: 'judge-role', ipAddress: '127.0.0.1' };
  const registration = {
    id: 'registration-1',
    participantId: 'participant-1',
    stageId: 'stage-1',
    carId: 'car-1',
    status: 'ACTIVE',
    stage: { isDeleted: false, status: 'PUBLISHED' },
    inspection: null,
    stageInspection: null,
    results: [],
    classes: [],
  };
  const existing = {
    id: 'inspection-1',
    participantId: 'participant-1',
    stageId: 'stage-1',
    registrationId: 'registration-1',
    status: 'PASSED',
    notes: null,
    createdByUserId: 'judge-1',
    checkedByUserId: 'judge-1',
    registration: {
      results: [],
      classes: [],
    },
  };
  let prisma: any;
  let service: InspectionsService;
  let tx: any;

  beforeEach(() => {
    tx = {
      $executeRaw: jest.fn(),
      registrationNumber: {
        findFirst: jest.fn().mockResolvedValue({ number: 6 }),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'number-new', number: 7, isPrimary: false }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      registration: { findUnique: jest.fn().mockResolvedValue(registration), findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({count:1}) },
      participantStageInspection: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data, id: 'inspection-new', registrations: [] })),
        update: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data, registrations: [] })),
        delete: jest.fn().mockResolvedValue(existing),
      },
      inspection: {
        create: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data, id: 'inspection-new' })),
        update: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data })),
        delete: jest.fn().mockResolvedValue(existing),
      },
      teamMembership: { findUnique: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }), findFirst: jest.fn().mockResolvedValue(null) },
    };
    prisma = {
      participantStageInspection: { findUnique: jest.fn().mockResolvedValue({ ...existing, registrations: [] }) },
      inspection: { findUnique: jest.fn().mockResolvedValue(existing) },
      $transaction: jest.fn().mockImplementation(async (callback) => callback(tx)),
    };
    service = new InspectionsService(prisma as PrismaService);
  });

  it('requires a comment when a check fails', async () => {
    await expect(service.create(
      { registrationId: 'registration-1', status: 'FAILED' },
      actor,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates one inspection and audits its creation', async () => {
    const result = await service.create(
      { registrationId: 'registration-1', status: 'FAILED', notes: 'Не закреплён аккумулятор' },
      actor,
    );
    expect(result.status).toBe('FAILED');
    expect(tx.inspection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: 'FAILED',
        createdByUserId: actor.userId,
        checkedByUserId: actor.userId,
      }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'VEHICLE_INSPECTION_CREATED', entityId: 'inspection-new' }),
    }));
  });

  it('captures the approved team name and ID on the first passed inspection',async()=>{
    tx.teamMembership.findUnique.mockResolvedValue({
      status:'APPROVED', team:{id:'team-1',name:'Team First',isActive:true},
    });
    await service.create({registrationId:registration.id,status:'PASSED'},actor);
    expect(tx.teamMembership.findUnique).toHaveBeenCalledWith({
      where:{participantId:registration.participantId}, select:expect.any(Object),
    });
    expect(tx.registration.updateMany).toHaveBeenCalledWith({
      where:{id:registration.id,teamAffiliationCapturedAt:null},
      data:expect.objectContaining({
        teamIdAtInspection:'team-1',teamNameAtInspection:'Team First',
        teamAffiliationCapturedAt:expect.any(Date),
      }),
    });
  });

  it('freezes absence of a team and does not rewrite it when the participant joins later',async()=>{
    await service.create({registrationId:registration.id,status:'PASSED'},actor);
    expect(tx.registration.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({teamIdAtInspection:null,teamNameAtInspection:null}),
    }));
    tx.registration.findUnique.mockImplementation(async ({select}:any)=>
      select?.teamAffiliationCapturedAt
        ? {teamAffiliationCapturedAt:new Date()} : registration);
    tx.teamMembership.findUnique.mockResolvedValue({
      status:'APPROVED',team:{id:'team-later',name:'Team Later',isActive:true},
    });
    await service.create({registrationId:registration.id,status:'PASSED'},actor);
    expect(tx.registration.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.teamMembership.findUnique).toHaveBeenCalledTimes(1);
  });

  it('reuses the same team for two cars inspected at the same stage despite a later team switch',async()=>{
    tx.registration.findFirst.mockResolvedValue({
      teamIdAtInspection:'team-first',teamNameAtInspection:'Team First',
      teamAffiliationCapturedAt:new Date('2026-10-30T10:00:00Z'),
    });
    tx.teamMembership.findUnique.mockResolvedValue({
      status:'APPROVED',team:{id:'team-second',name:'Team Second',isActive:true},
    });
    await service.create({registrationId:registration.id,status:'PASSED'},actor);
    expect(tx.registration.findFirst).toHaveBeenCalledWith({
      where:{
        stageId:registration.stageId,participantId:registration.participantId,
        id:{not:registration.id},teamAffiliationCapturedAt:{not:null},
      },
      orderBy:[{teamAffiliationCapturedAt:'asc'},{id:'asc'}],
      select:expect.any(Object),
    });
    expect(tx.teamMembership.findUnique).not.toHaveBeenCalled();
    expect(tx.registration.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data:{
        teamIdAtInspection:'team-first',teamNameAtInspection:'Team First',
        teamAffiliationCapturedAt:new Date('2026-10-30T10:00:00Z'),
      },
    }));
  });

  it('never attributes a new team when an old published stage was temporarily unpublished',async()=>{
    tx.auditLog.findFirst.mockResolvedValue({id:'publication-audit'});
    await service.create({registrationId:registration.id,status:'PASSED'},actor);
    expect(tx.auditLog.findFirst).toHaveBeenCalledWith({
      where:{
        entity:'Stage',entityId:registration.stageId,
        action:'STAGE_RESULTS_PUBLISHED',
      },
      select:{id:true},
    });
    expect(tx.teamMembership.findUnique).not.toHaveBeenCalled();
    expect(tx.registration.updateMany).not.toHaveBeenCalled();
  });

  it('never fabricates team membership when official results are already published',async()=>{
    tx.registration.findUnique.mockResolvedValue({
      ...registration,
      stage:{...registration.stage,resultsPublishedAt:new Date()},
      teamAffiliationCapturedAt:null,
    });
    await service.create({registrationId:registration.id,status:'PASSED'},actor);
    expect(tx.teamMembership.findUnique).not.toHaveBeenCalled();
    expect(tx.registration.updateMany).not.toHaveBeenCalled();
  });

  it('does not attribute pending or archived team members to an event',async()=>{
    tx.teamMembership.findUnique.mockResolvedValue({
      status:'PENDING',team:{id:'team-pending',name:'Pending team',isActive:true},
    });
    await service.create({registrationId:registration.id,status:'PASSED'},actor);
    expect(tx.registration.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({teamIdAtInspection:null,teamNameAtInspection:null}),
    }));
  });

  it('does not attribute a team for FAILED or unchanged historical PASSED inspections',async()=>{
    await service.create({registrationId:registration.id,status:'FAILED',notes:'Не закреплён аккумулятор'},actor);
    await service.update('inspection-1',{status:'PASSED'},actor);
    expect(tx.teamMembership.findUnique).not.toHaveBeenCalled();
    expect(tx.registration.updateMany).not.toHaveBeenCalled();
  });

  it('captures team at the FIRST transition from FAILED to PASSED',async()=>{
    prisma.inspection.findUnique.mockResolvedValue({
      ...existing,status:'FAILED',
      registration:{...existing.registration,id:registration.id,stageId:registration.stageId,participantId:registration.participantId},
    });
    await service.update('inspection-1',{status:'PASSED'},actor);
    expect(tx.registration.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({teamAffiliationCapturedAt:expect.any(Date)}),
    }));
  });

  it('blocks a failed vehicle inspection when this registration or one of its classes already has a result', async () => {
    tx.registration.findUnique.mockResolvedValue({ ...registration, results: [{ id: 'result-1' }], classes: [] });
    await expect(service.create(
      { registrationId: 'registration-1', status: 'FAILED', notes: 'Проблема с электрикой' },
      actor,
    )).rejects.toBeInstanceOf(ConflictException);
    expect(tx.inspection.create).not.toHaveBeenCalled();
  });

  it('rejects a second inspection for the same registration', async () => {
    tx.registration.findUnique.mockResolvedValue({ ...registration, inspection: existing });
    await expect(service.create(
      { registrationId: 'registration-1', status: 'PASSED' },
      actor,
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows a judge to edit their own inspection and records before/after state', async () => {
    await service.update('inspection-1', { status: 'FAILED', notes: 'Проверить электропроводку' }, actor);
    expect(tx.inspection.update).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action: 'VEHICLE_INSPECTION_UPDATED',
        metadata: expect.objectContaining({
          before: expect.objectContaining({ status: 'PASSED' }),
          after: expect.objectContaining({ status: 'FAILED' }),
        }),
      }),
    }));
  });

  it('does not allow a judge to edit another judge’s inspection', async () => {
    prisma.inspection.findUnique.mockResolvedValue({ ...existing, createdByUserId: 'judge-2' });
    await expect(service.update('inspection-1', { status: 'PASSED' }, actor))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an admin to edit another judge’s inspection', async () => {
    prisma.inspection.findUnique.mockResolvedValue({ ...existing, createdByUserId: 'judge-2' });
    await service.update('inspection-1', { status: 'PASSED' }, { ...actor, userId: 'admin-1', role: 'ADMIN' });
    expect(tx.inspection.update).toHaveBeenCalled();
  });

  it('performs deletion after the route permission guard authorizes it', async () => {
    await service.remove('inspection-1', actor);
    expect(tx.inspection.delete).toHaveBeenCalledWith({ where: { id: 'inspection-1' } });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'VEHICLE_INSPECTION_DELETED' }),
    }));
  });

  it('returns not found for a missing inspection', async () => {
    prisma.inspection.findUnique.mockResolvedValue(null);
    prisma.participantStageInspection.findUnique.mockResolvedValue(null);
    await expect(service.update('missing', { status: 'PASSED' }, actor))
      .rejects.toBeInstanceOf(NotFoundException);
  });
  it('requires a comment for a failed BassRace class inspection', async () => {
    await expect(service.createClassInspection(
      { registrationClassId: 'registration-class-1', status: 'FAILED' },
      actor,
    )).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates and audits an independent inspection for a BassRace class and participant number', async () => {
    const registrationClass = {
      id: 'registration-class-1',
      inspection: null,
      class: { id: 'class-bass', name: '159.9', direction: { name: 'BassRace' } },
      results: [],
      registration: { id: 'registration-1', status: 'ACTIVE', stage: { isDeleted: false, status: 'PUBLISHED' } },
    };
    const classInspection = { id: 'class-inspection-new', registrationClassId: 'registration-class-1', status: 'PASSED', notes: null, createdByUserId: actor.userId, checkedByUserId: actor.userId, registrationClass };
    tx.registrationClass = { findUnique: jest.fn().mockResolvedValue(registrationClass) };
    tx.registrationClassInspection = {
      create: jest.fn().mockImplementation(async ({ data }) => ({ ...classInspection, ...data })),
      update: jest.fn().mockImplementation(async ({ data }) => ({ ...classInspection, ...data })),
      delete: jest.fn().mockResolvedValue(classInspection),
    };
    prisma.registrationClassInspection = { findUnique: jest.fn().mockResolvedValue(classInspection) };

    const result = await service.createClassInspection(
      { registrationClassId: 'registration-class-1', status: 'PASSED' },
      actor,
    );
    expect(result.registrationClassId).toBe('registration-class-1');
    expect(tx.registrationClassInspection.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ registrationClassId: 'registration-class-1', status: 'PASSED', checkedByUserId: actor.userId }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'BASSRACE_CLASS_INSPECTION_CREATED', entityId: 'class-inspection-new' }),
    }));
  });


  it('allows correcting classes after a passed inspection and audits the change', async () => {
    const registrationRow: any = {
      ...registration,
      stage: { isDeleted: false, status: 'PUBLISHED' },
      numbers: [{ id: 'number-1', number: 1, isPrimary: true }],
      inspection: { status: 'PASSED' },
      classes: [{
        id: 'registration-class-old',
        registrationId: 'registration-1',
        classId: 'class-old',
        numberId: 'number-1',
        number: { id: 'number-1', number: 1 },
        class: { id: 'class-old', name: 'Old class', directionId: 'direction-1', direction: { name: 'SPL' } },
        results: [],
        inspection: null,
      }],
    };
    tx.registration = { findUnique: jest.fn().mockResolvedValue(registrationRow) };
    tx.stageClass = { findMany: jest.fn().mockResolvedValue([{
      classId: 'class-new',
      class: { id: 'class-new', name: 'New class', directionId: 'direction-1', direction: { name: 'SPL' } },
    }]) };
    tx.registrationClass = {
      create: jest.fn().mockResolvedValue({ id: 'registration-class-new' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    };

    const result = await service.updateRegistrationClasses('registration-1', ['class-new'], actor);

    expect(tx.registrationClass.create).toHaveBeenCalledWith({
      data: { registrationId: 'registration-1', classId: 'class-new', numberId: 'number-1' },
    });
    expect(tx.registrationClass.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['registration-class-old'] } } });
    expect(tx.registrationNumber.deleteMany).toHaveBeenCalledWith({
      where: { registrationId: 'registration-1', isPrimary: false, classes: { none: {} } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REGISTRATION_CLASSES_CHANGED', entityId: 'registration-1' }),
    }));
    expect(result.success).toBe(true);
    expect(result.added).toEqual(['New class']);
    expect(result.removed).toEqual(['Old class']);
  });

  it('reuses a previously reserved BassRace number when adding another BassRace class', async () => {
    const numberRows = [
      { id: 'number-2', number: 2, isPrimary: true },
      { id: 'number-3', number: 3, isPrimary: false },
      { id: 'number-4', number: 4, isPrimary: false },
      { id: 'number-6', number: 6, isPrimary: false },
    ];
    const currentBassRace = {
      id: 'registration-class-bass-129',
      registrationId: 'registration-1',
      classId: 'class-bass-129',
      numberId: 'number-2',
      number: numberRows[0],
      class: { id: 'class-bass-129', name: 'BassRace 129.9', directionId: 'direction-bass', direction: { name: 'BassRace' } },
      results: [],
      inspection: null,
    };
    const registrationRow: any = {
      ...registration,
      stage: { isDeleted: false, status: 'PUBLISHED' },
      numbers: numberRows,
      inspection: { status: 'PASSED' },
      classes: [currentBassRace],
    };
    tx.registration = { findUnique: jest.fn().mockResolvedValue(registrationRow) };
    tx.stageClass = { findMany: jest.fn().mockResolvedValue([
      { classId: 'class-bass-129', class: currentBassRace.class },
      { classId: 'class-bass-139', class: { id: 'class-bass-139', name: 'BassRace 139.9', directionId: 'direction-bass', direction: { name: 'BassRace' } } },
    ]) };
    tx.registrationClass = {
      create: jest.fn().mockResolvedValue({ id: 'registration-class-bass-139' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };

    await service.updateRegistrationClasses('registration-1', ['class-bass-129', 'class-bass-139'], actor);

    expect(tx.registrationClass.create).toHaveBeenCalledWith({
      data: { registrationId: 'registration-1', classId: 'class-bass-139', numberId: 'number-3' },
    });
    expect(tx.registrationNumber?.create).not.toHaveBeenCalled();
  });

  it('blocks removing a class that already has a result', async () => {
    tx.registration = { findUnique: jest.fn().mockResolvedValue({
      ...registration,
      stage: { isDeleted: false, status: 'PUBLISHED' },
      numbers: [{ id: 'number-1', number: 1, isPrimary: true }],
      classes: [{
        id: 'registration-class-old',
        classId: 'class-old',
        class: { id: 'class-old', name: 'Old class', directionId: 'direction-1', direction: { name: 'SPL' } },
        number: { id: 'number-1', number: 1 },
        results: [{ id: 'result-1' }],
        inspection: null,
      }],
    }) };
    tx.stageClass = { findMany: jest.fn().mockResolvedValue([]) };
    tx.registrationClass = { deleteMany: jest.fn() };

    await expect(service.updateRegistrationClasses('registration-1', ['class-new'], actor))
      .rejects.toBeInstanceOf(ConflictException);
    expect(tx.registrationClass.deleteMany).not.toHaveBeenCalled();
  });

});
