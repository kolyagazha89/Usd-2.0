import { createECDH, randomUUID } from 'node:crypto';
import { PushService } from './push.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { PushTransport } from './push.transport';
const testUrl = process.env.PUSH_TEST_DATABASE_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !/^\/usd_push_test(?:_[a-z0-9]+)?$/.test(url.pathname)
  )
    throw new Error(
      'Push integration requires an isolated loopback usd_push_test database',
    );
}
const enabled = Boolean(testUrl);
const suite = enabled ? describe : describe.skip;
suite('push PostgreSQL 18 consent, ownership and durable delivery', () => {
  let db: PrismaService, service: PushService;
  let owner: string, other: string;
  let deliveries = 0,
    outcome = 201;
  const subscription = () => ({
    endpoint: 'https://fcm.googleapis.com/test-' + randomUUID(),
    keys: {
      p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
      auth: Buffer.alloc(16, 7).toString('base64url'),
    },
    consent: true,
    consentVersion: 'web-push-v1',
    registrationOpen: true,
    reminders: true,
    announcements: true,
  });
  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.PUSH_TEST_DATABASE_URL;
    db = new PrismaService();
    await db.$connect();
    const version = await db.$queryRaw<
      Array<{ server_version_num: string }>
    >`SHOW server_version_num`;
    expect(Number(version[0].server_version_num)).toBeGreaterThanOrEqual(
      180000,
    );
    const transport = {
      configured: () => true,
      publicKey: () => 'test-public-key',
      validate: (data: any) => Promise.resolve(data),
      send: async () => {
        deliveries++;
        if (outcome !== 201)
          throw Object.assign(new Error('fixture'), { statusCode: outcome });
        return outcome;
      },
    } as unknown as PushTransport;
    service = new PushService(db, transport, new AuditService(db));
    owner = (
      await db.user.create({
        data: {
          email: randomUUID() + '@fixture.invalid',
          passwordHash: 'synthetic',
          emailVerifiedAt: new Date(),
        },
      })
    ).id;
    other = (
      await db.user.create({
        data: {
          email: randomUUID() + '@fixture.invalid',
          passwordHash: 'synthetic',
          emailVerifiedAt: new Date(),
        },
      })
    ).id;
  });
  afterAll(async () => {
    await db.pushMessage.deleteMany({ where: { createdByUserId: owner } });
    await db.user.deleteMany({ where: { id: { in: [owner, other] } } });
    await db.$disconnect();
  });
  beforeEach(async () => {
    await db.pushSubscription.deleteMany({
      where: { userId: { in: [owner, other] } },
    });
    await db.pushMessage.deleteMany({ where: { createdByUserId: owner } });
    deliveries = 0;
    outcome = 201;
  });
  it('requires explicit consent and rejects endpoint takeover/IDOR while hiding tokens', async () => {
    const data = subscription();
    await expect(
      service.subscribe(owner, { ...data, consent: false }),
    ).rejects.toThrow();
    const saved = await service.subscribe(owner, data);
    expect(JSON.stringify(await service.list(owner))).not.toContain(
      data.endpoint,
    );
    await expect(service.subscribe(other, data)).rejects.toThrow();
    await expect(service.remove(other, saved.id)).rejects.toThrow();
    await expect(
      service.preferences(other, saved.id, {
        registrationOpen: false,
        reminders: false,
        announcements: false,
      }),
    ).rejects.toThrow();
    expect((await service.list(other)).subscriptions).toHaveLength(0);
    await service.remove(owner, saved.id);
    expect((await service.list(owner)).subscriptions).toHaveLength(0);
  });
  it('queues each announcement once and skips delivery after preference withdrawal', async () => {
    const saved = await service.subscribe(owner, subscription());
    const input = {
      requestKey: randomUUID(),
      title: 'Этап USD',
      body: 'Тестовое объявление',
      path: '/news',
      confirmed: true,
    };
    const a = await service.announce(owner, input),
      b = await service.announce(owner, input);
    expect(a.id).toBe(b.id);
    expect(await db.pushDelivery.count({ where: { messageId: a.id } })).toBe(1);
    await service.preferences(owner, saved.id, {
      registrationOpen: true,
      reminders: true,
      announcements: false,
    });
    await service.processQueue();
    expect(deliveries).toBe(0);
    expect(
      (await db.pushDelivery.findFirstOrThrow({ where: { messageId: a.id } }))
        .status,
    ).toBe('SKIPPED');
  });
  it('retries temporary failures later and removes an expired subscription on 410', async () => {
    const saved = await service.subscribe(owner, subscription());
    const msg = await service.announce(owner, {
      requestKey: randomUUID(),
      title: 'USD',
      body: 'Напоминание',
      path: '/participant',
      confirmed: true,
    });
    outcome = 503;
    await service.processQueue();
    const row = await db.pushDelivery.findFirstOrThrow({
      where: { messageId: msg.id },
    });
    expect(row.status).toBe('RETRY');
    expect(row.attempts).toBe(1);
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    await service.processQueue();
    expect(deliveries).toBe(1);
    await db.pushDelivery.update({
      where: { id: row.id },
      data: { nextAttemptAt: new Date(0) },
    });
    outcome = 410;
    await service.processQueue();
    expect(
      await db.pushSubscription.findUnique({ where: { id: saved.id } }),
    ).toBeNull();
    expect(
      (await db.pushDelivery.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe('EXPIRED');
  });
  it('stops transient retries at five attempts and bounds recovery of abandoned leases', async () => {
    await service.subscribe(owner, subscription());
    const msg = await service.announce(owner, {
      requestKey: randomUUID(),
      title: 'USD',
      body: 'Повтор',
      path: '/news',
      confirmed: true,
    });
    const row = await db.pushDelivery.findFirstOrThrow({
      where: { messageId: msg.id },
    });
    outcome = 503;
    for (let attempt = 1; attempt <= 5; attempt++) {
      await db.pushDelivery.update({
        where: { id: row.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await service.processQueue();
    }
    expect(deliveries).toBe(5);
    expect(
      (await db.pushDelivery.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe('FAILED');
    await db.pushDelivery.update({
      where: { id: row.id },
      data: { status: 'SENDING', attempts: 5, leaseUntil: new Date(0) },
    });
    await service.processQueue();
    expect(deliveries).toBe(5);
    expect(
      (await db.pushDelivery.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe('FAILED');
    await db.pushDelivery.update({
      where: { id: row.id },
      data: { status: 'SENDING', attempts: 1, leaseUntil: new Date(0) },
    });
    outcome = 201;
    await service.processQueue();
    expect(deliveries).toBe(6);
    expect(
      (await db.pushDelivery.findUniqueOrThrow({ where: { id: row.id } }))
        .status,
    ).toBe('PROVIDER_ACCEPTED');
  });
  it('withdrawal and disabled accounts prevent already queued messages', async () => {
    const saved = await service.subscribe(owner, subscription());
    const msg = await service.announce(owner, {
      requestKey: randomUUID(),
      title: 'USD',
      body: 'Очередь',
      path: '/news',
      confirmed: true,
    });
    await service.remove(owner, saved.id);
    await service.processQueue();
    expect(deliveries).toBe(0);
    expect(
      (await db.pushDelivery.findFirstOrThrow({ where: { messageId: msg.id } }))
        .status,
    ).toBe('SKIPPED');
    await db.user.update({ where: { id: other }, data: { isActive: false } });
    await expect(service.subscribe(other, subscription())).rejects.toThrow();
    await db.user.update({ where: { id: other }, data: { isActive: true } });
  });
  it('claims a due delivery once across concurrent workers and records provider acceptance', async () => {
    await service.subscribe(owner, subscription());
    const msg = await service.announce(owner, {
      requestKey: randomUUID(),
      title: 'USD',
      body: 'Объявление',
      path: '/news',
      confirmed: true,
    });
    await Promise.all([service.processQueue(), service.processQueue()]);
    expect(deliveries).toBe(1);
    expect(
      (await db.pushDelivery.findFirstOrThrow({ where: { messageId: msg.id } }))
        .status,
    ).toBe('PROVIDER_ACCEPTED');
  });
  it('deduplicates opening hooks and calendar reminders, rechecking cancellations before dispatch', async () => {
    const season = await db.season.create({
      data: { name: 'Synthetic push test', year: 2997 },
    });
    const participant = await db.participant.create({
      data: { firstName: 'Synthetic', lastName: 'Push' },
    });
    const car = await db.car.create({
      data: {
        participantId: participant.id,
        brand: 'Fixture',
        model: 'Fixture',
        registrationNumber: 'TEST',
      },
    });
    const configuration = await db.carConfiguration.create({
      data: {
        carId: car.id,
        name: 'Fixture',
        versions: { create: { version: 1 } },
      },
      include: { versions: true },
    });
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 3);
    const stage = await db.stage.create({
      data: {
        seasonId: season.id,
        stageNumber: 1,
        name: 'Synthetic stage',
        date,
        status: 'PUBLISHED',
        registrationOpen: true,
      },
    });
    try {
      await db.user.update({
        where: { id: owner },
        data: { participantId: participant.id },
      });
      await service.subscribe(owner, subscription());
      const registration = await db.registration.create({
        data: {
          stageId: stage.id,
          participantId: participant.id,
          carId: car.id,
          configurationVersionId: configuration.versions[0].id,
          configurationSnapshot: {},
          participantNumber: 1,
          source: 'PRE_REGISTRATION',
        },
      });
      await service.registrationOpened(stage.id);
      await service.registrationOpened(stage.id);
      expect(
        await db.pushMessage.count({
          where: { eventKey: 'registration-open:' + stage.id },
        }),
      ).toBe(1);
      await service.schedule();
      await service.schedule();
      const reminder = await db.pushMessage.findFirstOrThrow({
        where: { stageId: stage.id, category: 'reminders' },
      });
      expect(
        await db.pushDelivery.count({ where: { messageId: reminder.id } }),
      ).toBe(1);
      const announcement = await service.announce(owner, {
        requestKey: randomUUID(),
        title: 'USD',
        body: 'Для этапа',
        path: '/stages/' + stage.id,
        stageId: stage.id,
        confirmed: true,
      });
      await db.registration.update({
        where: { id: registration.id },
        data: { status: 'CANCELLED' },
      });
      await db.stage.update({
        where: { id: stage.id },
        data: { registrationOpen: false },
      });
      await service.processQueue();
      expect(deliveries).toBe(0);
      expect(
        (
          await db.pushDelivery.findFirstOrThrow({
            where: { messageId: reminder.id },
          })
        ).status,
      ).toBe('SKIPPED');
      expect(
        (
          await db.pushDelivery.findFirstOrThrow({
            where: { messageId: announcement.id },
          })
        ).status,
      ).toBe('SKIPPED');
    } finally {
      await db.pushMessage.deleteMany({ where: { stageId: stage.id } });
      await db.registration.deleteMany({ where: { stageId: stage.id } });
      await db.user.update({
        where: { id: owner },
        data: { participantId: null },
      });
      await db.carConfiguration.delete({ where: { id: configuration.id } });
      await db.car.delete({ where: { id: car.id } });
      await db.participant.delete({ where: { id: participant.id } });
      await db.stage.delete({ where: { id: stage.id } });
      await db.season.delete({ where: { id: season.id } });
    }
  });
});
