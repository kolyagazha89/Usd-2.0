import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';

describe('registrations preview: private, provisional, gap-aware', () => {
  const prisma: any = {
    stage: { findUnique: jest.fn() },
    registration: { findMany: jest.fn() },
    registrationNumber: { findMany: jest.fn() },
  };
  let service: RegistrationsService;
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.stage.findUnique.mockResolvedValue({ id: 'stage-1', status: 'PUBLISHED', isDeleted: false });
    prisma.registration.findMany.mockResolvedValue([
      { participantId: 'a' }, { participantId: 'a' }, { participantId: 'b' },
    ]);
    prisma.registrationNumber.findMany.mockResolvedValue([{ number: 1 }, { number: 2 }, { number: 4 }]);
    service = new RegistrationsService(prisma);
  });
  it('counts unique active people and suggests the lowest freed primary sticker', async () => {
    const result = await service.previewStageRegistration('stage-1');
    expect(result).toMatchObject({ stageId: 'stage-1', registeredParticipants: 2, nextAvailablePrimaryNumber: 3, provisional: true });
    expect(prisma.registration.findMany).toHaveBeenCalledWith({
      where: { stageId: 'stage-1', status: 'ACTIVE' }, select: { participantId: true },
    });
    expect(prisma.registrationNumber.findMany).toHaveBeenCalledWith({
      where: { stageId: 'stage-1', number: { gt: 0 } }, select: { number: true },
    });
    expect(result).not.toHaveProperty('participantIds');
    expect(result).not.toHaveProperty('registeredNames');
  });
  it('starts at one and skips non-positive archival values', async () => {
    prisma.registrationNumber.findMany.mockResolvedValueOnce([{ number: -2 }, { number: 0 }, { number: 2 }]);
    const result = await service.previewStageRegistration('stage-1');
    expect(result.nextAvailablePrimaryNumber).toBe(1);
  });
  it('does not expose deleted or unpublished stage information', async () => {
    for (const stage of [null, {id:'stage-1',isDeleted:true,status:'PUBLISHED'}, {id:'stage-1',isDeleted:false,status:'DRAFT'}]) {
      prisma.stage.findUnique.mockResolvedValueOnce(stage);
      await expect(service.previewStageRegistration('stage-1')).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(prisma.registrationNumber.findMany).not.toHaveBeenCalled();
  });
});
