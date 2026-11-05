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
        findUnique: jest.fn().mockResolvedValue({ email: 'ivan@example.com' }),
      },
    };
    const service = Object.create(AuthService.prototype) as AuthService;
    (service as any).prisma = prisma;
    return { service, prisma, participant };
  };

  it('searches by a partial Cyrillic first name such as «Иван»', async () => {
    const { service, prisma, participant } = makeService();

    const result = await service.findHistoricalProfileCandidates({sub:'user-1',email:'ivan@example.com'}, 'Иван');

    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          user: { is: null },
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
    expect(prisma.user.findUnique).not.toHaveBeenCalled(); // Already validated by JwtAuthGuard
  });

  it('requires every word in a partial full-name query to match a name field', async () => {
    const { service, prisma } = makeService();

    await service.findHistoricalProfileCandidates({sub:'user-1',email:'ivan@example.com'}, 'Иванов Иван');

    const call = (prisma.participant.findMany as jest.Mock).mock.calls[0][0];
    expect(call.where.AND).toHaveLength(2);
    expect(call.where.AND[0].OR[0].lastName.contains).toBe('иванов');
    expect(call.where.AND[1].OR[1].firstName.contains).toBe('иван');
  });
  it('does not expose a non-public profile to another verified account', async () => {
    const { service, prisma, participant } = makeService();
    (prisma.participant.findMany as jest.Mock).mockResolvedValue([
      { ...participant, isPublic: false, city: 'Закрытый город', cars: [{
        id: 'car-private', brand: 'Secret', model: 'Private', registrationNumber: 'А001АА77',
      }] },
    ]);
    (prisma.participantLegacyEmail.findUnique as jest.Mock).mockResolvedValue({
      email: 'different@example.com',
    });
    const result = await service.findHistoricalProfileCandidates(
      { sub: 'unrelated', email: 'unrelated@example.com' }, 'Иван',
    );
    expect(result.found).toBe(0);
    expect(result.candidates).toEqual([]);
  });

  it('does not disclose plate, city or team of public unowned candidates', async () => {
    const { service, prisma, participant } = makeService();
    (prisma.participant.findMany as jest.Mock).mockResolvedValue([
      { ...participant, isPublic: true, cars: [{
        id: 'car-public', brand: 'Lada', model: 'Vesta', registrationNumber: 'А001АА77',
      }] },
    ]);
    (prisma.participantLegacyEmail.findUnique as jest.Mock).mockResolvedValue(null);
    const result = await service.findHistoricalProfileCandidates(
      { sub: 'other', email: 'other@example.com' }, 'Иван',
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].canSelfLink).toBe(false);
    expect(result.candidates[0].city).toBeNull();
    expect(result.candidates[0].team).toBeNull();
    expect(result.candidates[0].cars[0]).not.toHaveProperty('registrationNumber');
    expect(prisma.participant.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        cars: expect.objectContaining({
          where: { isActive: true, isPublic: true },
          select: expect.not.objectContaining({ registrationNumber: true }),
        }),
      }),
    }));
  });

  it('allows a private historical candidate only to its verified legacy-email owner', async () => {
    const { service, prisma, participant } = makeService();
    (prisma.participant.findMany as jest.Mock).mockResolvedValue([
      { ...participant, isPublic: false },
    ]);
    const result = await service.findHistoricalProfileCandidates(
      { sub: 'verified-owner', email: 'ivan@example.com' }, 'Иван',
    );
    expect(result.found).toBe(1);
    expect(result.candidates[0].canSelfLink).toBe(true);
  });

});
