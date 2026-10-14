import { jest } from '@jest/globals';
import { RegistrationsService } from './registrations.service';

describe('RegistrationsService rules consent', () => {
  const prisma: any = { $transaction: jest.fn() };
  const request: any = { user: { id: 'user-1', sub: 'user-1', role: 'PARTICIPANT', participantId: 'participant-1' } };
  const body = {
    stageId: 'stage-1',
    participantId: 'participant-1',
    carId: 'car-1',
    classIds: ['class-1'],
    configurationVersionId: 'configuration-version-1',
    rulesAccepted: false,
  };

  beforeEach(() => jest.clearAllMocks());

  it('rejects participant registration unless the rules checkbox was explicitly accepted', async () => {
    const service = new RegistrationsService(prisma);
    await expect(service.create(request, body)).rejects.toThrow('Подтвердите ознакомление с регламентом выбранного этапа');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
