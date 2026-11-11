import { jest } from '@jest/globals';
import { RegistrationsService } from './registrations.service';

describe('registration cancellation concurrency', () => {
  const request: any = { user: { sub: 'admin', role: 'ADMIN' } };

  function setup(current: Record<string, unknown>) {
    const registration = {
      id: 'registration-1', stageId: 'stage-1', participantId: 'participant-1',
      carId: 'car-1', participantNumber: 8, status: 'ACTIVE', results: [],
      stage: { id: 'stage-1', status: 'PUBLISHED' },
    };
    const tx: any = {
      $executeRaw: jest.fn(),
      registration: {
        findUnique: jest.fn().mockResolvedValue({ ...registration, ...current }),
        aggregate: jest.fn().mockResolvedValue({ _min: { participantNumber: 0 } }),
        update: jest.fn().mockResolvedValue({ ...registration, status: 'CANCELLED' }),
      },
      registrationClass: { deleteMany: jest.fn() },
      registrationNumber: { deleteMany: jest.fn() },
      inspection: { deleteMany: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma: any = {
      // This lookup precedes acquisition of the locks. Another request may
      // change the registration before the transaction gets to run.
      registration: { findUnique: jest.fn().mockResolvedValue(registration) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
    };
    return { service: new RegistrationsService(prisma), tx };
  }

  it.each([
    [{ results: [{ id: 'new-result' }] }, 'уже внесён результат'],
    [{ status: 'CANCELLED' }, 'уже отменена'],
    [{ stage: { id: 'stage-1', status: 'COMPLETED' } }, 'после завершения этапа'],
  ])('rechecks changed state before releasing numbers and cascading class deletion', async (current, message) => {
    const { service, tx } = setup(current as Record<string, unknown>);
    await expect(service.cancel('registration-1', request)).rejects.toThrow(message as string);
    expect(tx.registrationClass.deleteMany).not.toHaveBeenCalled();
    expect(tx.registrationNumber.deleteMany).not.toHaveBeenCalled();
    expect(tx.registration.update).not.toHaveBeenCalled();
  });

  it('keeps successful cancellation and negative archival numbering', async () => {
    const { service, tx } = setup({});
    await expect(service.cancel('registration-1', request)).resolves.toEqual(
      expect.objectContaining({ status: 'CANCELLED' }),
    );
    expect(tx.registration.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { status: 'CANCELLED', participantNumber: -1 },
    }));
    const lockIds = tx.$executeRaw.mock.calls.flatMap((call: any[]) => call.slice(1));
    expect(lockIds).toEqual(['stage-1', 'registration-1']);
  });
});
