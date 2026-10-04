import { jest } from '@jest/globals';

import { RegistrationsService } from './registrations.service';

describe('RegistrationsService — car/configuration rules', () => {
  const prisma: any = {
    $transaction: jest.fn(),
  };

  let service: RegistrationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RegistrationsService(prisma);
  });

  function setupTransaction(tx: any) {
    prisma.$transaction.mockImplementation(async (callback: any) => callback(tx));
  }

  it('creates a registration with the current car configuration version snapshot', async () => {
    const created = { id: 'registration-1' };

    const tx: any = {
      $executeRaw: jest.fn(),
      stage: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({
            id: 'stage-1',
            isDeleted: false,
            registrationOpen: true,
            registrationStartsAt: null,
            registrationEndsAt: null,
            seasonId: 'season-1',
          })
          .mockResolvedValueOnce({
            id: 'stage-1',
            seasonId: 'season-1',
          }),
      },
      participant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'participant-1' }),
      },
      disqualification: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      car: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'car-1',
          participantId: 'participant-1',
          isActive: true,
        }),
      },
      stageClass: {
        findMany: jest.fn().mockResolvedValue([
          { classId: 'class-1', class: { directionId: 'direction-1' } },
          { classId: 'class-2', class: { directionId: 'direction-2' } },
        ]),
      },
      registration: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
      carConfiguration: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'configuration-1',
          currentVersion: 3,
        }),
      },
      carConfigurationVersion: {
        findUnique: jest.fn().mockResolvedValue({ id: 'configuration-version-3' }),
      },
    };

    setupTransaction(tx);

    await expect(
      service.create({
        stageId: 'stage-1',
        participantId: 'participant-1',
        carId: 'car-1',
        classIds: ['class-1', 'class-2'],
      }),
    ).resolves.toBe(created);

    expect(tx.registration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stageId: 'stage-1',
          participantId: 'participant-1',
          carId: 'car-1',
          configurationVersionId: 'configuration-version-3',
          participantNumber: 1,
        }),
      }),
    );
  });

  it('allows one participant to register two different cars on the same stage', async () => {
    const registrations = [{ id: 'registration-1' }, { id: 'registration-2' }];
    let createNumber = 0;

    const tx: any = {
      $executeRaw: jest.fn(),
      stage: {
        findUnique: jest.fn()
          .mockResolvedValue({ id: 'stage-1', isDeleted: false, registrationOpen: true, registrationStartsAt: null, registrationEndsAt: null, seasonId: 'season-1' }),
      },
      participant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'participant-1' }),
      },
      disqualification: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      car: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => ({
          id: where.id,
          participantId: 'participant-1',
          isActive: true,
        })),
      },
      stageClass: {
        findMany: jest.fn().mockResolvedValue([
          { classId: 'class-1', class: { directionId: 'direction-1' } },
        ]),
      },
      registration: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockImplementation(async () =>
          createNumber === 0 ? null : { participantNumber: 1 },
        ),
        create: jest.fn().mockImplementation(async () => registrations[createNumber++]),
      },
      carConfiguration: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      carConfigurationVersion: {
        findUnique: jest.fn(),
      },
    };

    setupTransaction(tx);

    await service.create({
      stageId: 'stage-1',
      participantId: 'participant-1',
      carId: 'car-1',
      classIds: ['class-1'],
    });

    await service.create({
      stageId: 'stage-1',
      participantId: 'participant-1',
      carId: 'car-2',
      classIds: ['class-1'],
    });

    expect(tx.registration.create).toHaveBeenCalledTimes(2);
    expect(tx.registration.create.mock.calls[0][0].data.participantNumber).toBe(1);
    expect(tx.registration.create.mock.calls[1][0].data.participantNumber).toBe(2);
  });

  it('reactivates the same cancelled registration and preserves its participant number', async () => {
    const existing = {
      id: 'registration-1',
      stageId: 'stage-1',
      participantId: 'participant-1',
      carId: 'car-1',
      participantNumber: 7,
      status: 'CANCELLED',
    };

    const tx: any = {
      $executeRaw: jest.fn(),
      stage: {
        findUnique: jest.fn()
          .mockResolvedValue({ id: 'stage-1', isDeleted: false, registrationOpen: true, registrationStartsAt: null, registrationEndsAt: null, seasonId: 'season-1' }),
      },
      participant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'participant-1' }),
      },
      disqualification: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      car: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'car-1',
          participantId: 'participant-1',
          isActive: true,
        }),
      },
      stageClass: {
        findMany: jest.fn().mockResolvedValue([
          { classId: 'class-1', class: { directionId: 'direction-1' } },
        ]),
      },
      registration: {
        findUnique: jest.fn().mockResolvedValue(existing),
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(existing),
      },
      registrationClass: {
        deleteMany: jest.fn(),
      },
    };

    setupTransaction(tx);

    await service.create({
      stageId: 'stage-1',
      participantId: 'participant-1',
      carId: 'car-1',
      classIds: ['class-1'],
    });

    expect(tx.registration.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'registration-1' },
        data: expect.objectContaining({
          participantId: 'participant-1',
          status: 'ACTIVE',
        }),
      }),
    );
    expect(tx.registration.update.mock.calls[0][0].data).not.toHaveProperty(
      'participantNumber',
    );
    expect(tx.registration.create).not.toHaveBeenCalled();
  });

  it('rejects selecting two classes from the same direction', async () => {
    const tx: any = {
      $executeRaw: jest.fn(),
      stage: {
        findUnique: jest.fn()
          .mockResolvedValue({ id: 'stage-1', isDeleted: false, registrationOpen: true, registrationStartsAt: null, registrationEndsAt: null, seasonId: 'season-1' }),
      },
      participant: {
        findUnique: jest.fn().mockResolvedValue({ id: 'participant-1' }),
      },
      disqualification: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      car: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'car-1',
          participantId: 'participant-1',
          isActive: true,
        }),
      },
      stageClass: {
        findMany: jest.fn().mockResolvedValue([
          { classId: 'class-1', class: { directionId: 'direction-1' } },
          { classId: 'class-2', class: { directionId: 'direction-1' } },
        ]),
      },
    };

    setupTransaction(tx);

    await expect(
      service.create({
        stageId: 'stage-1',
        participantId: 'participant-1',
        carId: 'car-1',
        classIds: ['class-1', 'class-2'],
      }),
    ).rejects.toThrow(
      'В одной регистрации нельзя выбрать несколько классов одного направления',
    );
  });
});
