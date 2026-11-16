import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamManagementService } from './team-management.service';
const request = { user: { sub: 'u' } } as any;
describe('simple team selection', () => {
  let db: any, service: TeamManagementService;
  beforeEach(() => {
    db = {
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn(),
      },
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({
            id: 'u',
            role: 'PARTICIPANT',
            isActive: true,
            emailVerifiedAt: new Date(),
            participantId: 'p',
          }),
      },
      participant: {
        findMany: jest.fn().mockResolvedValue([{ team: 'Legacy' }]),
        update: jest.fn().mockResolvedValue({ team: 'First' }),
      },
      team: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 't', name: 'First', nameKey: 'first', isActive: true },
          ]),
        upsert: jest
          .fn()
          .mockResolvedValue({ id: 't', name: 'First', isActive: true }),
      },
      teamMembership: {
        upsert: jest.fn().mockResolvedValue({ status: 'APPROVED' }),
        updateMany: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation(async (fn: any) => fn(db));
    service = new TeamManagementService(db);
  });
  it('defaults to simple mode without changing existing data', async () => {
    expect(await service.mode()).toEqual({ fullManagement: false });
    await expect(service.requireFull()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.siteSettings.upsert).not.toHaveBeenCalled();
  });
  it('accepts only an actual enabled boolean', async () => {
    db.siteSettings.findUnique.mockResolvedValue({
      registration: { fullTeamManagement: 'true' },
    });
    expect((await service.mode()).fullManagement).toBe(false);
    db.siteSettings.findUnique.mockResolvedValue({
      registration: { fullTeamManagement: true },
    });
    await expect(service.requireFull()).resolves.toBeUndefined();
  });
  it('selects a listed team immediately and updates profile and inspection membership together', async () => {
    await service.select(request, ' first ');
    expect(db.participant.update).toHaveBeenCalledWith({
      where: { id: 'p' },
      data: { team: 'First' },
    });
    expect(db.teamMembership.upsert.mock.calls[0][0]).toMatchObject({
      create: { teamId: 't', participantId: 'p', status: 'APPROVED' },
      update: { teamId: 't', status: 'APPROVED' },
    });
  });
  it('rejects arbitrary names and archived teams before any writes', async () => {
    await expect(service.select(request, 'Invented')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    db.team.findMany.mockResolvedValue([
      { id: 't', name: 'Legacy', nameKey: 'legacy', isActive: false },
    ]);
    await expect(service.select(request, 'Legacy')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.participant.update).not.toHaveBeenCalled();
  });
  it('clears both current links without touching registration history', async () => {
    await service.select(request, '');
    expect(db.participant.update).toHaveBeenCalledWith({
      where: { id: 'p' },
      data: { team: null },
    });
    expect(db.teamMembership.updateMany).toHaveBeenCalledWith({
      where: { participantId: 'p', status: { in: ['PENDING', 'APPROVED'] } },
      data: { status: 'LEFT' },
    });
  });
  it('requires a linked profile and refuses direct selection in full mode', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'u',
      role: 'PARTICIPANT',
      isActive: true,
      emailVerifiedAt: new Date(),
      participantId: null,
    });
    await expect(service.select(request, 'First')).rejects.toThrow('профиль');
    db.siteSettings.findUnique.mockResolvedValue({
      registration: { fullTeamManagement: true },
    });
    await expect(service.select(request, 'First')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('toggles the mode without overwriting registration settings or team content', async () => {
    db.user.findUnique.mockResolvedValue({
      id: 'u',
      role: 'ADMIN',
      isActive: true,
      emailVerifiedAt: new Date(),
    });
    db.siteSettings.findUnique.mockResolvedValue({
      registration: { price: 2000, enabled: true, fullTeamManagement: true },
    });
    expect(await service.setMode(request, false)).toEqual({
      fullManagement: false,
    });
    expect(db.siteSettings.upsert.mock.calls[0][0].update).toEqual({
      registration: { price: 2000, enabled: true, fullTeamManagement: false },
    });
    expect(db.team.upsert).not.toHaveBeenCalled();
    expect(db.teamMembership.upsert).not.toHaveBeenCalled();
  });
  it('only ADMIN can change the global mode', async () => {
    await expect(service.setMode(request, true)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(db.siteSettings.upsert).not.toHaveBeenCalled();
  });
});
