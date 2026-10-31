import { jest } from '@jest/globals';
import { PushService } from './push.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PushTransport } from './push.transport';
import type { AuditService } from '../common/audit/audit.service';

describe('queued reminder calendar validity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-30T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it.each([
    ['tomorrow', '2026-10-31', 1, 'PUBLISHED', 'PROVIDER_ACCEPTED'],
    ['three days', '2026-11-02', 3, 'PUBLISHED', 'PROVIDER_ACCEPTED'],
    ['rescheduled later', '2026-11-30', 1, 'PUBLISHED', 'SKIPPED'],
    ['rescheduled closer', '2026-10-31', 3, 'PUBLISHED', 'SKIPPED'],
    ['outdated three-day wording', '2026-11-01', 3, 'PUBLISHED', 'SKIPPED'],
    ['completed stage', '2026-10-31', 1, 'COMPLETED', 'SKIPPED'],
    ['past stage', '2026-10-29', 1, 'PUBLISHED', 'SKIPPED'],
  ])('%s: %s', async (_label, currentDate, originalDays, status, expected) => {
    const originalDate = originalDays === 3 ? '2026-11-02' : '2026-10-31';
    const delivery = {
      id: 'delivery',
      subscriptionId: 'subscription',
      status: 'PENDING',
      attempts: 0,
      message: {
        id: 'message',
        stageId: 'stage',
        category: 'reminders',
        eventKey: `reminder:stage:${originalDate}:${originalDays}`,
        title: 'Этап USD',
        body: 'Synthetic stage',
        path: '/stages/stage',
        createdAt: new Date(),
      },
    };
    const update = jest
      .fn<(...args: any[]) => Promise<any>>()
      .mockResolvedValue({});
    const send = jest
      .fn<(...args: any[]) => Promise<number>>()
      .mockResolvedValue(201);
    const db = {
      pushDelivery: {
        findMany: async () => [delivery],
        updateMany: async () => ({ count: 1 }),
        update,
      },
      pushSubscription: {
        findUnique: async () => ({
          userId: 'user',
          reminders: true,
          endpoint: 'https://fcm.googleapis.com/synthetic',
          p256dh: 'synthetic',
          auth: 'synthetic',
          user: { isActive: true, emailVerifiedAt: new Date() },
        }),
      },
      stage: {
        findFirst: async () => ({
          id: 'stage',
          date: new Date(`${currentDate}T15:00:00Z`),
          status,
        }),
      },
      registration: { findFirst: async () => ({ id: 'active-registration' }) },
    } as unknown as PrismaService;
    const service = new PushService(
      db,
      {
        configured: () => true,
        send,
      } as unknown as PushTransport,
      {} as AuditService,
    );

    await service.processQueue();

    expect(send).toHaveBeenCalledTimes(
      expected === 'PROVIDER_ACCEPTED' ? 1 : 0,
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: delivery.id },
        data: expect.objectContaining({ status: expected }),
      }),
    );
  });
});
