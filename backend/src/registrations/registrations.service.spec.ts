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

  it('issues an opaque QR credential and stores only its hash', async () => {
    const { createHash } = await import('crypto');
    const tx: any = {
      registrationQrToken: { upsert: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    setupTransaction(tx);
    prisma.registration = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'registration-1',
        participantId: 'participant-1',
        participantNumber: 7,
        stageId: 'stage-1',
        status: 'ACTIVE',
        stage: { isDeleted: false, status: 'PUBLISHED' },
      }),
    };
    const request: any = { user: { sub: 'user-1', role: 'PARTICIPANT', participantId: 'participant-1' }, ip: '127.0.0.1' };

    const result = await service.issueQrToken('registration-1', request);

    expect(result.token).toHaveLength(43);
    expect(tx.registrationQrToken.upsert).toHaveBeenCalledWith({
      where: { registrationId: 'registration-1' },
      create: expect.objectContaining({
        registrationId: 'registration-1',
        tokenHash: createHash('sha256').update(result.token).digest('hex'),
      }),
      update: expect.objectContaining({
        tokenHash: createHash('sha256').update(result.token).digest('hex'),
        revokedAt: null,
      }),
    });
    expect(result).not.toHaveProperty('tokenHash');
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('does not let a participant issue a QR credential for another participant', async () => {
    prisma.registration = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'registration-2',
        participantId: 'someone-else',
        participantNumber: 2,
        stageId: 'stage-1',
        status: 'ACTIVE',
        stage: { isDeleted: false, status: 'PUBLISHED' },
      }),
    };

    await expect(service.issueQrToken('registration-2', participantRequest)).rejects.toThrow(
      'Нет доступа к этой регистрации',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects short or malformed QR credentials before database lookup', async () => {
    const request: any = { user: { sub: 'judge-1', role: 'JUDGE' } };
    await expect(service.resolveQrToken('too-short', request)).rejects.toThrow(
      'Некорректный QR-код',
    );
  });

  it('resolves a QR credential by its hash and records the scan audit', async () => {
    const { createHash } = await import('crypto');
    const token = 'a'.repeat(43);
    const registration = {
      id: 'registration-1',
      participantNumber: 7,
      stageId: 'stage-1',
      status: 'ACTIVE',
      stage: { id: 'stage-1', isDeleted: false, status: 'PUBLISHED', season: { id: 'season-1' } },
      inspection: null,
      participant: { id: 'participant-1', firstName: 'Test', lastName: 'Rider' },
    };
    prisma.registrationQrToken = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'qr-1',
        revokedAt: null,
        registration,
      }),
    };
    prisma.auditLog = { create: jest.fn().mockResolvedValue({}) };
    const request: any = { user: { sub: 'judge-1', role: 'JUDGE' }, ip: '127.0.0.1' };

    const result = await service.resolveQrToken(token, request);

    expect(prisma.registrationQrToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      include: { registration: { include: expect.any(Object) } },
    });
    expect(result.registration.id).toBe('registration-1');
    expect(result.inspectionStatus).toBe('PENDING');
    expect(result.alreadyInspected).toBe(false);
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

});
