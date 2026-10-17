import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

describe('ImportsService import-name normalization', () => {
  it('matches the same participant when the source switches between Latin and Cyrillic', () => {
    const service = createService() as any;

    expect(service.normalizePersonName('Misheryakov Sergey'))
      .toBe(service.normalizePersonName('Мещеряков Сергей'));
    expect(service.normalizePersonName('Sergey Meshcheryakov'))
      .toBe(service.normalizePersonName('Сергей Мещеряков'));
  });

  it('matches surname/name order variants with canonical tokens', () => {
    const service = createService() as any;

    expect(service.nameTokens('Misheryakov Sergey'))
      .toEqual(service.nameTokens('Сергей Мещеряков'));
  });

  it('normalizes ё/е, invisible characters and repeated whitespace before matching', () => {
    const service = createService() as any;

    expect(service.normalizePersonName('  ПЁТР\u200B   Королёв  '))
      .toBe(service.normalizePersonName('Петр Королев'));
  });

  it('keeps ambiguous participant matches as candidates rather than merging them', () => {
    const service = createService() as any;
    const participantIndex = service.buildParticipantIndex([
      { id: 'p1', lastName: 'Мещеряков', firstName: 'Сергей', middleName: null, team: null },
      { id: 'p2', lastName: 'Мещеряков', firstName: 'Сергей', middleName: null, team: null },
    ]);

    expect(service.findParticipant('Misheryakov Sergey', participantIndex).status)
      .toBe('AMBIGUOUS');
  });

  it('does not auto-match a fuzzy transliteration candidate without admin review', () => {
    const service = createService() as any;
    const match = {
      rowNumber: 1,
      rawName: 'Misheryakov Sergey',
      normalizedName: service.normalizePersonName('Misheryakov Sergey'),
      participantNumber: 1,
      email: '',
      team: '',
      car: { model: '', plateNumber: '' },
    };
    const byName = new Map<string, any[]>();
    for (const alias of service.nameAliases(match.rawName)) {
      byName.set(alias, [match]);
    }

    const result = service.findRegistrationParticipant('Misheryakov Sergeyy', {
      byName,
      byNumber: new Map(),
    });

    expect(result.status).toBe('AMBIGUOUS');
    expect(result.matches).toHaveLength(1);
  });
});

describe('ImportsService historical participant-number rules', () => {
  it('allocates missing historical result numbers starting at 001 and skips numbers already present in source sheets', async () => {
    const service = createService() as any;
    service.prisma = {
      registration: {
        aggregate: jest.fn(async () => ({ _max: { participantNumber: 0 } })),
      },
    };

    const allocated = await service.buildHistoricalFallbackNumbers(
      'stage-1',
      [{ 'Номер участника': 1 }],
      [
        { ФИО: 'Иванов Иван', Номер: 2 },
        { ФИО: 'Петров Пётр' },
        { ФИО: 'Сидоров Сергей' },
      ],
    );

    expect(allocated.get('петров петр')).toBe(3);
    expect(allocated.get('сидоров сергей')).toBe(4);
  });

  it('preserves historical Bass Race number 0 separately from the positive primary registration number', () => {
    const service = createService() as any;

    expect(service.resolveHistoricalClassNumber({
      rawData: { Номер: 0 },
      isBassRace: true,
      historicalResults: true,
      historicalOrResolvedNumber: 17,
      primaryNumber: 4,
    })).toBe(0);

    expect(service.resolveHistoricalClassNumber({
      rawData: { Номер: 0 },
      isBassRace: false,
      historicalResults: true,
      historicalOrResolvedNumber: 17,
      primaryNumber: 4,
    })).toBe(4);
  });

  it('allocates a duplicate historical BassRace number after the maximum number already used on the stage', async () => {
    const service = createService() as any;
    const tx = {
      result: {
        findMany: jest.fn(async () => [
          {
            registration: { participantNumber: 8 },
            registrationClass: { number: { number: 12 } },
          },
        ]),
      },
      registrationNumber: {
        findMany: jest.fn(async () => [{ number: 15 }]),
      },
    };

    await expect(
      service.allocateNextHistoricalBassRaceNumber(tx, 'stage-1'),
    ).resolves.toBe(16);
  });
});

describe('ImportsService actual historical XLSX snapshot', () => {
  it('parses both source workbooks using the real mapped stage sheets without dropping result rows or zero numbers', () => {
    const service = createService() as any;
    const source = JSON.parse(
      readFileSync(join(process.cwd(), 'data', 'historical-xlsx.json'), 'utf8'),
    );
    const registrationsWorkbook = source['USD _ Регистрация.xlsx'];
    const resultsWorkbook = source['USD _ Результаты.xlsx'];

    const mappings = [
      { registrationSheet: 'Открытие Волгоград', resultsSheet: 'open_volgograd2026', registrations: 114, results: 127 },
      { registrationSheet: 'Астрахань', resultsSheet: 'astraxan', registrations: 41, results: 53 },
      { registrationSheet: 'Ижевск', resultsSheet: 'ijevsk', registrations: 44, results: 84 },
      { registrationSheet: 'Липецк', resultsSheet: 'lipetsk', registrations: 36, results: 67 },
      { registrationSheet: 'Орел', resultsSheet: 'orel', registrations: 42, results: 98 },
      { registrationSheet: 'Смоленск', resultsSheet: 'smolensk', registrations: 37, results: 63 },
      { registrationSheet: 'Ростов', resultsSheet: 'rostov-on-don', registrations: 53, results: 98 },
      { registrationSheet: 'Самара', resultsSheet: 'samara', registrations: 78, results: 110 },
      { registrationSheet: 'Ростов 05.09', resultsSheet: null, registrations: 52, results: 0 },
      { registrationSheet: 'финал Волгоград', resultsSheet: 'final_volg2026', registrations: 169, results: 198 },
      { registrationSheet: null, resultsSheet: 'final_volgograd2025', registrations: 0, results: 182 },
    ];

    let totalRegistrations = 0;
    let totalResults = 0;
    let zeroNumberResults = 0;

    for (const mapping of mappings) {
      const registrationRows = mapping.registrationSheet
        ? service.rowsFromSheet(registrationsWorkbook[mapping.registrationSheet])
        : [];
      const resultRows = mapping.resultsSheet
        ? service.resultRowsFromSheet(resultsWorkbook[mapping.resultsSheet])
        : [];

      expect(registrationRows).toHaveLength(mapping.registrations);
      expect(resultRows).toHaveLength(mapping.results);

      for (const row of resultRows) {
        expect(String(row['Класс'] ?? '').trim()).not.toBe('');
        expect(String(row['ФИО'] ?? '').trim()).not.toBe('');
        expect(row['Результат']).not.toBeNull();
        expect(String(row['Результат'] ?? '').trim()).not.toBe('');
        if (String(row['Номер'] ?? '').trim() === '0') zeroNumberResults++;
      }

      totalRegistrations += registrationRows.length;
      totalResults += resultRows.length;
    }

    expect(totalRegistrations).toBe(666);
    expect(totalResults).toBe(1080);
    expect(zeroNumberResults).toBe(334);
  });
});

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
