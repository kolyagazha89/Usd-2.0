import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';

import { Prisma } from '../generated/prisma/client';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { PrismaService } from '../prisma/prisma.service';
import { ImportsService } from './imports.service';

type RegistrationRow = {
  id: string;
  participantId: string;
  participantNumber: number;
  status: 'ACTIVE' | 'CANCELLED';
};

type RegistrationClient = {
  create: (args: unknown) => Promise<RegistrationRow>;
  findUnique: (args: unknown) => Promise<RegistrationRow | null>;
  update: (args: unknown) => Promise<RegistrationRow>;
};

type TestableImportsService = ImportsService & {
  createImportRegistration: (
    tx: Prisma.TransactionClient,
    data: {
      stageId: string;
      participantId: string;
      carId: string;
      participantNumber: number;
    },
  ) => Promise<RegistrationRow>;
};

function p2002Error() {
  const error = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as Prisma.PrismaClientKnownRequestError;

  Object.assign(error, {
    code: 'P2002',
    meta: { target: ['Registration_stageId_carId_key'] },
    message: 'Unique constraint failed',
    clientVersion: '7.10.0',
  });

  return error;
}

function createService() {
  return new ImportsService(
    {} as PrismaService,
    new NameNormalizerService(),
  ) as TestableImportsService;
}

function createTransactionClient(
  registration: RegistrationRow | null,
) {
  const existing = registration;

  const client: RegistrationClient = {
    create: jest.fn(async () => {
      throw p2002Error();
    }),
    findUnique: jest.fn(async (args: unknown) => {
      const where = (args as { where?: Record<string, unknown> })?.where;
      // Preflight by number should not collide in this P2002 recovery test.
      // Recovery by stage+car must still return the existing registration.
      if (where?.stageId_participantNumber) return null;
      return existing;
    }),
    update: jest.fn(async ({ data }: { data: Partial<RegistrationRow> }) => ({
      ...(existing as RegistrationRow),
      ...data,
    })),
  };

  return {
    registration: client,
    registrationNumber: {
      findUnique: jest.fn(async () => null),
      create: jest.fn(async () => ({ id: 'registration-number-1' })),
    },
    carConfiguration: {
      findFirst: jest.fn(async () => ({
        id: 'legacy-config-1',
        carId: 'car-1',
        name: 'LEGACY_IMPORT',
        currentVersion: 1,
      })),
      create: jest.fn(async () => ({
        id: 'legacy-config-1',
        carId: 'car-1',
        name: 'LEGACY_IMPORT',
        currentVersion: 1,
      })),
    },
    carConfigurationVersion: {
      findFirst: jest.fn(async () => ({
        id: 'legacy-version-1',
        configurationId: 'legacy-config-1',
        version: 1,
        vibrationIsolation: null,
        additionalDescription: 'legacy',
      })),
      create: jest.fn(async () => ({
        id: 'legacy-version-1',
        configurationId: 'legacy-config-1',
        version: 1,
        vibrationIsolation: null,
        additionalDescription: 'legacy',
      })),
    },
  } as unknown as Prisma.TransactionClient;
}

const input = {
  stageId: 'stage-1',
  participantId: 'participant-1',
  carId: 'car-1',
  participantNumber: 10,
};

describe('ImportsService.createImportRegistration', () => {
  it('reuses an existing registration when stage, car, participant and number match', async () => {
    const existing: RegistrationRow = {
      id: 'registration-1',
      participantId: 'participant-1',
      participantNumber: 10,
      status: 'ACTIVE',
    };
    const tx = createTransactionClient(existing);

    const result = await createService().createImportRegistration(
      tx,
      input,
    );

    expect(result).toBe(existing);
    expect(tx.registration.update).not.toHaveBeenCalled();
  });

  it('reactivates a cancelled matching registration', async () => {
    const existing: RegistrationRow = {
      id: 'registration-1',
      participantId: 'participant-1',
      participantNumber: 10,
      status: 'CANCELLED',
    };
    const tx = createTransactionClient(existing);

    const result = await createService().createImportRegistration(
      tx,
      input,
    );

    expect(result).toMatchObject({
      id: 'registration-1',
      participantId: 'participant-1',
      participantNumber: 10,
      status: 'ACTIVE',
    });
    expect(tx.registration.update).toHaveBeenCalledWith({
      where: { id: 'registration-1' },
      data: expect.objectContaining({
        status: 'ACTIVE',
        source: 'IMPORT',
      }),
    });
  });

  it('rejects a car already registered to another participant', async () => {
    const existing: RegistrationRow = {
      id: 'registration-1',
      participantId: 'participant-2',
      participantNumber: 10,
      status: 'ACTIVE',
    };
    const tx = createTransactionClient(existing);

    await expect(
      createService().createImportRegistration(tx, input),
    ).rejects.toThrow(
      new BadRequestException(
        'Автомобиль уже зарегистрирован на этом этапе за другим участником',
      ),
    );
  });

  it('rejects a matching participant when the participant number differs', async () => {
    const existing: RegistrationRow = {
      id: 'registration-1',
      participantId: 'participant-1',
      participantNumber: 20,
      status: 'ACTIVE',
    };
    const tx = createTransactionClient(existing);

    await expect(
      createService().createImportRegistration(tx, input),
    ).rejects.toThrow(
      'Автомобиль уже зарегистрирован на этом этапе под номером 20; в импорте указан номер 10',
    );
  });

  it('rethrows a P2002 when the stage+car registration cannot be found', async () => {
    const tx = createTransactionClient(null);

    await expect(
      createService().createImportRegistration(tx, input),
    ).rejects.toMatchObject({
      code: 'P2002',
    });
  });

  it('rethrows non-P2002 database errors unchanged', async () => {
    const error = new Error('database unavailable');
    const tx = {
      carConfiguration: {
        findFirst: jest.fn(async () => ({
          id: 'legacy-config-1',
          carId: 'car-1',
          name: 'LEGACY_IMPORT',
          currentVersion: 1,
        })),
      },
      carConfigurationVersion: {
        findFirst: jest.fn(async () => ({
          id: 'legacy-version-1',
          configurationId: 'legacy-config-1',
          version: 1,
          vibrationIsolation: null,
          additionalDescription: 'legacy',
        })),
      },
      registration: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => {
          throw error;
        }),
      },
      registrationNumber: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async () => ({ id: 'registration-number-1' })),
      },
    } as unknown as Prisma.TransactionClient;

    await expect(
      createService().createImportRegistration(tx, input),
    ).rejects.toBe(error);
  });
});

describe('ImportsService historical vibration configuration', () => {
  it('sources historical vibration from the name-matched Registration sheet row, not Results', async () => {
    const service: any = new ImportsService({
      registration: { findUnique: jest.fn(async () => null) },
    } as unknown as PrismaService, new NameNormalizerService());
    const registrationIndex = service.buildRegistrationParticipantIndex([{
      'Фамилия и имя': 'Иванов Иван',
      'Номер участника': '010',
      'Виброизоляция': 'STP',
    }]);
    const row = {
      'ФИО': 'Иванов Иван',
      'Номер': '010',
      'Класс': 'Bass Race 129.9',
      'Результат': '128,8',
      'Виброизоляция': 'ДРУГОЙ БРЕНД В РЕЗУЛЬТАТАХ',
    };
    const stageClasses = [{ class: { id: 'bass-129', name: 'BassRace 129.9', unit: 'DB' } }];
    const preview = await service.previewResultRow(
      row, 1, new Map(), registrationIndex, stageClasses, 'stage-1', true,
    );
    expect(preview.status).toBe('READY');
    expect(preview.class.isBassRace).toBe(true);
    expect(preview.car.vibrationIsolation).toBe('STP');
    expect(preview.participantNumber).toBe(10);
  });

  it('uses an unspecified vibration when Registration is absent or matched only by a reused number', async () => {
    const service: any = new ImportsService({
      registration: { findUnique: jest.fn(async () => null) },
    } as unknown as PrismaService, new NameNormalizerService());
    const otherPersonRegistration = service.buildRegistrationParticipantIndex([{
      'Фамилия и имя': 'Иванов Иван', 'Номер участника': '010', 'Виброизоляция': 'STP',
    }]);
    const raw = { 'ФИО': 'Петров Пётр', 'Номер': '010', 'Класс': 'BassRace 139.9', 'Результат': '138.8' };
    const stageClasses = [{ class: { id: 'bass-139', name: 'BassRace 139.9', unit: 'DB' } }];
    const byNumber = await service.previewResultRow(raw, 1, new Map(), otherPersonRegistration, stageClasses, 'stage-1', true);
    expect(byNumber.car.vibrationIsolation).toBeNull();
    const missing = await service.previewResultRow(raw, 1, new Map(),
      service.buildRegistrationParticipantIndex([]), stageClasses, 'stage-1', true);
    expect(missing.car.vibrationIsolation).toBeNull();
  });

  it('preserves source vibration when absent from catalog', async () => {
    const tx: any = {
      siteSettings: { findUnique: jest.fn(async () => ({ catalogs: { vibrationBrands: ['STP'] } })) },
    };
    const service: any = createService();
    expect(await service.importVibrationBrand(tx, 'New Brand From Registration', true)).toBe('New Brand From Registration');
    await expect(service.importVibrationBrand(tx, 'New Brand From Registration')).rejects.toThrow(BadRequestException);
    expect(await service.importVibrationBrand(tx, 'не указана', true)).toBeNull();
  });

  it('auto-allocates distinct BassRace class numbers after the maximum in Results and stage', async () => {
    const service: any = createService();
    const tx: any = {
      registrationClass: {
        findUnique: jest.fn(async () => null),
        findMany: jest.fn(async () => [{ class: { name: 'BassRace 129.9' } }]),
      },
      registrationNumber: {
        findUnique: jest.fn(async () => ({ registrationId: 'reg-1' })),
        findMany: jest.fn(async () => [{ number: 95 }]),
      },
      result: { findMany: jest.fn(async () => [{
        registration: { participantNumber: 25 },
        registrationClass: { number: { number: 95 } },
      }]) },
    };
    const next = await service.resolveHistoricalBassRaceClassNumber(tx, 'stage-1', 'reg-1', 'bass-139', 25, 130);
    expect(next).toBe(131);
    expect(tx.registrationClass.findMany).toHaveBeenCalledWith({
      where: { registrationId: 'reg-1' }, select: { class: { select: { name: true } } },
    });

    tx.registrationClass.findUnique.mockResolvedValueOnce({ number: { number: 42 } });
    const existing = await service.resolveHistoricalBassRaceClassNumber(tx, 'stage-1', 'reg-1', 'bass-139', 25, 130);
    expect(existing).toBe(42);
    expect(tx.result.findMany).toHaveBeenCalledTimes(1);
  });

  it('makes a new immutable version when a previously used car receives a different brand', async () => {
    const config = { id: 'config-1', carId: 'car-1', name: 'LEGACY_IMPORT', currentVersion: 1 };
    const version = {
      id: 'old-version', configurationId: 'config-1', version: 1,
      vibrationIsolation: 'STP', additionalDescription: 'Legacy import',
    };
    const tx: any = {
      siteSettings: {
        findUnique: jest.fn(async () => ({ catalogs: { vibrationBrands: ['STP', 'ComfortMat'] } })),
      },
      carConfiguration: {
        findFirst: jest.fn(async () => config),
        update: jest.fn(async ({ data }: any) => ({ ...config, ...data })),
      },
      carConfigurationVersion: {
        findFirst: jest.fn(async () => version),
        create: jest.fn(async ({ data }: any) => ({ id: 'new-version', ...data })),
        update: jest.fn(),
      },
      registration: { count: jest.fn(async () => 1) },
    };
    const service: any = new ImportsService({} as PrismaService, new NameNormalizerService());
    const result = await service.ensureLegacyImportConfiguration(tx, 'car-1', 'ComfortMat');
    expect(tx.carConfigurationVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ configurationId: 'config-1', version: 2, vibrationIsolation: 'ComfortMat' }),
    });
    expect(tx.carConfigurationVersion.update).not.toHaveBeenCalled();
    expect(tx.carConfiguration.update).toHaveBeenCalledWith({
      where: { id: 'config-1' }, data: { currentVersion: 2 },
    });
    expect(result.version.vibrationIsolation).toBe('ComfortMat');
  });
});

describe('ImportsService historical same-name disambiguation', () => {
  function service() {
    const db: any = {
      registration: { findUnique: jest.fn(async () => null) },
    };
    return new ImportsService(db as PrismaService, new NameNormalizerService()) as any;
  }
  const stageClass = [{ class: { id: 'bass-129', name: 'BassRace 129.9', unit: 'DB' } }];

  it('chooses matching Registration number from several same-name BassRace helper rows', async () => {
    const sut = service();
    const index = sut.buildRegistrationParticipantIndex([
      { 'Фамилия и имя': 'Teplov Vladislav', 'Номер участника': 51, 'Номер автомобиля': 'А111АА72', 'Виброизоляция': 'STP' },
      { 'Фамилия и имя': 'Teplov Vladislav', 'Номер участника': 87, 'Номер автомобиля': 'А111АА72', 'Виброизоляция': 'STP' },
    ]);
    const person = sut.findRegistrationParticipant('Teplov Vladislav', index, 87);
    expect(person.status).toBe('MATCHED');
    expect(person.matches).toHaveLength(1);
    expect(person.matches[0].participantNumber).toBe(87);
    const result = await sut.previewResultRow(
      { ФИО: 'Teplov Vladislav', Номер: 87, Класс: 'BassRace 129.9', Результат: '128.2' },
      87, new Map(), index, stageClass, 'stage-1', true,
    );
    expect(result.status).toBe('READY');
    expect(result.warnings).toEqual([]);
    expect(result.car.vibrationIsolation).toBe('STP');
    expect(result.participantNumber).toBe(87);
  });

  it('uses AUTO stage-safe number for blank Results number when same-name Registration rows share a car', async () => {
    const sut = service();
    const index = sut.buildRegistrationParticipantIndex([
      { 'Фамилия и имя': 'Teplov Vladislav', 'Номер участника': 51, 'Номер автомобиля': 'А111АА72', 'Виброизоляция': 'STP' },
      { 'Фамилия и имя': 'Teplov Vladislav', 'Номер участника': 87, 'Номер автомобиля': 'А111АА72', 'Виброизоляция': 'STP' },
    ]);
    const person = sut.findRegistrationParticipant('Teplov Vladislav', index, null);
    expect(person.status).toBe('MATCHED');
    expect(person.matches[0].participantNumber).toBeNull();
    const result = await sut.previewResultRow(
      { ФИО: 'Teplov Vladislav', Номер: '000', Класс: 'BassRace 129.9', Результат: '128.2' },
      51, new Map(), index, stageClass, 'stage-1', true,
      new Map([['теплов владислав', 201]]),
    );
    expect(result.status).toBe('READY');
    expect(result.participantNumber).toBe(201);
    expect(result.participantNumberSource).toBe('AUTO');
    expect(result.car.vibrationIsolation).toBe('STP');
  });

  it('disambiguates two DB Participant IDs ONLY when one matches the helper car', async () => {
    const sut = service();
    const db = sut.buildParticipantIndex([
      { id: 'right', firstName: 'Vladislav', lastName: 'Teplov', middleName: null, team: null,
        cars: [{ registrationNumber: 'А111АА72' }], registrations: [] },
      { id: 'wrong', firstName: 'Vladislav', lastName: 'Teplov', middleName: null, team: null,
        cars: [{ registrationNumber: 'В222ВВ72' }], registrations: [] },
    ]);
    const registration = sut.buildRegistrationParticipantIndex([
      { 'Фамилия и имя': 'Teplov Vladislav', 'Номер участника': 87, 'Номер автомобиля': 'А111АА72' },
    ]);
    const preview = await sut.previewResultRow(
      { ФИО: 'Teplov Vladislav', Номер: 87, Класс: 'BassRace 129.9', Результат: '128.2' },
      87, db, registration, stageClass, 'stage-1', true,
    );
    expect(preview.status).toBe('READY');
    expect(preview.participant.status).toBe('MATCHED');
    expect(preview.participant.matches[0].id).toBe('right');
  });

  it('uses an existing stage sticker to distinguish same-name DB profiles when the helper sheet has no reliable car', async () => {
    const sut = service();
    const db = sut.buildParticipantIndex([
      { id: 'right', firstName: 'Ivan', lastName: 'Vorobiev', middleName: null, team: null,
        cars: [], registrations: [{ participantNumber: 123 }] },
      { id: 'wrong', firstName: 'Ivan', lastName: 'Vorobiev', middleName: null, team: null,
        cars: [], registrations: [{ participantNumber: 4 }] },
    ]);
    const result = await sut.previewResultRow(
      { ФИО: 'Vorobiev Ivan', Номер: 123, Класс: 'BassRace 129.9', Результат: '128.2' },
      123, db, sut.buildRegistrationParticipantIndex([]), stageClass, 'stage-1', true,
    );
    expect(result.status).toBe('READY');
    expect(result.participant.matches[0].id).toBe('right');
  });

  it('does not invent database-duplicate warnings when only the helper sheet has ambiguous people', async () => {
    const sut = service();
    const helpers = sut.buildRegistrationParticipantIndex([
      { 'Фамилия и имя': 'Voitenko Evgeny', 'Номер участника': 88,
        'Номер автомобиля': 'А111АА72', 'Виброизоляция': 'STP' },
      { 'Фамилия и имя': 'Voitenko Evgeny', 'Номер участника': 99,
        'Номер автомобиля': 'В222ВВ72', 'Виброизоляция': 'ComfortMat' },
    ]);
    const result = await sut.previewResultRow(
      { ФИО: 'Voitenko Evgeny', Номер: 94, Класс: 'BassRace 129.9', Результат: '128.2' },
      94, new Map(), helpers, stageClass, 'stage-1', true,
    );
    expect(result.status).toBe('READY');
    expect(result.participant.status).toBe('NEW');
    expect(result.registration.status).toBe('AMBIGUOUS');
    expect(result.car.vibrationIsolation).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it('stops automatic identity choice when matching plate and stage number point to different IDs', async () => {
    const sut = service();
    const db = sut.buildParticipantIndex([
      { id: 'plate-person', firstName: 'Ivan', lastName: 'Vorobiev', middleName: null, team: null,
        cars: [{ registrationNumber: 'А111АА72' }], registrations: [] },
      { id: 'number-person', firstName: 'Ivan', lastName: 'Vorobiev', middleName: null, team: null,
        cars: [{ registrationNumber: 'В222ВВ72' }], registrations: [{ participantNumber: 123 }] },
    ]);
    const helpers = sut.buildRegistrationParticipantIndex([
      { 'Фамилия и имя': 'Vorobiev Ivan', 'Номер участника': 123, 'Номер автомобиля': 'А111АА72' },
    ]);
    const result = await sut.previewResultRow(
      { ФИО: 'Vorobiev Ivan', Номер: 123, Класс: 'BassRace 129.9', Результат: '128.2' },
      123, db, helpers, stageClass, 'stage-1', true,
    );
    expect(result.status).toBe('WARNING');
    expect(result.participant.status).toBe('AMBIGUOUS');
    expect(result.warnings).toHaveLength(1);
  });

  it('does NOT silently combine unrelated same-name profiles or cars', async () => {
    const sut = service();
    const db = sut.buildParticipantIndex([
      { id: 'person-a', firstName: 'Evgeny', lastName: 'Voitenko', middleName: null, team: null,
        cars: [{ registrationNumber: 'А111АА72' }], registrations: [] },
      { id: 'person-b', firstName: 'Evgeny', lastName: 'Voitenko', middleName: null, team: null,
        cars: [{ registrationNumber: 'В222ВВ72' }], registrations: [] },
    ]);
    const source = sut.buildRegistrationParticipantIndex([
      { 'Фамилия и имя': 'Voitenko Evgeny', 'Номер участника': 88, 'Номер автомобиля': 'А111АА72' },
      { 'Фамилия и имя': 'Voitenko Evgeny', 'Номер участника': 99, 'Номер автомобиля': 'В222ВВ72' },
    ]);
    const unmatched = sut.findRegistrationParticipant('Voitenko Evgeny', source, null);
    expect(unmatched.status).toBe('AMBIGUOUS');
    const result = await sut.previewResultRow(
      { ФИО: 'Voitenko Evgeny', Номер: 94, Класс: 'BassRace 129.9', Результат: '128.2' },
      94, db, source, stageClass, 'stage-1', true,
    );
    expect(result.status).toBe('WARNING');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('несколько разных карточек участников');
    expect(result.participant.status).toBe('AMBIGUOUS');
    expect(result.car.vibrationIsolation).toBeNull();
  });

  it('never masks ambiguous DB matches even if Registration helper matches exactly', async () => {
    const sut = service();
    const db = sut.buildParticipantIndex([
      { id: 'person-a', firstName: 'Ivan', lastName: 'Vorobiev', middleName: null, team: null },
      { id: 'person-b', firstName: 'Ivan', lastName: 'Vorobiev', middleName: null, team: null },
    ]);
    const helpers = sut.buildRegistrationParticipantIndex([
      { 'Фамилия и имя': 'Vorobiev Ivan', 'Номер участника': 123 },
    ]);
    const result = await sut.previewResultRow(
      { ФИО: 'Vorobiev Ivan', Номер: 123, Класс: 'BassRace 129.9', Результат: '128.2' },
      123, db, helpers, stageClass, 'stage-1', true,
    );
    expect(result.status).toBe('WARNING');
    expect(result.warnings).toHaveLength(1);
    expect(result.participant.source).toBe('DATABASE');
  });
});


describe('ImportsService import-name gate', () => {
  it('blocks a team nickname with no real first name before importing an archival result', async () => {
    const db: any = { registration: { findUnique: jest.fn(async () => null) } };
    const service: any = new ImportsService(db as PrismaService, new NameNormalizerService());
    const result = await service.previewResultRow(
      { 'ФИО': '34 Sound', 'Номер': 34, 'Класс': 'BassRace 129.9', 'Результат': '129.9' },
      1, new Map(), service.buildRegistrationParticipantIndex([]),
      [{ class: { id: 'bass-129', name: 'BassRace 129.9', unit: 'DB' } }],
      'stage-1', true,
    );
    expect(result.status).toBe('WARNING');
    expect(result.warnings.some((w: string) => w.includes('подозрительное ФИО'))).toBe(true);
  });

  it('refuses commit-side creation of suspicious participants, even if a stale preview had been READY', async () => {
    const tx: any = { participant: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() } };
    const service: any = new ImportsService({} as PrismaService, new NameNormalizerService());
    await expect(service.createParticipantFromImport(tx, { fullName: 'Антоха Сф' }))
      .rejects.toThrow('подозрительным ФИО');
    expect(tx.participant.create).not.toHaveBeenCalled();
  });
});

describe('ImportsService BassRace historical preview', () => {
  it('marks second distinct BassRace class with automatically allocated number without adding a warning', async () => {
    let created: any = null;
    const db: any = {
      stage: { findUnique: jest.fn(async () => ({ id: 'stage-1', stageNumber: 1, name: 'Stage', seasonId: 'season' })) },
      participant: { findMany: jest.fn(async () => []) },
      stageClass: { findMany: jest.fn(async () => [
        { class: { id: 'bass-129', name: 'BassRace 129.9', code: 'BASSRACE_129_9', unit: 'DB' } },
        { class: { id: 'bass-139', name: 'BassRace 139.9', code: 'BASSRACE_139_9', unit: 'DB' } },
        { class: { id: 'bass-149', name: 'BassRace 149.9', code: 'BASSRACE_149_9', unit: 'DB' } },
      ]) },
      registration: { aggregate: jest.fn(async () => ({ _max: { participantNumber: 15 } })) },
      registrationNumber: { aggregate: jest.fn(async () => ({ _max: { number: 15 } })) },
      importJob: { create: jest.fn(async ({ data }: any) => {
        created = data;
        return { id: 'job-1', status: 'DRAFT', createdAt: new Date(), rows: [] };
      }) },
    };
    const service = new ImportsService(db as PrismaService, new NameNormalizerService());
    await service.previewStage({
      stageId: 'stage-1',
      historicalResults: true,
      registrations: [],
      results: [
        { 'ФИО': 'Петров Иван', 'Номер': 10, 'Класс': 'Bass Race 129.9', 'Результат': '128,9' },
        { 'ФИО': 'Петров Иван', 'Номер': 10, 'Класс': 'Bass Race 139.9', 'Результат': '138,9' },
        { 'ФИО': 'Сидоров Пётр', 'Номер': 11, 'Класс': 'Bass Race 149.9', 'Результат': '148,9' },
      ],
    });
    const resultRows = created.rows.create.filter((row: any) => row.type === 'RESULT');
    expect(resultRows.map((row: any) => row.status)).toEqual(['READY','READY','READY']);
    expect(resultRows[1].normalizedData.classNumberSource).toBe('AUTO');
    expect(resultRows[1].normalizedData.classParticipantNumber).toBe(16);
    expect(resultRows[1].warnings).toEqual([]);
    expect(resultRows[2].normalizedData.classParticipantNumber).toBe(11);
    expect(resultRows[0].normalizedData.classParticipantNumber).toBe(10);
  });
});

describe('ImportsService missing source vibration', () => {
  it('keeps an immutable blank configuration when Registration has no vibration', async () => {
    const config = { id: 'config-1', carId: 'car-1', name: 'LEGACY_IMPORT', currentVersion: 1 };
    const existingVersion = { id: 'old-version', configurationId: config.id, version: 1,
      vibrationIsolation: 'STP', additionalDescription: 'legacy' };
    const tx: any = {
      carConfiguration: {
        findFirst: jest.fn(async () => config),
        update: jest.fn(async ({ data }: any) => ({ ...config, ...data })),
      },
      carConfigurationVersion: {
        findFirst: jest.fn(async () => existingVersion),
        create: jest.fn(async ({ data }: any) => ({ id: 'new-version', ...data })),
        update: jest.fn(),
      },
      registration: { count: jest.fn(async () => 1) },
    };
    const service: any = createService();
    const result = await service.ensureLegacyImportConfiguration(tx, 'car-1', undefined);
    expect(result.version.vibrationIsolation).toBeNull();
    expect(result.version.version).toBe(2);
    expect(tx.carConfigurationVersion.update).not.toHaveBeenCalled();
    expect(existingVersion.vibrationIsolation).toBe('STP');
  });
});

describe('ImportsService preview concurrency', () => {
  it('preserves row order while limiting concurrent queries to eight', async () => {
    const service: any = new ImportsService({} as PrismaService, new NameNormalizerService());
    let active = 0;
    let peak = 0;
    const input = Array.from({ length: 41 }, (_, index) => index);
    const output = await service.mapPreviewRows(input, async (value: number) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    expect(output).toEqual(input.map((value) => value * 2));
    expect(peak).toBeLessThanOrEqual(8);
    expect(peak).toBeGreaterThan(0);
  });
});
