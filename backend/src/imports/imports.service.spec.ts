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
  it('allows assigning a catalog brand to a READY result without resolving unrelated fields', async () => {
    const saved = {
      id: 'row-1',
      importJobId: 'job-1',
      type: 'RESULT',
      status: 'READY',
      resolution: { participant: { action: 'CREATE', fullName: 'Иванов Иван' } },
    };
    const tx: any = {
      $queryRaw: jest.fn(async () => []),
      importJob: {
        findUnique: jest.fn(async () => ({ id: 'job-1', status: 'DRAFT', metadata: { historicalResults: true } })),
      },
      importRow: {
        findFirst: jest.fn(async () => saved),
        update: jest.fn(async ({ data }: any) => ({ ...saved, ...data })),
      },
      siteSettings: {
        findUnique: jest.fn(async () => ({ catalogs: { vibrationBrands: ['STP', 'ComfortMat'] } })),
      },
    };
    const prisma: any = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const service = new ImportsService(prisma, new NameNormalizerService());
    const result = await service.setImportVibration('job-1', 'row-1', 'STP');

    expect(result.row.status).toBe('READY');
    expect(result.row.resolution).toMatchObject({
      participant: { action: 'CREATE', fullName: 'Иванов Иван' },
      car: { vibrationIsolation: 'STP' },
    });
    expect(tx.importRow.update).toHaveBeenCalledTimes(1);
  });

  it('rejects a vibration brand not registered in the site catalog', async () => {
    const tx: any = {
      $queryRaw: jest.fn(async () => []),
      importJob: { findUnique: jest.fn(async () => ({ status: 'DRAFT', metadata: { historicalResults: true } })) },
      importRow: {
        findFirst: jest.fn(async () => ({ id: 'row-1', status: 'READY', resolution: null })),
        update: jest.fn(),
      },
      siteSettings: {
        findUnique: jest.fn(async () => ({ catalogs: { vibrationBrands: ['STP'] } })),
      },
    };
    const prisma: any = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const service = new ImportsService(prisma, new NameNormalizerService());
    await expect(service.setImportVibration('job-1', 'row-1', 'Unknown brand')).rejects.toThrow(BadRequestException);
    expect(tx.importRow.update).not.toHaveBeenCalled();
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
