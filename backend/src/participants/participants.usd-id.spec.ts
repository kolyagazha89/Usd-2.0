import { jest } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { ParticipantsService } from './participants.service';
import { InspectionsService } from '../inspections/inspections.service';

describe('permanent USD ID security and stage resolution', () => {
 const prisma: any = {
  user: { findUnique: jest.fn() },
  participant: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), updateMany: jest.fn(), update: jest.fn() },
 };
 const actor: any = { user: { sub: 'user-1', role: 'PARTICIPANT' } };
 beforeEach(() => {
  jest.clearAllMocks();
  prisma.user.findUnique.mockResolvedValue({ id: 'user-1', participantId: 'p1', role: 'PARTICIPANT', customRoleId: null, isActive: true });
 });

 it('issues a random opaque token once for an existing historical profile', async () => {
  prisma.participant.findUnique.mockResolvedValue({ usdIdToken: null });
  prisma.participant.updateMany.mockResolvedValue({ count: 1 });
  prisma.participant.findUniqueOrThrow.mockResolvedValue({ usdIdToken: 'a'.repeat(48) });
  const result = await new ParticipantsService(prisma).getMyUsdId(actor);
  expect(result.path).toBe('/usd-id/' + 'a'.repeat(48));
  const write = prisma.participant.updateMany.mock.calls[0][0] as any;
  expect(write.where).toEqual({ id: 'p1', usdIdToken: null });
  expect(write.data.usdIdToken).toMatch(/^[a-f0-9]{48}$/);
  expect(write.data.usdIdToken).not.toBe('p1');
 });

 it('does not rotate an already provisioned ID on a normal read', async () => {
  prisma.participant.findUnique.mockResolvedValue({ usdIdToken: 'b'.repeat(48) });
  prisma.participant.findUniqueOrThrow.mockResolvedValue({ usdIdToken: 'b'.repeat(48) });
  await new ParticipantsService(prisma).getMyUsdId(actor);
  expect(prisma.participant.updateMany).not.toHaveBeenCalled();
 });

 it('rotates only the authenticated participant token, invalidating old QR', async () => {
  prisma.participant.update.mockResolvedValue({ usdIdToken: 'c'.repeat(48) });
  const result = await new ParticipantsService(prisma).rotateMyUsdId(actor);
  expect(result.token).toBe('c'.repeat(48));
  const update = prisma.participant.update.mock.calls[0][0] as any;
  expect(update.where).toEqual({ id: 'p1' });
  expect(update.data.usdIdToken).toMatch(/^[a-f0-9]{48}$/);
 });

 it('staff QR lookup is stage-scoped and never selects phone, email or birth date', async () => {
  prisma.participant.findUnique.mockResolvedValue({ id: 'p1', firstName: 'Иван', lastName: 'Иванов', registrations: [] });
  const result = await new InspectionsService(prisma).resolveUsdId('d'.repeat(48), 'stage-1');
  expect(result.id).toBe('p1');
  const query = prisma.participant.findUnique.mock.calls[0][0] as any;
  expect(query.where).toEqual({ usdIdToken: 'd'.repeat(48) });
  expect(query.select).not.toHaveProperty('phone');
  expect(query.select).not.toHaveProperty('user');
  expect(query.select).not.toHaveProperty('birthDate');
  expect(query.select.registrations.where).toEqual({ status: 'ACTIVE', stage: { isDeleted: false }, stageId: 'stage-1' });
 });

 it('does not query the database for a malformed QR token', async () => {
  await expect(new InspectionsService(prisma).resolveUsdId('not-a-token')).rejects.toBeInstanceOf(NotFoundException);
  expect(prisma.participant.findUnique).not.toHaveBeenCalled();
 });
});
