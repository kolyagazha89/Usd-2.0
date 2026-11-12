import { jest } from '@jest/globals';
import { ParticipantsService } from './participants.service';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

const req = (sub: string) => ({ user: { sub } }) as AuthenticatedRequest;

describe('ADMIN participant email visibility', () => {
  it('shows account email on linked profiles and archival email on unlinked profiles', async () => {
    const db: any = {
      user: { findUnique: jest.fn(async () => ({ id: 'admin', role: 'ADMIN', isActive: true, customRoleId: null })) },
      participant: { findMany: jest.fn(async () => [
        { id: 'linked', lastName: 'Test', firstName: 'One', user: { id: 'user1', email: 'new@usd.invalid' } },
        { id: 'historical', lastName: 'Test', firstName: 'Two', user: null },
        { id: 'empty', lastName: 'Test', firstName: 'Three', user: null },
      ]) },
      participantLegacyEmail: { findMany: jest.fn(async () => [
        { participantId: 'linked', email: 'old@usd.invalid' },
        { participantId: 'historical', email: '  saved@usd.invalid  ' },
        { participantId: 'empty', email: '   ' },
      ]) },
    };
    const profiles = await new ParticipantsService(db).findAllAdmin(req('admin'));
    expect((profiles as Array<{ id: string; email?: string | null; emailSource?: string | null }>).map(profile => [profile.id, profile.email, profile.emailSource])).toEqual([
      ['linked', 'new@usd.invalid', 'ACCOUNT'],
      ['historical', 'saved@usd.invalid', 'HISTORICAL'],
      ['empty', null, null],
    ]);
  });

  it('does not query or return archived emails for delegated roles', async () => {
    const db: any = {
      user: { findUnique: jest.fn(async () => ({ id: 'judge', role: 'PARTICIPANT', isActive: true, customRoleId: 'judge-role' })) },
      participant: { findMany: jest.fn(async ({ select }: any) => {
        // Mimic Prisma's select removing User.email when the role is delegated.
        const user = select.user.select.email ? { id: 'u', email: 'secret@usd.invalid' } : { id: 'u' };
        return [{ id: 'p', lastName: 'Test', firstName: 'One', user }];
      }) },
      participantLegacyEmail: { findMany: jest.fn(async () => { throw Error('archive should not be queried'); }) },
    };
    const profiles = await new ParticipantsService(db).findAllAdmin(req('judge'));
    expect(JSON.stringify(profiles)).not.toContain('@usd.invalid');
    expect(Object.hasOwn(profiles[0], 'email')).toBe(false);
    expect(db.participantLegacyEmail.findMany).not.toHaveBeenCalled();
  });
});
