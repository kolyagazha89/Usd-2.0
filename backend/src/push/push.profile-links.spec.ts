import { jest } from '@jest/globals';
import { PushService } from './push.service';

describe('administrator profile link notifications', () => {
  const fixture = () => {
    const messages = new Map<string, any>();
    const db: any = {
      profileLinkRequest: { findMany: jest.fn(async () => [{ id: 'claim' }]), findUnique: jest.fn(async () => ({ status: 'PENDING' })) },
      auditLog: { findMany: jest.fn(async () => [{ id: 'audit', entityId: 'participant' }]) },
      pushSubscription: { findMany: jest.fn(async () => [{ id: 'admin-device' }]) },
      pushMessage: {
        findUnique: jest.fn(async ({ where }: any) => messages.get(where.eventKey)),
        create: jest.fn(async ({ data }: any) => { messages.set(data.eventKey, data); return data; }),
      },
    };
    db.$transaction = async (fn: any) => fn(db);
    const transport: any = { configured: () => true, send: jest.fn(async () => 201) };
    return { db, transport, service: new PushService(db, transport, {} as any) };
  };

  it('recovers pending requests and committed links from durable records without duplicate messages', async () => {
    const { db, service } = fixture();
    await service.scheduleProfileLinks();
    await service.scheduleProfileLinks();
    expect(db.pushMessage.create).toHaveBeenCalledTimes(2);
    expect(db.pushMessage.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      eventKey: 'profile-link-request:claim', category: 'profileLinks', path: '/admin/profile-links',
    }) }));
    expect(db.pushSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      announcements: true, user: { role: 'ADMIN', isActive: true, emailVerifiedAt: { not: null } },
    }) }));
    expect(db.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      action: { in: ['PARTICIPANT_PROFILE_LINKED', 'PROFILE_LINK_APPROVED'] },
    }) }));
  });

  it('does nothing when push transport is disabled', async () => {
    const { db, transport, service } = fixture();
    transport.configured = () => false;
    await service.scheduleProfileLinks();
    expect(db.profileLinkRequest.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['ADMIN', true, 'PENDING', true],
    ['PARTICIPANT', true, 'PENDING', false],
    ['JUDGE', true, 'PENDING', false],
    ['ADMIN', false, 'PENDING', false],
    ['ADMIN', true, 'APPROVED', false],
    ['ADMIN', true, undefined, false],
  ])('rechecks current role %s, consent %s and request state %s before delivery', async (role, announcements, status, sends) => {
    const { db, transport, service } = fixture();
    db.profileLinkRequest.findUnique = jest.fn(async () => status ? { status } : null);
    db.pushDelivery = {
      findMany: async () => [{ id: 'delivery', status: 'PENDING', attempts: 0, subscriptionId: 'device', message: {
        id: 'message', eventKey: 'profile-link-request:claim', category: 'profileLinks', createdAt: new Date(),
        title: 'USD', body: 'Новая заявка', path: '/admin/profile-links',
      } }],
      updateMany: async () => ({ count: 1 }), update: jest.fn(async () => ({})),
    };
    db.pushSubscription.findUnique = async () => ({ userId: 'admin', announcements, user: { role, isActive: true, emailVerifiedAt: new Date() } });
    await service.processQueue();
    expect(transport.send).toHaveBeenCalledTimes(sends ? 1 : 0);
    expect(db.pushDelivery.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: sends ? 'PROVIDER_ACCEPTED' : 'SKIPPED' }) }));
  });
});
