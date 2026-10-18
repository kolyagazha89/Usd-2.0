import { jest } from '@jest/globals';

import { ResultsService } from './results.service';

describe('ResultsService', () => {
  const prisma: any = {
    $transaction: jest.fn(),
    result: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    stage: {
      findUnique: jest.fn(),
    },
  };

  const records: any = {
    createFromResultIfEligible: jest.fn(),
    recalculateInTransaction: jest.fn(),
    syncAfterResultUpdate: jest.fn(),
  };

  const ranking: any = {
    recalculateByStageClass: jest.fn(),
    recalculateInTransaction: jest.fn(),
  };

  let service: ResultsService;

  const judgeRequest: any = {
    user: {
      sub: 'judge-1',
      role: 'PARTICIPANT',
      customRoleId: 'judge-role',
    },
    ip: '127.0.0.1',
  };

  const adminRequest: any = {
    user: {
      sub: 'admin-1',
      role: 'ADMIN',
    },
    ip: '127.0.0.1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ResultsService(prisma, records, ranking);
  });

  it('includes imported historical results on published public stages before record verification', async () => {
    prisma.stage.findUnique.mockResolvedValue({
      id: 'stage-1',
      status: 'PUBLISHED',
      isDeleted: false,
      resultsPublishedAt: new Date('2026-01-01T00:00:00Z'),
    });
    prisma.result.findMany.mockResolvedValue([]);

    await service.findByStage('stage-1');

    expect(prisma.result.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        registration: {
          stageId: 'stage-1',
          stage: { isDeleted: false, status: { in: ['PUBLISHED', 'COMPLETED'] }, resultsPublishedAt: { not: null } },
        },
      },
      include: expect.any(Object),
    }));
  });

  it('does not expose stage results before explicit publication', async () => {
    prisma.stage.findUnique.mockResolvedValue({ id: 'stage-1', status: 'PUBLISHED', isDeleted: false, resultsPublishedAt: null });
    await expect(service.findByStage('stage-1')).rejects.toThrow('Результаты этого этапа пока не опубликованы');
    expect(prisma.result.findMany).not.toHaveBeenCalled();
  });

  it('redacts private participant and car details from public result rows', async () => {
    prisma.stage.findUnique.mockResolvedValue({
      id: 'stage-1',
      status: 'PUBLISHED',
      isDeleted: false,
      resultsPublishedAt: new Date('2026-01-01T00:00:00Z'),
    });
    prisma.result.findMany.mockResolvedValue([
      {
        id: 'result-private-1',
        registration: {
          id: 'registration-1',
          participant: {
            id: 'participant-1',
            lastName: 'Private',
            firstName: 'Person',
            middleName: 'Secret',
            team: 'Private Team',
            city: 'Private City',
            photoUrl: 'https://example.invalid/person.jpg',
            isPublic: false,
          },
          car: {
            id: 'car-1',
            brand: 'Private Brand',
            model: 'Private Model',
            color: 'red',
            photoUrl: 'https://example.invalid/car.jpg',
            isPublic: false,
          },
        },
      },
    ]);

    const results = await service.findByStage('stage-1');

    expect(results[0].registration?.participant).toMatchObject({
      lastName: 'Участник скрыт',
      firstName: '',
      middleName: null,
      team: null,
      city: null,
      photoUrl: null,
      isPublic: false,
    });
    expect(results[0].registration?.car).toMatchObject({
      brand: 'Автомобиль скрыт',
      model: '',
      color: null,
      photoUrl: null,
      isPublic: false,
    });
  });

  it('rejects result creation from a participant at the service boundary', async () => {
    const participantRequest = {
      user: { sub: 'participant-user', role: 'PARTICIPANT' },
      ip: '127.0.0.1',
    } as any;

    await expect(
      service.create(
        {
          registrationId: 'registration-1',
          registrationClassId: 'registration-class-1',
          value: 150,
          confirmed: true,
        },
        participantRequest,
      ),
    ).rejects.toThrow('Недостаточно прав для внесения результата');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects result correction for a judge at the service boundary', async () => {
    await expect(
      service.update('result-1', { value: 151 }, judgeRequest),
    ).rejects.toThrow('Изменение и удаление результатов доступно только ADMIN');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  function setupCreateTx(overrides: any = {}) {
    const tx: any = {
      registration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'registration-1',
          participantId: 'participant-1',
          stageId: 'stage-1',
          status: 'ACTIVE',
          inspection: {
            status: 'PASSED',
          },
          stage: {
            id: 'stage-1',
            seasonId: 'season-1',
            status: 'PUBLISHED',
            isDeleted: false,
          },
        }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          stageId: 'stage-1',
        }),
      },
      stage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'stage-1',
          seasonId: 'season-1',
        }),
      },
      disqualification: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      registrationClass: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'registration-class-1',
          registrationId: 'registration-1',
          classId: 'class-1',
          class: {
            id: 'class-1',
            name: 'Limited 2.0',
            code: 'L20',
            unit: 'DB',
            isActive: true,
            direction: {
              id: 'direction-1',
              name: 'SPL',
            },
          },
        }),
      },
      stageClass: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'stage-class-1',
          isActive: true,
        }),
      },
      result: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: 'result-1',
          value: 150.123,
          unit: 'DB',
          place: null,
          notes: null,
          registration: {
            id: 'registration-1',
          },
        }),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({id:"result-1"}),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      ...overrides,
    };

    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    return tx;
  }

  it('rejects a result when inspection is FAILED', async () => {
    setupCreateTx({
      registration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'registration-1',
          participantId: 'participant-1',
          stageId: 'stage-1',
          status: 'ACTIVE',
          inspection: {
            status: 'FAILED',
          },
          stage: {
            id: 'stage-1',
            seasonId: 'season-1',
            status: 'PUBLISHED',
            isDeleted: false,
          },
        }),
      },
    });

    await expect(
      service.create(
        {
          registrationId: 'registration-1',
          registrationClassId: 'registration-class-1',
          value: 150,
          confirmed: true,
        },
        judgeRequest,
      ),
    ).rejects.toThrow(
      'Участник не допущен после инспекции: результат недоступен',
    );
  });

  it('rejects a result when the shared participant-stage inspection is FAILED even if a legacy registration inspection passed', async () => {
    setupCreateTx({
      registration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'registration-1',
          participantId: 'participant-1',
          stageId: 'stage-1',
          status: 'ACTIVE',
          inspection: { status: 'PASSED' },
          stageInspection: { status: 'FAILED' },
          stage: { id: 'stage-1', seasonId: 'season-1', status: 'PUBLISHED', isDeleted: false },
        }),
      },
    });
    await expect(service.create({
      registrationId: 'registration-1',
      registrationClassId: 'registration-class-1',
      value: 150,
      confirmed: true,
    }, judgeRequest)).rejects.toThrow('Участник не допущен после инспекции: результат недоступен');
  });

  it('allows exactly one result for a registration class', async () => {
    const tx = setupCreateTx({
      result: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-result' }),
        create: jest.fn(),
      },
    });

    await expect(
      service.create(
        {
          registrationId: 'registration-1',
          registrationClassId: 'registration-class-1',
          value: 150,
          confirmed: true,
        },
        judgeRequest,
      ),
    ).rejects.toThrow('Для этого класса результат уже внесён');

    expect(tx.result.create).not.toHaveBeenCalled();
  });

  it('takes measurement unit from the class instead of trusting the client', async () => {
    const tx = setupCreateTx();

    prisma.result.findUnique.mockResolvedValue({
      id: 'result-1',
    });

    await service.create(
      {
        registrationId: 'registration-1',
        registrationClassId: 'registration-class-1',
        value: 150.123,
          confirmed: true,
      },
      judgeRequest,
    );

    expect(tx.result.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unit: 'DB',
          createdByUserId: 'judge-1',
        }),
      }),
    );
  });

  it('writes an audit entry when a judge creates a result', async () => {
    const tx = setupCreateTx();
    prisma.result.findUnique.mockResolvedValue({ id: 'result-1' });

    await service.create(
      {
        registrationId: 'registration-1',
        registrationClassId: 'registration-class-1',
        value: 150,
          confirmed: true,
      },
      judgeRequest,
    );

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'RESULT_CREATED',
          entity: 'Result',
          entityId: 'result-1',
          userId: 'judge-1',
        }),
      }),
    );
  });

  it('updates only through the admin path and records before/after audit data', async () => {
    const tx: any = {
      result: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({id:"result-1"}),
        findUnique: jest.fn().mockResolvedValue({
          id: 'result-1',
          value: { toString: () => '150.000' },
          unit: 'DB',
          place: 2,
          notes: 'old',
          registrationId: 'registration-1',
          registration: {
            status: 'ACTIVE',
            participantId: 'participant-1',
            stageId: 'stage-1',
            inspection: { status: 'PASSED' },
            stage: {
              isDeleted: false,
              status: 'PUBLISHED',
              seasonId: 'season-1',
            },
          },
          registrationClassId: 'registration-class-1',
          registrationClass: {
            classId: 'class-1',
            class: { name: 'Limited 2.0' },
          },
        }),
        update: jest.fn().mockResolvedValue({
          id: 'result-1',
          value: { toString: () => '151.000' },
          unit: 'DB',
          place: 1,
          notes: 'corrected',
        }),
      },
      stage: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'stage-1',
          seasonId: 'season-1',
        }),
      },
      disqualification: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({}),
      },
    };

    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(tx),
    );

    prisma.result.findUnique.mockResolvedValue({
      id: 'result-1',
    });

    await service.update(
      'result-1',
      {
        value: 151,
        place: 1,
        notes: 'corrected',
      },
      adminRequest,
    );

    expect(tx.result.update).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'RESULT_CORRECTED',
          userId: 'admin-1',
        }),
      }),
    );
  });
});
