import { jest } from '@jest/globals';
import { ProfileLinksService } from './profile-links.service';

describe('ADMIN historical email coverage', () => {
  it('counts historical email availability separately from account confirmations, without returning email addresses', async () => {
    const db: any = {
      $queryRaw: jest.fn(async () => [{
        totalProfiles: 120,
        linkedProfiles: 15,
        unlinkedProfiles: 105,
        profilesWithLegacyEmail: 42,
        unlinkedWithLegacyEmail: 34,
        unlinkedWithoutLegacyEmail: 71,
      }]),
    };
    const coverage = await new ProfileLinksService(db).adminEmailCoverage();
    expect(coverage).toEqual({
      totalProfiles: 120,
      linkedProfiles: 15,
      unlinkedProfiles: 105,
      profilesWithLegacyEmail: 42,
      unlinkedWithLegacyEmail: 34,
      unlinkedWithoutLegacyEmail: 71,
    });
    expect(JSON.stringify(coverage)).not.toContain('@');
  });

  it('returns zero counters for an empty database and never guesses an email match', async () => {
    const db: any = { $queryRaw: jest.fn(async () => []) };
    const coverage = await new ProfileLinksService(db).adminEmailCoverage();
    expect(coverage).toEqual({
      totalProfiles: 0,
      linkedProfiles: 0,
      unlinkedProfiles: 0,
      profilesWithLegacyEmail: 0,
      unlinkedWithLegacyEmail: 0,
      unlinkedWithoutLegacyEmail: 0,
    });
  });
});
