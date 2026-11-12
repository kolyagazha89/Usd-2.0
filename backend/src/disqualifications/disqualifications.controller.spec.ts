import { ForbiddenException } from '@nestjs/common';
import { DisqualificationsController } from './disqualifications.controller';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

describe('DisqualificationsController self-service status', () => {
  const findAll = jest.fn();
  const controller = new DisqualificationsController({ findAll } as any);

  beforeEach(() => findAll.mockReset());

  it('returns only active disqualifications for the authenticated participant', async () => {
    const sanctions = [{ id: 'dq-1', scope: 'FORMAT', status: 'ACTIVE' }];
    findAll.mockResolvedValue(sanctions);
    const request = { user: { sub: 'user-1', role: 'PARTICIPANT', participantId: 'participant-1' } } as AuthenticatedRequest;

    await expect(controller.getMyActiveDisqualifications(request)).resolves.toEqual(sanctions);
    expect(findAll).toHaveBeenCalledWith({ participantId: 'participant-1', status: 'ACTIVE' });
  });

  it('does not allow an account without a linked participant to query sanctions', () => {
    const request = { user: { sub: 'user-2', role: 'PARTICIPANT' } } as AuthenticatedRequest;
    expect(() => controller.getMyActiveDisqualifications(request)).toThrow(ForbiddenException);
    expect(findAll).not.toHaveBeenCalled();
  });
});
