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

    expect(service.normalizePersonName('  ПЁТР\\u200B   Королёв  '))
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
