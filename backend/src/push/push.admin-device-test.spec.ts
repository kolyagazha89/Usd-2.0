import { jest } from '@jest/globals';
import { PushService } from './push.service';
import { PushAdminController } from './push.controller';
import { ROLES_KEY } from '../auth/roles.decorator';
import type { PrismaService } from '../prisma/prisma.service';
import type { PushTransport } from './push.transport';
import type { AuditService } from '../common/audit/audit.service';

describe('ADMIN real push device test', () => {
  const endpoint = 'https://fcm.googleapis.com/owned-browser-token';
  const record = { id: 'own-subscription', endpoint, p256dh: 'fixture-p256dh', auth: 'fixture-auth' };

  function setup({ enabled = true, present = true, providerCode = 201 }: {
    enabled?: boolean; present?: boolean; providerCode?: number;
  } = {}) {
    const findFirst = jest.fn(async () => present ? record : null);
    const deleteMany = jest.fn(async () => ({ count: 1 }));
    const db = { pushSubscription: { findFirst, deleteMany } };
    const send = jest.fn(async () => {
      if (providerCode !== 201) throw Object.assign(new Error('provider private data'), { statusCode: providerCode });
      return 201;
    });
    const transport = { configured: () => enabled, send };
    const audit = { log: jest.fn(async () => undefined) };
    const service = new PushService(
      db as unknown as PrismaService,
      transport as unknown as PushTransport,
      audit as unknown as AuditService,
    );
    return { service, db, transport, audit, findFirst, deleteMany, send };
  }

  it('requires ADMIN for real device test endpoint', () => {
    expect(Reflect.getMetadata(ROLES_KEY, PushAdminController.prototype.testCurrentDevice))
      .toEqual(['ADMIN']);
  });

  it('sends only to an active, verified subscription belonging to the authenticated user', async () => {
    const { service, findFirst, send, audit } = setup();
    const result = await service.testCurrentDevice('current-admin', endpoint);
    expect(result).toMatchObject({ success: true, providerAccepted: true, deliveryConfirmed: false });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: 'current-admin',
        endpoint,
        user: { isActive: true, emailVerifiedAt: { not: null } },
      },
    }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      { endpoint, keys: { p256dh: record.p256dh, auth: record.auth } },
      expect.objectContaining({ path: '/', tag: 'usd-admin-device-test' }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'current-admin',
      action: 'PUSH_DEVICE_TEST_ACCEPTED',
      entityId: record.id,
    }));
  });

  it('does not send to unregistered or another account\'s browser', async () => {
    const { service, send } = setup({ present: false });
    await expect(service.testCurrentDevice('current-admin', endpoint)).rejects.toMatchObject({ status: 400 });
    expect(send).not.toHaveBeenCalled();
  });

  it('blocks unconfigured transport and invalid endpoint before database access', async () => {
    const disabled = setup({ enabled: false });
    await expect(disabled.service.testCurrentDevice('admin', endpoint))
      .rejects.toMatchObject({ status: 503 });
    expect(disabled.findFirst).not.toHaveBeenCalled();
    const available = setup();
    await expect(available.service.testCurrentDevice('admin', '//unsafe-url'))
      .rejects.toMatchObject({ status: 400 });
    expect(available.findFirst).not.toHaveBeenCalled();
  });

  it('throttles repeat clicks without accidentally sending twice', async () => {
    const { service, send } = setup();
    await service.testCurrentDevice('admin', endpoint);
    await expect(service.testCurrentDevice('admin', endpoint))
      .rejects.toMatchObject({ status: 429 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('invalidates only the owner\'s expired browser subscription on provider 410', async () => {
    const { service, deleteMany, send } = setup({ providerCode: 410 });
    await expect(service.testCurrentDevice('admin', endpoint))
      .rejects.toMatchObject({ status: 410 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: record.id, userId: 'admin' },
    });
  });
});
