import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InspectionsService } from './inspections.service';
import { PrismaService } from '../prisma/prisma.service';

describe('InspectionsService', () => {
  const actor = { userId: 'judge-1', role: 'JUDGE' as const, ipAddress: '127.0.0.1' };
  const registration = {
    id: 'registration-1',
    status: 'ACTIVE',
    stage: { isDeleted: false, status: 'PUBLISHED' },
    inspection: null,
  };
  const existing = {
    id: 'inspection-1',
    registrationId: 'registration-1',
    status: 'PASSED',
    notes: null,
    createdByUserId: 'judge-1',
    checkedByUserId: 'judge-1',
  };
  let prisma: any;
  let service: InspectionsService;
  let tx: any;

  beforeEach(() => {
    tx = {
      registration: { findUnique: jest.fn().mockResolvedValue(registration) },
      inspection: {
        create: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data, id: 'inspection-new' })),
        update: jest.fn().mockImplementation(async ({ data }) => ({ ...existing, ...data })),
        delete: jest.fn().mockResolvedValue(existing),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    prisma = {
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
      data: expect.objectContaining({ action: 'INSPECTION_CREATED', entityId: 'inspection-new' }),
    }));
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
        action: 'INSPECTION_UPDATED',
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

  it('allows deletion only for ADMIN', async () => {
    await expect(service.remove('inspection-1', actor)).rejects.toBeInstanceOf(ForbiddenException);
    await service.remove('inspection-1', { ...actor, userId: 'admin-1', role: 'ADMIN' });
    expect(tx.inspection.delete).toHaveBeenCalledWith({ where: { id: 'inspection-1' } });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'INSPECTION_DELETED' }),
    }));
  });

  it('returns not found for a missing inspection', async () => {
    prisma.inspection.findUnique.mockResolvedValue(null);
    await expect(service.update('missing', { status: 'PASSED' }, actor))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
