import { jest } from '@jest/globals';

import { RegistrationsService } from './registrations.service';

describe('RegistrationsService', () => {
  const prisma: any = {
    $transaction: jest.fn(),
    siteSettings: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
  };

  let service: RegistrationsService;

  const participantRequest: any = {
    user: {
      id: 'user-1',
      sub: 'user-1',
      role: 'PARTICIPANT',
      participantId: 'participant-1',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.siteSettings.findUnique.mockResolvedValue({ legal: { legalApproved: true, legalVersion: '1', ipName: 'USD', privacyText: 'policy', consentText: 'consent', termsText: 'terms' }, contacts: { email: 'legal@example.com' }, footer: {}, registration: { rulesDocument: { published: { id: 'rules-v1', blocks: [{ type: 'paragraph', text: 'Общий регламент USD' }] } } } });
    prisma.user.findUnique.mockResolvedValue({ privacyConsentAt: new Date(), privacyConsentVersion: 'privacy-v1', termsAcceptedAt: new Date(), termsVersion: 'terms-v1' });
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
            rulesSnapshot: { revisionId: 'rules-v1' },
            updatedAt: new Date('2026-10-01T00:00:00Z'),
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
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      registrationNumber: {
        findFirst: jest.fn().mockResolvedValue(null),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn()
          .mockResolvedValueOnce([])
          .mockResolvedValue([{ id: 'number-1', number: 1, isPrimary: true }]),
      },
      participantStageInspection: { findUnique: jest.fn().mockResolvedValue(null) },
      inspection: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      registration: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'registration-1' }),
        update: jest.fn().mockResolvedValue({ id: 'registration-1' }),
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
    rulesAccepted: true,
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

  it('rejects participant registration when no general regulation is currently published', async () => {
    prisma.siteSettings.findUnique.mockResolvedValueOnce({ legal: { legalApproved: true, legalVersion: '1', ipName: 'USD', privacyText: 'policy', consentText: 'consent', termsText: 'terms' }, contacts: { email: 'legal@example.com' }, footer: {}, registration: { rulesDocument: { published: null } } });

    await expect(service.create(participantRequest, requestBody)).rejects.toThrow('действующий общий регламент соревнований');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    { className: 'Limited 2.0', directionName: 'SPL', audioComponents: [], message: 'Для направлений SPL, BassRace и Hurrican необходимо добавить сабвуфер' },
    { className: 'BassRace 129.9', directionName: 'BassRace', audioComponents: [], message: 'Для направлений SPL, BassRace и Hurrican необходимо добавить сабвуфер' },
    { className: 'Storm Wall', directionName: 'Hurrican', audioComponents: [], message: 'Для направлений SPL, BassRace и Hurrican необходимо добавить сабвуфер' },
    { className: 'SPL BassRace', directionName: 'SPL', audioComponents: [], message: 'Для направлений SPL, BassRace и Hurrican необходимо добавить сабвуфер' },
    { className: 'Storm Wall', directionName: 'Storm Wall', audioComponents: [], message: 'Для направлений SPL, BassRace и Hurrican необходимо добавить сабвуфер' },
    { className: 'BFSPL', directionName: 'BFSPL', audioComponents: [], message: 'Для участия в BFSPL необходимо заполнить фронтальную акустику' },
    { className: 'BFSPL Gate 1-6', directionName: 'SPL', audioComponents: [], message: 'Для участия в BFSPL необходимо заполнить фронтальную акустику' },
    { className: 'BDW', directionName: 'BDWSPL', audioComponents: [], message: 'Для участия в BDW необходимо заполнить тыловую акустику' },
    { className: 'BDW SPL', directionName: 'SPL', audioComponents: [], message: 'Для участия в BDW необходимо заполнить тыловую акустику' },
  ])('rejects $className when the required equipment is missing', async ({ className, directionName, audioComponents, message }) => {
    const tx = baseTx({
      stageClass: {
        findMany: jest.fn().mockResolvedValue([{
          classId: 'class-1',
          class: { directionId: 'direction-1', name: className, code: className, direction: { name: directionName } },
        }]),
      },
      carConfigurationVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'configuration-version-1',
          configurationId: 'configuration-1',
          version: 3,
          vibrationIsolation: 'STP',
          additionalDescription: 'Test',
          configuration: { id: 'configuration-1', name: 'Основная' },
          headUnits: [],
          audioComponents,
          amplifiers: [],
          batteries: [],
          generators: [],
        }),
      },
    });
    setupTransaction(tx);

    await expect(service.create(participantRequest, requestBody)).rejects.toThrow(message);
    expect(tx.registration.create).not.toHaveBeenCalled();
  });

  const validSub = { brand: 'Deaf Bonce', model: 'DB-3012R', direction: 'SUB', type: 'SUBWOOFER', quantity: 1 };
  const validFront = { brand: 'Deaf Bonce', model: 'AP-M61SE', direction: 'FRONT', type: 'MIDBASS', quantity: 2 };
  const validRear = { brand: 'Deaf Bonce', model: 'AP-M61SE', direction: 'REAR', type: 'MIDBASS', quantity: 2 };

  const equipmentTransaction = (className: string, directionName: string, audioComponents: any[]) =>
    baseTx({
      stageClass: {
        findMany: jest.fn().mockResolvedValue([{
          classId: 'class-1',
          class: { directionId: 'direction-1', name: className, code: className, direction: { name: directionName } },
        }]),
      },
      carConfigurationVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'configuration-version-1',
          configurationId: 'configuration-1',
          version: 3,
          vibrationIsolation: 'STP',
          additionalDescription: 'Test',
          configuration: { id: 'configuration-1', name: 'Основная' },
          headUnits: [],
          audioComponents,
          amplifiers: [],
          batteries: [],
          generators: [],
        }),
      },
    });

  it.each([
    { caseName: 'нулевое количество сабвуферов', className: 'Limited 2.0', directionName: 'SPL', audioComponents: [{ ...validSub, quantity: 0 }], message: 'сабвуфер' },
    { caseName: 'отрицательное количество сабвуферов', className: 'BassRace 129.9', directionName: 'BassRace', audioComponents: [{ ...validSub, quantity: -1 }], message: 'сабвуфер' },
    { caseName: 'дробное количество сабвуферов', className: 'Limited 2.0', directionName: 'SPL', audioComponents: [{ ...validSub, quantity: 0.5 }], message: 'сабвуфер' },
    { caseName: 'пустая модель сабвуфера', className: 'Storm Wall', directionName: 'Storm Wall', audioComponents: [{ ...validSub, model: '  ' }], message: 'сабвуфер' },
    { caseName: 'пустой бренд фронта', className: 'Gate 1-6', directionName: 'BFSPL', audioComponents: [{ ...validFront, brand: '' }], message: 'фронтальную акустику' },
    { caseName: 'нулевое количество тыла', className: 'BDW', directionName: 'BDWSPL', audioComponents: [{ ...validRear, quantity: 0 }], message: 'тыловую акустику' },
    { caseName: 'чужое направление', className: 'BDW', directionName: 'BDWSPL', audioComponents: [validFront], message: 'тыловую акустику' },
  ])('rejects $caseName instead of allowing an empty equipment registration', async ({ className, directionName, audioComponents, message }) => {
    const tx = equipmentTransaction(className, directionName, audioComponents);
    setupTransaction(tx);
    await expect(service.create(participantRequest, requestBody)).rejects.toThrow(message);
    expect(tx.registration.create).not.toHaveBeenCalled();
  });

  it.each([
    { className: 'Limited 2.0', directionName: 'SPL', component: validSub },
    { className: 'Gate 1-6', directionName: 'BFSPL', component: validFront },
    { className: 'BFSPL Gate 1-6', directionName: 'SPL', component: validFront },
    { className: 'BDW', directionName: 'BDWSPL', component: validRear },
    { className: 'BDW SPL', directionName: 'SPL', component: validRear },
  ])('accepts valid positive-quantity equipment for $className', async ({ className, directionName, component }) => {
    const tx = equipmentTransaction(className, directionName, [component]);
    setupTransaction(tx);
    await expect(service.create(participantRequest, requestBody)).resolves.toEqual({ id: 'registration-1' });
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

  it('rejects a second active registration of the same car on the stage', async () => {
    const tx = baseTx({
      registration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'existing',
          status: 'ACTIVE',
        }),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
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
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'registration-car-2' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'registration-car-2' }),
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

  it('releases cancelled sticker numbers and assigns the next available number on re-registration', async () => {
    const tx = baseTx({
      registration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'registration-old',
          status: 'CANCELLED',
          participantNumber: 7,
        }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: 'registration-old' }),
        create: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'registration-old' }),
      },
      registrationNumber: {
        findFirst: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn()
          .mockResolvedValueOnce([{ number: 1 }, { number: 2 }])
          .mockResolvedValueOnce([{ id: 'number-3', number: 3, isPrimary: true }]),
      },
      registrationClass: {
        count: jest.fn().mockResolvedValue(0),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      inspection: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });
    setupTransaction(tx);

    await expect(service.create(participantRequest, requestBody)).resolves.toEqual({ id: 'registration-old' });
    expect(tx.registration.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'registration-old' },
      data: expect.objectContaining({ status: 'ACTIVE', participantNumber: 3 }),
    }));
    expect(tx.registration.create).not.toHaveBeenCalled();
    expect(tx.registrationNumber.deleteMany).toHaveBeenCalledWith({ where: { registrationId: 'registration-old' } });
    expect(tx.registrationNumber.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ number: 3, isPrimary: true, registrationId: 'registration-old' })],
    });
    expect(tx.registrationClass.deleteMany).toHaveBeenCalledWith({ where: { registrationId: 'registration-old' } });
  });

  it('allows up to five classes when multiple BassRace classes are included', async () => {
    const bassRaceClasses = [
      { classId: 'br-129', name: 'BassRace 129.9' },
      { classId: 'br-139', name: 'BassRace 139.9' },
      { classId: 'br-149', name: 'BassRace 149.9' },
      { classId: 'br-159', name: 'BassRace 159.9' },
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
      carConfigurationVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'configuration-version-1',
          configurationId: 'configuration-1',
          version: 3,
          vibrationIsolation: 'STP',
          additionalDescription: 'Test',
          configuration: { id: 'configuration-1', name: 'Основная' },
          headUnits: [],
          audioComponents: [{ id: 'sub-1', brand: 'Test', model: 'Subwoofer', direction: 'SUB', type: 'SUBWOOFER', quantity: 1 }],
          amplifiers: [],
          batteries: [],
          generators: [],
        }),
      },
      registrationNumber: {
        findFirst: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 4 }),
        findMany: jest.fn()
          .mockResolvedValueOnce(Array.from({ length: 10 }, (_, index) => ({ number: index + 1 })))
          .mockResolvedValue(bassRaceClasses.map((_, index) => ({
            id: `number-${11 + index}`,
            number: 11 + index,
            isPrimary: index === 0,
          }))),
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

  it('rejects six classes before acquiring any DB transaction, including BassRace', async () => {
    await expect(service.create(participantRequest, {
      ...requestBody, classIds: ['spl-1','br-1','br-2','br-3','br-4','br-5'],
    })).rejects.toThrow('более 5 классов');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not let a client submit an old internal gate draft as a complete configuration', async () => {
    const tx = baseTx({
      carConfigurationVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'old-gate-version', version: 1, configurationId: 'old-gate-config',
          additionalDescription: 'USD_ON_SITE_DRAFT_PENDING',
          configuration: { id: 'old-gate-config', name: 'На въезде' },
          headUnits: [], audioComponents: [], amplifiers: [], batteries: [], generators: [],
        }),
      },
    });
    setupTransaction(tx);
    await expect(service.create(
      { user: { sub: 'staff-1', role: 'ADMIN', customRoleId: null } } as any,
      { ...requestBody, configurationVersionId: 'old-gate-version', source: 'ON_SITE',
        privacyConsent: true, termsAccepted: true },
    )).rejects.toThrow('Служебный черновик конфигурации нельзя использовать');
    expect(tx.registration.create).not.toHaveBeenCalled();
  });

  it('creates an explicitly pending hardware snapshot for staff ON_SITE without a configuration', async () => {
    const tx = baseTx({
      carConfiguration: {
        create: jest.fn().mockResolvedValue({ versions: [{ id: 'draft-version-1' }] }),
      },
      carConfigurationVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'draft-version-1',
          configurationId: 'configuration-draft',
          version: 1,
          vibrationIsolation: null,
          additionalDescription: 'USD_ON_SITE_DRAFT_PENDING',
          configuration: { id: 'configuration-draft', name: 'Запись на месте' },
          headUnits: [], audioComponents: [], amplifiers: [], batteries: [], generators: [],
        }),
      },
    });
    setupTransaction(tx);
    const registration = await service.create(
      { user: { sub: 'staff-1', role: 'ADMIN', customRoleId: null } } as any,
      {
        ...requestBody,
        configurationVersionId: undefined,
        source: 'ON_SITE',
        privacyConsent: true,
        termsAccepted: true,
      },
    );
    expect(registration).toEqual({ id: 'registration-1' });
    expect(tx.carConfiguration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        carId: 'car-1',
        versions: { create: { version: 1, additionalDescription: 'USD_ON_SITE_DRAFT_PENDING' } },
      }),
    }));
    expect(tx.carConfigurationVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'draft-version-1' }),
    }));
    expect(tx.registration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        source: 'ON_SITE', configurationVersionId: 'draft-version-1',
        configurationSnapshot: expect.objectContaining({
          configurationPending: true,
          audioComponents: [],
        }),
      }),
    }));
  });

  it('creates a new non-public profile, car and audit atomically for the on-site operator', async () => {
    const tx: any = {
      $executeRaw: jest.fn(),
      participant: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'new-person' }),
      },
      car: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'new-car' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
    };
    setupTransaction(tx);
    const result = await service.createOnSiteProfile(
      { user: { sub: 'operator', role: 'ADMIN' } } as any,
      {
        lastName: 'Иванов', firstName: 'Иван', middleName: '',
        brand: 'ВАЗ', model: '2107', registrationCountry: 'RU',
        registrationNumber: 'A001YP01', privacyConsent: true, termsAccepted: true,
      },
    );
    expect(result).toEqual({ participantId: 'new-person', carId: 'new-car' });
    expect(tx.car.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        participantId: 'new-person', registrationNumber: 'А001УР01', isPublic: false,
      }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('rejects unconsented gate intake without creating any records', async () => {
    await expect(service.createOnSiteProfile(
      { user: { sub: 'operator', role: 'ADMIN' } } as any,
      {
        lastName: 'Иванов', firstName: 'Иван', brand: 'ВАЗ', model: '2107',
        registrationCountry: 'RU', registrationNumber: 'А001УР01',
        privacyConsent: false, termsAccepted: true,
      },
    )).rejects.toThrow('необходимо согласие участника');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a duplicate historical name without creating a second profile', async () => {
    const tx: any = {
      $executeRaw: jest.fn(),
      participant: {
        findFirst: jest.fn().mockResolvedValue({ id: 'historical-person' }),
        create: jest.fn(),
      },
    };
    setupTransaction(tx);
    await expect(service.createOnSiteProfile(
      { user: { sub: 'operator', role: 'ADMIN' } } as any,
      {
        lastName: 'Иванов', firstName: 'Иван', brand: 'ВАЗ', model: '2107',
        registrationCountry: 'RU', registrationNumber: 'А001УР01',
        privacyConsent: true, termsAccepted: true,
      },
    )).rejects.toThrow('Профиль с таким ФИО уже существует');
    expect(tx.participant.create).not.toHaveBeenCalled();
  });

  it('refuses a non-staff profile creation even if a request reaches the service', async () => {
    await expect(service.createOnSiteProfile(
      { user: { sub: 'participant', role: 'PARTICIPANT' } } as any,
      {
        lastName: 'Иванов', firstName: 'Иван', brand: 'ВАЗ', model: '2107',
        registrationCountry: 'RU', registrationNumber: 'А001УР01',
        privacyConsent: true, termsAccepted: true,
      },
    )).rejects.toThrow('Только сотрудник');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  const confirmedConfigId = '00000000-0000-4000-8000-000000000224';
  const onSiteAdmin: any = { user: { sub: 'operator-1', role: 'ADMIN' } };
  const pendingRegistration = {
    id: 'registration-1', participantId: 'participant-1', carId: 'car-1',
    configurationVersionId: 'pending-version', source: 'ON_SITE', status: 'ACTIVE',
    configurationSnapshot: { configurationPending: true },
    stage: { isDeleted: false, status: 'PUBLISHED' },
    classes: [{ class: { name: 'Limited 2.0', code: 'limited', direction: { name: 'SPL' } } }],
    results: [],
  };

  function confirmTx(overrides: any = {}) {
    return {
      $executeRaw: jest.fn(),
      registration: {
        findUnique: jest.fn().mockResolvedValue(pendingRegistration),
        update: jest.fn().mockResolvedValue({ id: 'registration-1' }),
      },
      carConfigurationVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: confirmedConfigId, configurationId: 'config-1',
          version: 2, additionalDescription: 'Установленная система',
          vibrationIsolation: null,
          configuration: { id: 'config-1', name: 'Текущая' },
          headUnits: [], amplifiers: [], generators: [], batteries: [],
          audioComponents: [{ direction: 'SUB', type: 'SUBWOOFER', brand: 'USD', model: 'Sub', quantity: 1 }],
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'log-1' }) },
      ...overrides,
    };
  }

  it('confirms a real hardware snapshot before results without changing stage, class or number', async () => {
    const tx = confirmTx();
    setupTransaction(tx);
    const result = await service.confirmOnSiteConfiguration(onSiteAdmin, 'registration-1', confirmedConfigId);
    expect(result).toEqual({
      id: 'registration-1', configurationVersionId: confirmedConfigId, configurationPending: false,
    });
    expect(tx.carConfigurationVersion.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: confirmedConfigId, configuration: { carId: 'car-1', isActive: true } },
    }));
    expect(tx.registration.update).toHaveBeenCalledWith({
      where: { id: 'registration-1' },
      data: expect.objectContaining({
        configurationSnapshot: expect.objectContaining({
          configurationPending: true,
          postStageCompletion: expect.objectContaining({
            versionId: confirmedConfigId, documentedByUserId: 'operator-1',
            audioComponents: [expect.objectContaining({ type: 'SUBWOOFER' })],
          }),
        }),
      }),
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ON_SITE_CONFIGURATION_CONFIRMED', entityId: 'registration-1' }),
    }));
  });

  it('allows post-stage completion after judging and preserves the event-day snapshot', async () => {
    const originalSnapshot = { configurationPending: true, additionalDescription: 'USD_ON_SITE_DRAFT_PENDING', audioComponents: [] };
    const tx = confirmTx({
      registration: {
        findUnique: jest.fn().mockResolvedValue({
          ...pendingRegistration, stage: { status: 'COMPLETED', isDeleted: false },
          configurationSnapshot: originalSnapshot, results: [{ id: 'result-1' }],
        }),
        update: jest.fn(),
      },
    });
    setupTransaction(tx);
    await expect(service.confirmOnSiteConfiguration(onSiteAdmin, 'registration-1', confirmedConfigId))
      .resolves.toMatchObject({ configurationPending: false });
    const written = tx.registration.update.mock.calls[0][0].data;
    expect(written).not.toHaveProperty('configurationVersionId');
    expect(written.configurationSnapshot).toMatchObject({
      ...originalSnapshot, postStageCompletion: { versionId: confirmedConfigId },
    });
    expect(originalSnapshot).not.toHaveProperty('postStageCompletion');
  });

  it('rejects a second confirmation and a version from another car', async () => {
    const tx = confirmTx({
      registration: {
        findUnique: jest.fn().mockResolvedValue({
          ...pendingRegistration, configurationSnapshot: { configurationPending: false },
        }),
        update: jest.fn(),
      },
    });
    setupTransaction(tx);
    await expect(service.confirmOnSiteConfiguration(onSiteAdmin, 'registration-1', confirmedConfigId))
      .rejects.toThrow('Подтверждение доступно только');
    expect(tx.registration.update).not.toHaveBeenCalled();
    const txWrongCar = confirmTx({
      carConfigurationVersion: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    setupTransaction(txWrongCar);
    await expect(service.confirmOnSiteConfiguration(onSiteAdmin, 'registration-1', confirmedConfigId))
      .rejects.toThrow('Выберите заполненную конфигурацию этого автомобиля');
    expect(txWrongCar.registration.update).not.toHaveBeenCalled();
  });

  it('does not allow an unrelated participant to change another entrant configuration', async () => {
    const tx = confirmTx();
    setupTransaction(tx);
    await expect(service.confirmOnSiteConfiguration(
      { user: { sub: 'unrelated-user', role: 'PARTICIPANT', participantId: 'elsewhere' } } as any,
      'registration-1', confirmedConfigId,
    )).rejects.toThrow('Недостаточно прав');
    expect(tx.registration.update).not.toHaveBeenCalled();
  });

  it('enforces audio direction requirements before confirming a draft', async () => {
    const tx = confirmTx({
      carConfigurationVersion: {
        findFirst: jest.fn().mockResolvedValue({
          id: confirmedConfigId, configurationId: 'config-1', version: 2,
          configuration: { name: 'Пустая' }, additionalDescription: null,
          headUnits: [], audioComponents: [], amplifiers: [], batteries: [], generators: [],
        }),
      },
    });
    setupTransaction(tx);
    await expect(service.confirmOnSiteConfiguration(onSiteAdmin, 'registration-1', confirmedConfigId))
      .rejects.toThrow('необходимо добавить сабвуфер');
    expect(tx.registration.update).not.toHaveBeenCalled();
  });


  it('adds a new car to an existing historical profile without creating another participant', async () => {
    const tx: any = {
      $executeRaw: jest.fn(),
      participant: { findUnique: jest.fn().mockResolvedValue({ id: 'existing-person' }), create: jest.fn() },
      car: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'new-car' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
    };
    setupTransaction(tx);
    const result = await service.createOnSiteCar(
      { user: { sub: 'operator', role: 'ADMIN' } } as any,
      {
        participantId: 'existing-person', brand: 'ВАЗ', model: '2107',
        registrationCountry: 'RU', registrationNumber: 'A001YP01',
        privacyConsent: true, termsAccepted: true,
      },
    );
    expect(result).toEqual({ participantId: 'existing-person', carId: 'new-car' });
    expect(tx.participant.create).not.toHaveBeenCalled();
    expect(tx.car.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        participantId: 'existing-person', registrationNumber: 'А001УР01', isPublic: false,
      }),
    }));
    expect(tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: 'ON_SITE_CAR_CREATED' }),
    }));
  });

  it('refuses duplicate registration plates even when the old row used Latin lookalikes', async () => {
    const tx: any = {
      $executeRaw: jest.fn(),
      participant: { findUnique: jest.fn().mockResolvedValue({ id: 'existing-person' }) },
      car: {
        findMany: jest.fn().mockResolvedValue([{ id: 'old-car', registrationNumber: 'A001YP01' }]),
        create: jest.fn(),
      },
    };
    setupTransaction(tx);
    await expect(service.createOnSiteCar(
      { user: { sub: 'operator', role: 'ADMIN' } } as any,
      {
        participantId: 'existing-person', brand: 'ВАЗ', model: '2107',
        registrationCountry: 'RU', registrationNumber: 'А001УР01',
        privacyConsent: true, termsAccepted: true,
      },
    )).rejects.toThrow('Автомобиль с таким госномером уже существует');
    expect(tx.car.create).not.toHaveBeenCalled();
  });

  it('does not store an additional vehicle when its owner is unknown or consents are missing', async () => {
    await expect(service.createOnSiteCar(
      { user: { sub: 'operator', role: 'ADMIN' } } as any,
      {
        participantId: 'existing-person', brand: 'ВАЗ', model: '2107',
        registrationCountry: 'RU', registrationNumber: 'А001УР01',
        privacyConsent: false, termsAccepted: true,
      },
    )).rejects.toThrow('подтвердите согласия');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const tx: any = {
      $executeRaw: jest.fn(),
      participant: { findUnique: jest.fn().mockResolvedValue(null) },
      car: { create: jest.fn() },
    };
    setupTransaction(tx);
    await expect(service.createOnSiteCar(
      { user: { sub: 'operator', role: 'ADMIN' } } as any,
      {
        participantId: 'missing-person', brand: 'ВАЗ', model: '2107',
        registrationCountry: 'RU', registrationNumber: 'А001УР01',
        privacyConsent: true, termsAccepted: true,
      },
    )).rejects.toThrow('Участник не найден');
    expect(tx.car.create).not.toHaveBeenCalled();
  });


  it('denies a staff identity intake when its custom role has no registrations create grant', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({
      isActive: true, emailVerifiedAt: new Date(), customRoleId: 'read-only-role',
    });
    prisma.role = { findUnique: jest.fn().mockResolvedValue({ permissions: {} }) };
    await expect(service.createOnSiteProfile(
      { user: { sub: 'staff-id', role: 'PARTICIPANT', customRoleId: 'read-only-role' } } as any,
      {
        lastName: 'Иванов', firstName: 'Иван', brand: 'ВАЗ', model: '2107',
        registrationCountry: 'RU', registrationNumber: 'А001УР01',
        privacyConsent: true, termsAccepted: true,
      },
    )).rejects.toThrow('Недостаточно прав на регистрацию на месте');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('blocks the following stage while another finished stage still has an unfinished draft', async () => {
    const tx = baseTx({
      registration: {
        findMany: jest.fn().mockResolvedValue([{ id: 'old-registration', configurationSnapshot: { configurationPending: true } }]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
    });
    setupTransaction(tx);
    await expect(service.create(participantRequest, requestBody))
      .rejects.toMatchObject({ response: expect.objectContaining({ code: 'PREVIOUS_CONFIGURATION_REQUIRED', registrationId: 'old-registration' }) });
    expect(tx.registration.create).not.toHaveBeenCalled();
    expect(tx.registration.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ stageId: { not: 'stage-1' }, status: 'ACTIVE' }),
    }));
  });

  it('allows the next stage after documenting equipment without rewriting the original snapshot', async () => {
    const tx = baseTx({
      registration: {
        findMany: jest.fn().mockResolvedValue([{ id: 'old-registration', configurationSnapshot: {
          configurationPending: true, postStageCompletion: { versionId: confirmedConfigId },
        } }]),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'registration-1' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'registration-1' }),
      },
    });
    setupTransaction(tx);
    await expect(service.create(participantRequest, requestBody)).resolves.toMatchObject({ id: 'registration-1' });
  });

});
