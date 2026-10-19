import { jest } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { ImportsService } from './imports.service';
import { buildGlobalHistoricalPlan, archiveNameKey } from './global-historical-plan';
import { auditHistoricalDuplicates } from './historical-duplicate-audit';

const names = new NameNormalizerService();
const resultHeader = ['Класс', 'Место', 'Номер', 'Результат', 'ФИО'];
const source = (first: Array<unknown[]>, second: Array<unknown[]>) => JSON.stringify({
  'USD _ Результаты.xlsx': {
    final_volgograd2025: [resultHeader, ...first],
    open_volgograd2026: [resultHeader, ...second],
  },
  'USD _ Регистрация.xlsx': {},
});

describe('archive duplicate prevention', () => {
  it('normalizes a verified source spelling before grouping identities', () => {
    expect(names.inspect('Smoliyaninov Valentin')).toMatchObject({
      normalized: 'Смольянинов Валентин', needsReview: false,
    });
    expect(archiveNameKey('Smoliyaninov Valentin', names))
      .toBe(archiveNameKey('Смольянинов Валентин', names));
  });

  it.each([
    ['Belyi Ivan', 'Белый Иван'],
    ['Bobrovsky Sergey', 'Бобровский Сергей'],
    ['Gladovsky Stanislav', 'Гладовский Станислав'],
    ['Nikitinsky Nikolay', 'Никитинский Николай'],
    ['Nashansky Sergey', 'Нашанский Сергей'],
    ['Pshenichnyi Vladislav', 'Пшеничный Владислав'],
    ['Veliky Yryi', 'Великий Юрий'],
    ['Geyn Roman', 'Гейн Роман'],
  ])('corrects a source transliteration suffix for %s', (raw, expected) => {
    expect(names.inspect(raw)).toMatchObject({ normalized: expected, needsReview: false });
  });

  it.each(['34sound', '34 Sound', 'Bassmarket', 'Bass Market',
    'Caraudio Bryansk', 'CarAudio Bryansk', 'Car Audio Bryansk'])(
    'does not silently convert archival business labels to real FIO: %s', label => {
      expect(names.inspect(label).needsReview).toBe(true);
    },
  );

  it('joins only the three operator-approved identities while retaining every result row', () => {
    const plan = buildGlobalHistoricalPlan(source(
      [
        ['Coffin', 1, 10, 151, 'Dergunova Dariya'],
        ['Coffin', 2, 11, 149, 'Latishev Malsim'],
        ['Coffin', 3, 12, 147, 'Dmitry Nikrasov'],
        ['Coffin', 4, 13, 146, '34sound'],
      ],
      [
        ['Coffin', 1, 20, 155, 'Дергунова Дарья'],
        ['Coffin', 2, 21, 151, 'Latyshev Maksim'],
        ['Coffin', 3, 22, 148, 'Nekrasov Dmitry'],
        ['Coffin', 4, 23, 149, '34 Sound'],
      ],
    ), names);
    const audit = auditHistoricalDuplicates(plan, names);
    expect(audit.confirmedPeople).toEqual([
      expect.objectContaining({ canonical: 'Дергунова Дарья', resultRows: 2 }),
      expect.objectContaining({ canonical: 'Латышев Максим', resultRows: 2 }),
      expect.objectContaining({ canonical: 'Некрасов Дмитрий', resultRows: 2 }),
    ]);
    for (const pair of [
      ['Dergunova Dariya', 'Дергунова Дарья'],
      ['Latishev Malsim', 'Latyshev Maksim'],
      ['Dmitry Nikrasov', 'Nekrasov Dmitry'],
    ]) {
      expect(archiveNameKey(pair[0], names)).toBe(archiveNameKey(pair[1], names));
      const matching = plan.people.find(p => p.key === archiveNameKey(pair[1], names));
      expect(matching?.resultRows).toBe(2);
      expect(matching?.names).toEqual(expect.arrayContaining(pair));
    }
    expect(plan.stages[0].results[0]._archiveOriginalName).toBe('Dergunova Dariya');
    expect(plan.stages[0].results[0]['ФИО']).toBe('Дергунова Дарья');
    expect(plan.stages[0].results[2]['ФИО']).toBe('Некрасов Дмитрий');
    expect(audit.possiblePeople).toEqual([]);
    expect(audit.aliasesAcrossStages).toEqual(expect.arrayContaining([
      expect.objectContaining({ variants: ['34 Sound', '34sound'] }),
    ]));
    expect(plan.sourceResults).toBe(8);
    expect(plan.people.reduce((sum, p) => sum + p.resultRows, 0)).toBe(8);
  });

  it('never merges the other unconfirmed look-alike names', () => {
    for (const [left, right] of [
      ['Бушкин Дмитрий', 'Бабушкин Дмитрий'],
      ['Зарубин Сергей', 'Заруба Сергей'],
      ['Пучков Александр', 'Дубков Александр'],
      ['Туманов Никита', 'Романов Никита'],
      ['Чамин Никита', 'Халин Никита'],
      ['Яковлев Максим', 'Ковалев Максим'],
      ['Латышева Ксения', 'Латышев Максим'],
    ]) expect(archiveNameKey(left, names)).not.toBe(archiveNameKey(right, names));
  });

  it('consolidates exact approved archive names in the real 1068-result snapshot', () => {
    const snapshot = readFileSync(join(process.cwd(), 'data/historical-xlsx.json'), 'utf8');
    const plan = buildGlobalHistoricalPlan(snapshot, names);
    const audit = auditHistoricalDuplicates(plan, names);
    expect(plan.sourceResults).toBe(1068);
    expect(plan.people.reduce((sum, person) => sum + person.resultRows, 0)).toBe(1068);
    expect(audit.confirmedPeople).toEqual(expect.arrayContaining([
      expect.objectContaining({ canonical: 'Дергунова Дарья', resultRows: 2 }),
      expect.objectContaining({ canonical: 'Латышев Максим', resultRows: 4 }),
      expect.objectContaining({ canonical: 'Некрасов Дмитрий', resultRows: 2 }),
      expect.objectContaining({ canonical: 'Яковлев Максим', resultRows: 2 }),
      expect.objectContaining({ canonical: 'Анташвили Тимур', resultRows: 4 }),
    ]));
    expect(audit.confirmedPeople).toHaveLength(5);
  });

  it('deduplicates globally confirmed alias formatting variants across stages', async () => {
    const upsert = jest.fn().mockImplementation(async () => ({ id: 'archival' }));
    const service = new ImportsService({} as never, names) as unknown as {
      createHistoricalAliasParticipant: (tx: unknown, stageId: string, alias: string) => Promise<unknown>;
    };
    const tx = { participant: { upsert } };
    await service.createHistoricalAliasParticipant(tx, 'stage-a', '34sound');
    await service.createHistoricalAliasParticipant(tx, 'stage-a', '34 Sound');
    await service.createHistoricalAliasParticipant(tx, 'stage-b', '34 Sound');
    await service.createHistoricalAliasParticipant(tx, 'stage-a', 'CarAudio Bryansk');
    await service.createHistoricalAliasParticipant(tx, 'stage-a', 'Car Audio Bryansk');
    const keys = upsert.mock.calls.map(call => (call[0] as { where: { legacyId: string } }).where.legacyId);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toBe(keys[2]);
    expect(keys[3]).toBe(keys[4]);
  });
});
