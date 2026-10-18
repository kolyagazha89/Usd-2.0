import { jest } from '@jest/globals';
import { AuthService } from './auth.service';

describe('AuthService.findHistoricalProfileCandidates', () => {
  const makeService = () => {
    const participant = {
      id: 'participant-1',
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Иванович',
      team: 'USD',
      city: 'Тюмень',
      user: null,
      isPublic: true,
      cars: [],
      _count: { registrations: 3 },
    };
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'ivan@example.com',
          participantId: null,
          role: 'PARTICIPANT',
        }),
      },
      participant: {
        findMany: jest.fn().mockResolvedValue([participant]),
      },
      participantLegacyEmail: {
        findMany: jest.fn().mockResolvedValue([{participantId:'participant-1'}]),
        findUnique: jest.fn().mockResolvedValue({ email: 'ivan@example.com' }),
      },
    };
    const service = Object.create(AuthService.prototype) as AuthService;
    (service as any).prisma = prisma;
    return { service, prisma, participant };
  };

  it('searches by a partial Cyrillic first name such as «Иван»', async () => {
    const { service, prisma, participant } = makeService();

    const result = await service.findHistoricalProfileCandidates('user-1', 'Иван');

    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: { is: null },
          OR: [{ isPublic: true }, { id: { in: ['participant-1'] } }],
          AND: [
            {
              OR: [
                { lastName: { contains: 'иван', mode: 'insensitive' } },
                { firstName: { contains: 'иван', mode: 'insensitive' } },
                { middleName: { contains: 'иван', mode: 'insensitive' } },
              ],
            },
          ],
        },
        take: 100,
      }),
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].id).toBe(participant.id);
    expect(result.candidates[0].canSelfLink).toBe(true);
  });

  it('requires every word in a partial full-name query to match a name field', async () => {
    const { service, prisma } = makeService();

    await service.findHistoricalProfileCandidates('user-1', 'Иванов Иван');

    const call = (prisma.participant.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.AND).toHaveLength(2);
    expect(call.where.AND[0].OR[0].lastName.contains).toBe('иванов');
    expect(call.where.AND[1].OR[1].firstName.contains).toBe('иван');
  });
  it('never returns plates, contact fields or unowned private candidates', async () => {
    const {service, prisma, participant} = makeService();
    prisma.participantLegacyEmail.findMany.mockResolvedValue([]);
    prisma.participant.findMany.mockResolvedValue([
      {...participant, phone:'secret', cars:[{id:'car',brand:'Test',model:'Car',registrationNumber:'А123АА77',phone:'secret'}]},
      {...participant,id:'private',isPublic:false},
    ]);
    const result = await service.findHistoricalProfileCandidates('user-1', 'Иван');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].canSelfLink).toBe(false);
    expect(JSON.stringify(result)).not.toContain('А123АА77');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('permits discovery of an owned private historical profile', async () => {
    const {service, prisma, participant} = makeService();
    prisma.participant.findMany.mockResolvedValue([{...participant,isPublic:false}]);
    expect((await service.findHistoricalProfileCandidates('user-1','Иван')).candidates[0].canSelfLink).toBe(true);
  });
});
