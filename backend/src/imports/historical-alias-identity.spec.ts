import { jest } from '@jest/globals';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { ImportsService } from './imports.service';
import { archivalAliasDisplayLabel, archivalAliasKey, historicalAliasStickerDiscriminators } from './historical-alias-identity';

const names = new NameNormalizerService();
const source = (id: string, alias: string, className: string, sticker: number) => ({
  id, type: 'RESULT', rawData: { 'ФИО': alias, 'Класс': className, 'Номер': sticker },
  normalizedData: { class: { classId: className }, participantNumber: sticker },
});

describe('confirmed historical nickname display', () => {
  it('uses the Cyrillic Registration spelling without changing the source identity hash', async () => {
    expect(archivalAliasDisplayLabel('Ksy Aperol')).toBe('Ксю Апероль');
    expect(archivalAliasDisplayLabel('34sound')).toBe('34sound');
    const service = new ImportsService({} as never, names) as unknown as {
      createHistoricalAliasParticipant: (tx: unknown, stage: string, alias: string) => Promise<unknown>;
    };
    const upsert = jest.fn(async () => ({ id: 'old-profile' }));
    await service.createHistoricalAliasParticipant({ participant: { upsert } }, 'stage-2026-final', 'Ksy Aperol');
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        lastName: 'Ксю Апероль', firstName: '', historicalAlias: 'Ксю Апероль',
      }),
    }));
  });
});

describe('historical alias conflicting source stickers', () => {
  it('keeps two BassRace 149.9 performers separate, reusing the sticker in another class', () => {
    const rows = [
      source('mad-x', 'Bassmarket', 'Mad-x', 157),
      source('first', 'Bass Market', 'BassRace 149.9', 157),
      source('second', 'Bassmarket', 'BassRace 149.9', 105),
      source('unrelated', '34 Sound', 'BassRace 149.9', 40),
    ];
    const discriminators = historicalAliasStickerDiscriminators(rows, names);
    expect(discriminators.get('mad-x')).toBe('number:157');
    expect(discriminators.get('first')).toBe('number:157');
    expect(discriminators.get('second')).toBe('number:105');
    expect(discriminators.has('unrelated')).toBe(false);
    expect(archivalAliasKey('Bass Market')).toBe(archivalAliasKey('Bassmarket'));
    expect(archivalAliasKey('34 Sound')).toBe(archivalAliasKey('34sound'));
  });

  it('does not split one alias between classes when there is no same-class sticker collision', () => {
    const discriminators = historicalAliasStickerDiscriminators([
      source('a', '34sound', 'Mad-x', 21),
      source('b', '34 Sound', 'BassRace 149.9', 22),
    ], names);
    expect(discriminators.size).toBe(0);
  });

  it('does not assume two similar real people are aliases', () => {
    const discriminators = historicalAliasStickerDiscriminators([
      source('a', 'Иванов Иван', 'Mad-x', 10),
      source('b', 'Иванов Иван', 'Mad-x', 11),
    ], names);
    expect(discriminators.size).toBe(0);
  });

  it('creates different stage-scoped identities for distinct conflicting stickers', async () => {
    const upsert = jest.fn<(...args: any[]) => Promise<unknown>>().mockResolvedValue({ id: 'participant' });
    const service = new ImportsService({} as never, names) as unknown as {
      createHistoricalAliasParticipant: (
        tx: unknown, stage: string, alias: string, sticker?: string,
      ) => Promise<unknown>;
    };
    const tx = { participant: { upsert } };
    await service.createHistoricalAliasParticipant(tx, 'stage', 'Bass Market', 'number:157');
    await service.createHistoricalAliasParticipant(tx, 'stage', 'Bassmarket', 'number:157');
    await service.createHistoricalAliasParticipant(tx, 'stage', 'Bassmarket', 'number:105');
    const keys = upsert.mock.calls.map(args => args[0].where.legacyId);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).not.toBe(keys[2]);
  });
});
