import { jest } from '@jest/globals';
import { MeasurementsService } from './measurements.service';

describe('MeasurementsService', () => {
  const prisma: any = {
    registration: { findUnique: jest.fn() },
    measurementSession: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const results: any = { create: jest.fn(), createFromMeasurement: jest.fn() };
  let service: MeasurementsService;

  const judgeRequest: any = {
    user: { sub: 'judge-id', role: 'JUDGE' },
    ip: '127.0.0.1',
  };
  const input: any = {
    registrationId: '11111111-1111-4111-8111-111111111111',
    registrationClassId: '22222222-2222-4222-8222-222222222222',
    deviceType: 'TERM-LAB',
    deviceSerial: 'TL-001',
    measurementType: 'SPL',
    value: 151.25,
    unit: 'DB',
    frequencyHz: 45,
    durationMs: 3000,
    measuredAt: '2026-10-12T12:00:00.000Z',
    rawData: { peak: 151.25 },
    idempotencyKey: 'measurement-attempt-0001',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MeasurementsService(prisma, results);
  });

  it('rejects participant access before touching the database', async () => {
    await expect(service.create(input, {
      user: { sub: 'participant-id', role: 'PARTICIPANT' },
    } as any)).rejects.toThrow('Измерения доступны только судье или администратору');
    expect(prisma.registration.findUnique).not.toHaveBeenCalled();
  });

  it('returns the previous session for a repeated idempotency key with the same payload', async () => {
    prisma.measurementSession.findUnique.mockResolvedValue({
      ...input,
      id: 'measurement-id',
      status: 'RECEIVED',
      measuredAt: new Date(input.measuredAt),
      createdAt: new Date(input.measuredAt),
      updatedAt: new Date(input.measuredAt),
    });

    const result = await service.create(input, judgeRequest);
    expect(result.duplicate).toBe(true);
    expect(result.id).toBe('measurement-id');
    expect(prisma.registration.findUnique).not.toHaveBeenCalled();
  });

  it('rejects reuse of an idempotency key for different measurement data', async () => {
    prisma.measurementSession.findUnique.mockResolvedValue({
      ...input,
      id: 'measurement-id',
      value: 149.5,
      measuredAt: new Date(input.measuredAt),
    });

    await expect(service.create(input, judgeRequest)).rejects.toThrow(
      'Idempotency-Key уже использован для другого измерения',
    );
  });

  it('delegates acceptance to the atomic official-result workflow', async () => {
    prisma.measurementSession.findUnique.mockResolvedValue({
      id: 'measurement-id',
      registrationId: input.registrationId,
      registrationClassId: input.registrationClassId,
      value: 151.25,
      status: 'RECEIVED',
    });
    results.createFromMeasurement.mockResolvedValue({
      id: 'measurement-id',
      status: 'ACCEPTED',
      result: { id: 'result-id', value: 151.25, unit: 'DB', place: 1 },
    });

    const accepted = await service.accept('measurement-id', { place: 1, note: 'Проверено судьёй' }, judgeRequest);

    expect(accepted.status).toBe('ACCEPTED');
    expect(results.createFromMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: input.registrationId,
        registrationClassId: input.registrationClassId,
        value: 151.25,
        confirmed: true,
      }),
      'measurement-id',
      'Проверено судьёй',
      judgeRequest,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a unit that differs from the registered class unit', async () => {
    prisma.measurementSession.findUnique.mockResolvedValue(null);
    prisma.registration.findUnique.mockResolvedValue({
      id: input.registrationId,
      status: 'ACTIVE',
      stage: { id: 'stage-id', isDeleted: false },
      inspection: { status: 'PASSED' },
      classes: [{ id: input.registrationClassId, class: { id: 'class-id', name: 'Limited 2.0', unit: 'MPS' } }],
    });

    await expect(service.create(input, judgeRequest)).rejects.toThrow(
      'Единица измерения не совпадает с единицей класса',
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
