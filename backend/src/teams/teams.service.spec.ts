import { jest } from '@jest/globals';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TeamsService } from './teams.service';

const request = (sub = 'commander') =>
  ({ user: { sub, role: 'ADMIN' } }) as any;
describe('team authority boundaries', () => {
  const prisma: any = {
    user: { findUnique: jest.fn() },
    team: { findUnique: jest.fn() },
  };
  let service: TeamsService;
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'commander',
      role: 'PARTICIPANT',
      isActive: true,
      emailVerifiedAt: new Date(),
      participantId: 'p1',
    });
    prisma.team.findUnique.mockResolvedValue({
      id: 'other',
      commanderUserId: 'another',
      isActive: true,
    });
    service = new TeamsService(prisma);
  });
  it('denies forged ADMIN claims and another team ID before writes', async () => {
    await expect(
      service.updateTeam(request(), 'other', { description: 'hijack' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('reserves team creation to current ADMIN', async () => {
    await expect(
      service.createTeam(request(), { name: 'Unauthorized' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('denies even a commander the ability to publish', async () => {
    prisma.team.findUnique.mockResolvedValue({
      id: 'own',
      commanderUserId: 'commander',
      isActive: true,
    });
    await expect(
      service.savePost(request(), 'own', {
        kind: 'NEWS',
        title: 'Title',
        body: 'Body',
        status: 'PUBLISHED',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('denies inactive accounts despite a cached token', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'commander',
      role: 'ADMIN',
      isActive: false,
    });
    await expect(service.mine(request())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
