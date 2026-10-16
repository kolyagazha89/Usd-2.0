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
      registration: { findUnique: jest.fn().mockResolvedValue(registration), findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn().mockResolvedValue({count:1}) },
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
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
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
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'REGISTRATION_CLASSES_CHANGED', entityId: 'registration-1' }),
    }));
    expect(result.success).toBe(true);
    expect(result.added).toEqual(['New class']);
    expect(result.removed).toEqual(['Old class']);
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
