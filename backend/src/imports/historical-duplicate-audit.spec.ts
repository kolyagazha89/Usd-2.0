import { jest } from '@jest/globals';
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

  it('reports near FIO and cross-stage alias variants without merging them', () => {
    const plan = buildGlobalHistoricalPlan(source(
      [
        ['Coffin', 1, 10, 151, 'Dergunova Dariya'],
        ['Coffin', 2, 11, 149, 'Latishev Malsim'],
        ['Coffin', 3, 12, 147, '34sound'],
      ],
      [
        ['Coffin', 1, 20, 155, 'Дергунова Дарья'],
        ['Coffin', 2, 21, 151, 'Latyshev Maksim'],
        ['Coffin', 3, 22, 148, '34 Sound'],
      ],
    ), names);
    const audit = auditHistoricalDuplicates(plan, names);
    expect(audit.possiblePeople.some(p =>
      [p.left, p.right].includes('Дергунова Дария') &&
      [p.left, p.right].includes('Дергунова Дарья'))).toBe(true);
    expect(audit.possiblePeople.some(p =>
      [p.left, p.right].includes('Латишев Малсим') &&
      [p.left, p.right].includes('Латышев Максим'))).toBe(true);
    expect(audit.aliasesAcrossStages).toEqual(expect.arrayContaining([
      expect.objectContaining({ variants: ['34 Sound', '34sound'], stages: expect.arrayContaining(['2025 · Финал Волгоград 2025', '2026 · Открытие Волгоград']) }),
    ]));
    expect(plan.sourceResults).toBe(6);
    expect(plan.people.reduce((sum, p) => sum + p.resultRows, 0)).toBe(6);
  });

  it('deduplicates exact approved alias formatting variants only within one stage', async () => {
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
    expect(keys[0]).not.toBe(keys[2]);
    expect(keys[3]).toBe(keys[4]);
  });
});
