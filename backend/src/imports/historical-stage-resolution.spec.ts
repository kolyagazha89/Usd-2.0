import { jest } from '@jest/globals';
import {
  matchingArchiveStages,
  resolveHistoricalStage,
  archiveStageKey,
} from './historical-stage-resolution';
import { HISTORICAL_STAGE_MAPPINGS } from './historical-stage-mappings';
import { HISTORICAL_2025_TEXT_STAGES } from './historical-2025-text';
import type { ArchiveStage } from './global-historical-plan';
const sources: ArchiveStage[] = [
  ...HISTORICAL_STAGE_MAPPINGS,
  ...HISTORICAL_2025_TEXT_STAGES,
].map((s) => ({
  ...s,
  registrationSheet: null,
  resultsSheet: 'results',
  registrations: [],
  results: [],
}));
const candidate = (s: ArchiveStage, number: number) => ({
  id: s.year + ':' + s.date,
  stageNumber: number,
  name: s.name,
  city: s.city,
  date: new Date(s.date + 'T12:00:00Z'),
  legacyId: null as string | null,
});
describe('historical event identity independent of editable numbers', () => {
  it('matches every 2025 and 2026 event after chronological renumbering', () => {
    const all = [...sources].sort((a, b) => a.date.localeCompare(b.date));
    for (const year of [2025, 2026]) {
      const season = all.filter((s) => s.year === year),
        stored = season.map((s, i) => candidate(s, i + 1));
      for (const source of season)
        expect(matchingArchiveStages(source, stored).map((s) => s.id)).toEqual([
          source.year + ':' + source.date,
        ]);
    }
  });
  it('ignores unrelated events occupying the old source number', () => {
    const source = sources[0],
      correct = candidate(source, 1),
      wrong = {
        ...candidate(source, source.number),
        id: 'wrong',
        date: new Date('2026-05-30T12:00:00Z'),
        name: 'Ижевск',
        city: 'Ижевск',
      };
    expect(matchingArchiveStages(source, [wrong, correct])).toEqual([correct]);
  });
  it('reuses an existing final at any number and with a title-year suffix', () => {
    const source = sources.find(
      (s) => s.year === 2026 && s.name.includes('Финал'),
    )!;
    const final = {
      ...candidate(source, 10),
      name: 'USD Финал 2026 Волгоград',
    };
    expect(matchingArchiveStages(source, [final])).toEqual([final]);
  });
  it('keeps two Rostov events distinct and accepts ё/е and punctuation variants', () => {
    const rostov = sources.filter(
      (s) => s.year === 2026 && s.city === 'Ростов-на-Дону',
    );
    const stored = rostov.map((s, i) => ({
      ...candidate(s, i + 1),
      city: 'Ростов на Дону',
    }));
    for (const source of rostov)
      expect(
        matchingArchiveStages(source, stored)[0]
          .date.toISOString()
          .slice(0, 10),
      ).toBe(source.date);
    const orel = sources.find((s) => s.year === 2025 && s.city === 'Орёл')!;
    expect(
      matchingArchiveStages(orel, [{ ...candidate(orel, 5), city: 'Орел' }]),
    ).toHaveLength(1);
  });
  it('does not identify a different city by number or matching date', () => {
    const source = sources[0];
    expect(
      matchingArchiveStages(source, [
        {
          ...candidate(source, source.number),
          name: 'Другой этап',
          city: 'Другой город',
        },
      ]),
    ).toEqual([]);
  });
  it('returns both finals for explicit duplicate reconciliation rather than choosing the first row', () => {
    const source = sources.find(
      (s) => s.year === 2026 && s.name.includes('Финал'),
    )!;
    expect(
      matchingArchiveStages(source, [
        candidate(source, 10),
        { ...candidate(source, 12), id: 'duplicate' },
      ]),
    ).toHaveLength(2);
  });
  it('keeps a recognised changed-date event for the existing date protection', () => {
    const source = sources[0],
      stored = {
        ...candidate(source, 1),
        date: new Date('2026-01-01T12:00:00Z'),
      };
    expect(matchingArchiveStages(source, [stored])).toEqual([stored]);
    expect(archiveStageKey(source)).toBe(
      archiveStageKey({ ...source, number: 99 }),
    );
  });
});

describe('new historical event slots', () => {
  it('allocates a free number instead of overwriting an unrelated event occupying the source number', async () => {
    const source = sources[0],
      existing = {
        ...candidate(source, source.number),
        id: 'unrelated',
        name: 'Ижевск',
        city: 'Ижевск',
        date: new Date('2026-05-30T12:00:00Z'),
      };
    const create = jest.fn(async ({ data }: any) => ({
      id: 'created',
      ...data,
    }));
    const tx: any = {
      $executeRaw: jest.fn(async () => 0),
      stage: { findMany: jest.fn(async () => [existing]), create },
    };
    const db: any = { $transaction: async (fn: any) => fn(tx) };
    const result = await resolveHistoricalStage(db, source, 'season');
    expect(result.id).toBe('created');
    expect(result.stageNumber).toBe(source.number + 1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: source.name,
        date: new Date(source.date + 'T12:00:00Z'),
        legacyId: archiveStageKey(source),
      }),
    });
  });
});
