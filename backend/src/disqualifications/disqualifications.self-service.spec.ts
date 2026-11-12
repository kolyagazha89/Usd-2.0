import { jest } from '@jest/globals';
import { DisqualificationsService } from './disqualifications.service';

describe('disqualification read model for own participant profile', () => {
  const findMany = jest.fn();
  const service = new DisqualificationsService(
    { disqualification: { findMany } } as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('does not query other participants when the logged-in account has no linked profile', async () => {
    await expect(service.listActiveForOwnProfile(undefined)).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns only active sanctions for the authenticated participant and a safe field selection', async () => {
    const records = [{ id: 'ban-1', scope: 'FORMAT', reason: 'Нарушение регламента' }];
    findMany.mockResolvedValue(records);
    await expect(service.listActiveForOwnProfile('my-profile')).resolves.toEqual(records);
    expect(findMany).toHaveBeenCalledWith({
      where: { participantId: 'my-profile', status: 'ACTIVE' },
      select: {
        id: true, scope: true, stageId: true, seasonId: true,
        reason: true, createdAt: true, status: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });
});
