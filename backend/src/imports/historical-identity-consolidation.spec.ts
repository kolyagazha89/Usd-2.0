import { jest } from '@jest/globals';
import { createHash } from 'crypto';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { ImportsService } from './imports.service';
import { consolidateApprovedHistoricalIdentities } from './historical-identity-consolidation';

const names = new NameNormalizerService();
const hash = (part: string) => 'HISTORICAL_ALIAS:' + createHash('sha256').update(part).digest('hex');
const p = (id: string, alias: string, stage: string) => ({
  id, lastName: alias, firstName: '', middleName: null, createdAt: new Date(stage),
  legacyId: hash(stage + ':' + alias.toLowerCase()), historicalAlias: alias,
  phone: null, photoUrl: null, birthDate: null, user: null,
  registrations: [{ source: 'IMPORT' }],
});

function setup(people: any[], opts: { sameStageInspections?: boolean; conflictingClassStickers?: boolean; emails?: Array<{ participantId: string; email: string }>; protectedUser?: boolean } = {}) {
  let current = people.map(item => ({ ...item }));
  if (opts.protectedUser) current[1].user = { id: 'owner' };
  const updates: Array<{ model: string; args: any }> = [];
  const write = (model: string) => jest.fn(async (args: any) => {
    updates.push({ model, args });
    return { count: 1 };
  });
  const participant = {
    findMany: jest.fn(async () => current),
    update: jest.fn(async (args: any) => { updates.push({ model: 'participant.update', args }); return {}; }),
    deleteMany: jest.fn(async (args: any) => { updates.push({ model: 'participant.deleteMany', args }); return { count: 1 }; }),
  };
  const emails = opts.emails ?? [];
  const db:any = {
    participant,
    car: { updateMany: write('car') },
    registration: {
      updateMany: write('registration'),
      findMany: jest.fn(async () => opts.conflictingClassStickers ? [
        { participantId: 'a', stageId: 'one', participantNumber: 157, classes: [{ classId: 'bassrace149' }] },
        { participantId: 'b', stageId: 'one', participantNumber: 105, classes: [{ classId: 'bassrace149' }] },
      ] : []),
    },
    record: { updateMany: write('record') },
    disqualification: { updateMany: write('disqualification') },
    participantStageInspection: {
      findMany: jest.fn(async () => opts.sameStageInspections
        ? [{ participantId: 'a', stageId: 'stage' }, { participantId: 'b', stageId: 'stage' }]
        : [{ participantId: 'a', stageId: 'stage-a' }, { participantId: 'b', stageId: 'stage-b' }]),
      updateMany: write('participantStageInspection'),
    },
    importRow: { updateMany: write('importRow') },
    participantLegacyEmail: {
      findMany: jest.fn(async () => emails),
      upsert: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({})),
    },
    $queryRaw: jest.fn(async () => []),
  };
  db.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) => cb(db));
  return { db, updates, participant };
}

describe('historical identity consolidation', () => {
  it('reuses a single profile across five stages, preserving all linked historical rows', async () => {
    const items = Array.from({ length: 5 }, (_, i) => p(String.fromCharCode(97 + i),
      i % 2 ? '34 Sound' : '34sound', '2026-01-0' + (i + 1)));
    const { db, updates, participant } = setup(items);
    const result = await consolidateApprovedHistoricalIdentities(db, names);
    expect(result).toEqual({ groupsMerged: 1, profilesMerged: 4, skipped: [] });
    const survivor = 'a';
    for (const model of ['car','registration','record','disqualification','participantStageInspection','importRow']) {
      expect(updates).toContainEqual(expect.objectContaining({
        model, args: { where: { participantId: { in: ['b', 'c', 'd', 'e'] } }, data: { participantId: survivor } },
      }));
    }
    expect(participant.deleteMany).toHaveBeenCalledTimes(1);
    expect(participant.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: survivor },
      data: expect.objectContaining({
        legacyId: hash('GLOBAL:34sound'), lastName: '34 Sound', historicalAlias: '34 Sound',
      }),
    }));
  });

  it('does not consolidate an on-site registration even when archive aliases match', async () => {
    const { db, participant } = setup([p('a','34sound','2026-01-01'),p('b','34 Sound','2026-01-02')]);
    const entries = await db.participant.findMany();
    entries[1].registrations[0].source = 'ON_SITE';
    const summary = await consolidateApprovedHistoricalIdentities(db, names);
    expect(summary.profilesMerged).toBe(0);
    expect(summary.skipped[0].reason).toMatch(/защищённые/);
    expect(participant.deleteMany).not.toHaveBeenCalled();
  });

  it('protects two real competitors sharing an archive alias and class with different stickers', async () => {
    const { db, participant } = setup([p('a','34sound','2026-01-01'),p('b','34 Sound','2026-01-02')],{ conflictingClassStickers:true });
    const result = await consolidateApprovedHistoricalIdentities(db, names);
    expect(result.profilesMerged).toBe(0);
    expect(result.skipped[0].reason).toMatch(/разными номерами/);
    expect(participant.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to merge a duplicate tied to a real account', async () => {
    const { db, participant } = setup([p('a','34sound','2026-01-01'),p('b','34 Sound','2026-01-02')],{ protectedUser:true });
    const result = await consolidateApprovedHistoricalIdentities(db, names);
    expect(result.profilesMerged).toBe(0);
    expect(result.skipped[0].reason).toMatch(/защищённые/);
    expect(participant.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses conflicting stage inspections and keeps all results unchanged', async () => {
    const { db, participant } = setup([p('a','34sound','2026-01-01'),p('b','34 Sound','2026-01-02')],{ sameStageInspections:true });
    const result = await consolidateApprovedHistoricalIdentities(db, names);
    expect(result.profilesMerged).toBe(0);
    expect(result.skipped[0].reason).toMatch(/техосмотры/);
    expect(participant.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses distinct legacy emails rather than guessing who owns them', async () => {
    const { db, participant } = setup([p('a','34sound','2026-01-01'),p('b','34 Sound','2026-01-02')],{
      emails: [{ participantId: 'a', email: 'alice@example.com' },{ participantId: 'b', email: 'bob@example.com' }],
    });
    const result = await consolidateApprovedHistoricalIdentities(db, names);
    expect(result.skipped[0].reason).toMatch(/email/);
    expect(participant.deleteMany).not.toHaveBeenCalled();
  });

  it('uses a common legacy identity for the same alias on different stages', async () => {
    const service = new ImportsService({} as never, names) as unknown as {
      createHistoricalAliasParticipant: (
        tx: unknown, stage: string, alias: string, sticker?: string,
      ) => Promise<unknown>;
    };
    const ids: string[] = [];
    const tx = { participant: { upsert: jest.fn(async (arg: any) => {
      ids.push(arg.where.legacyId as string);
      return { id: 'single-profile' };
    }) } };
    await service.createHistoricalAliasParticipant(tx, 'stage-1', '34sound');
    await service.createHistoricalAliasParticipant(tx, 'stage-2', '34 Sound');
    await service.createHistoricalAliasParticipant(tx, 'stage-3', '34 Sound');
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(hash('GLOBAL:34sound'));
  });

  it('does not merge Bassmarket labels globally because the archive has conflicting identities', async () => {
    const service = new ImportsService({} as never, names) as unknown as {
      createHistoricalAliasParticipant: (tx: unknown, stage: string, alias: string) => Promise<unknown>;
    };
    const ids: string[] = [];
    const tx = { participant: { upsert: jest.fn(async (arg: any) => {
      ids.push(arg.where.legacyId);
      return { id: 'profile' };
    }) } };
    await service.createHistoricalAliasParticipant(tx, 'stage-1', 'Bass Market');
    await service.createHistoricalAliasParticipant(tx, 'stage-2', 'Bassmarket');
    expect(ids[0]).not.toBe(ids[1]);
  });
});
