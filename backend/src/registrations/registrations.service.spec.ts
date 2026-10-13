import { jest } from '@jest/globals';

import { RegistrationsService } from './registrations.service';

describe('RegistrationsService', () => {
  const prisma: any = {
    $transaction: jest.fn(),
  };

  let service: RegistrationsService;

  const participantRequest: any = {
    user: {
      id: 'user-1',
      role: 'PARTICIPANT',
      participantId: 'participant-1',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RegistrationsService(prisma);
  });

  function setupTransaction(tx: any) {
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );
  }

  function baseTx(overrides: any = {}) {
    return {
      $executeRaw: jest.fn(),
      stage: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'stage-1',
            isDeleted: false,
            status: 'PUBLISHED',
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
      season: {
        findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
      },
      participant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'participant-1' }),
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
          {
            classId: 'class-1',
            class: { directionId: 'direction-1', name: 'SPL 1x2' },
          },
        ]),
      },
      registrationClass: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      registrationNumber: {
        findFirst: jest.fn().mockResolvedValue(null),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([
          { id: 'number-1', number: 1, isPrimary: true },
        ]),
      },
      registration: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'registration-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'registration-1' }),
      },
      carConfigurationVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'configuration-version-1',
          configurationId: 'configuration-1',
          version: 3,
          vibrationIsolation: 'STP',
          additionalDescription: 'Test',
          configuration: {
            id: 'configuration-1',
            name: 'Основная',
          },
          headUnits: [],
          audioComponents: [],
          amplifiers: [],
          batteries: [],
          generators: [],
        }),
      },
      ...overrides,
    };
  }

  const requestBody = {
    stageId: 'stage-1',
    participantId: 'participant-1',
    carId: 'car-1',
    classIds: ['class-1'],
    configurationVersionId: 'configuration-version-1',
  };

  it('requires an explicit configuration version', async () => {
    await expect(
      service.create(participantRequest, {
        ...requestBody,
        configurationVersionId: '',
      }),
    ).rejects.toThrow(
      'Для регистрации необходимо выбрать версию конфигурации автомобиля',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a configuration version belonging to another car', async () => {
    const tx = baseTx({
      carConfigurationVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    });
    setupTransaction(tx);

    await expect(
      service.create(participantRequest, requestBody),
    ).rejects.toThrow(
      'Выбранная версия конфигурации не принадлежит этому автомобилю',
    );
  });

  it('creates a registration with an immutable configuration snapshot', async () => {
    const tx = baseTx();
    setupTransaction(tx);

    await expect(
      service.create(participantRequest, requestBody),
    ).resolves.toEqual({ id: 'registration-1' });

    expect(tx.registration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stageId: 'stage-1',
          participantId: 'participant-1',
          carId: 'car-1',
          configurationVersionId: 'configuration-version-1',
          participantNumber: 1,
          configurationSnapshot: expect.objectContaining({
            configurationId: 'configuration-1',
            configurationName: 'Основная',
            version: 3,
          }),
        }),
      }),
    );
  });

  it('rejects a second registration of the same car on the stage', async () => {
    const tx = baseTx({
      registration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'existing',
          status: 'ACTIVE',
        }),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    });
    setupTransaction(tx);

    await expect(
      service.create(participantRequest, requestBody),
    ).rejects.toThrow(
      'Этот автомобиль уже зарегистрирован на этапе',
    );

    expect(tx.registration.create).not.toHaveBeenCalled();
  });

  it('allows the same participant to register a different car on the same stage', async () => {
    const tx = baseTx({
      car: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'car-2',
          participantId: 'participant-1',
          isActive: true,
        }),
      },
      registration: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'registration-car-2' }),
      },
    });
    setupTransaction(tx);

    await expect(
      service.create(participantRequest, {
        ...requestBody,
        carId: 'car-2',
      }),
    ).resolves.toEqual({ id: 'registration-car-2' });

    expect(tx.registration.findUnique).toHaveBeenCalledWith({
      where: { stageId_carId: { stageId: 'stage-1', carId: 'car-2' } },
    });
    expect(tx.registration.create).toHaveBeenCalled();
  });

  it('allows more than five selected classes when multiple BassRace classes are included', async () => {
    const bassRaceClasses = [
      { classId: 'br-129', name: 'BassRace 129.9' },
      { classId: 'br-139', name: 'BassRace 139.9' },
      { classId: 'br-149', name: 'BassRace 149.9' },
      { classId: 'br-159', name: 'BassRace 159.9' },
      { classId: 'br-169', name: 'BassRace 169.9' },
      { classId: 'br-179', name: 'BassRace 179.9' },
    ];
    const tx = baseTx({
      stageClass: {
        findMany: jest.fn().mockResolvedValue([
          { classId: 'spl-1', participantLimit: null, class: { directionId: 'spl', name: 'SPL 1x2', direction: { name: 'SPL' } } },
          ...bassRaceClasses.map(({ classId, name }) => ({
            classId,
            participantLimit: null,
            class: { directionId: 'br', name, direction: { name: 'BassRace' } },
          })),
        ]),
      },
      registrationNumber: {
        findFirst: jest.fn().mockResolvedValue({ number: 10 }),
        createMany: jest.fn().mockResolvedValue({ count: 6 }),
        findMany: jest.fn().mockResolvedValue(
          bassRaceClasses.map((_, index) => ({
            id: `number-${11 + index}`,
            number: 11 + index,
            isPrimary: index === 0,
          })),
        ),
      },
    });
    setupTransaction(tx);

    await service.create(participantRequest, {
      ...requestBody,
      classIds: ['spl-1', ...bassRaceClasses.map(({ classId }) => classId)],
    });

    expect(tx.registrationNumber.createMany).toHaveBeenCalledWith({
      data: bassRaceClasses.map((_, index) =>
        expect.objectContaining({
          number: 11 + index,
          isPrimary: index === 0,
          registrationId: 'registration-1',
        }),
      ),
    });
    expect(tx.registrationClass.createMany).toHaveBeenCalledWith({
      data: [
        { registrationId: 'registration-1', classId: 'spl-1', numberId: 'number-11' },
        ...bassRaceClasses.map(({ classId }, index) => ({
          registrationId: 'registration-1',
          classId,
          numberId: `number-${11 + index}`,
        })),
      ],
    });
  });

  it('rejects two classes from the same direction', async () => {
    const tx = baseTx({
      stageClass: {
        findMany: jest.fn().mockResolvedValue([
          {
            classId: 'class-1',
            class: { directionId: 'direction-1', name: 'SPL 1x2' },
          },
          {
            classId: 'class-2',
            class: { directionId: 'direction-1', name: 'SPL 1x2' },
          },
        ]),
      },
    });
    setupTransaction(tx);

    await expect(
      service.create(participantRequest, {
        ...requestBody,
        classIds: ['class-1', 'class-2'],
      }),
    ).rejects.toThrow(
      'В одной регистрации нельзя выбрать несколько классов одного направления',
    );
  });
});
