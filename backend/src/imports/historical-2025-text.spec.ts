import { readFileSync } from 'fs';
import { join } from 'path';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { archivePersonName, buildGlobalHistoricalPlan } from './global-historical-plan';
import { globalHistoricalAliasKey } from './historical-alias-identity';
import { HISTORICAL_2025_TEXT_STAGES, parseHistorical2025Text } from './historical-2025-text';

const base = join(process.cwd(), 'data');
const getText = (file: string) => readFileSync(join(base, 'historical-2025', file), 'utf8');
const cases: Array<[string, number]> = [
  ['volgograd-opening.txt', 136], ['astrakhan.txt', 96],
  ['lugansk.txt', 80], ['rostov.txt', 118],
  ['orel.txt', 88], ['lipetsk.txt', 96], ['chelyabinsk.txt', 95],
];

describe('2025 results-only source parser', () => {
  it.each(cases)('parses every result line in %s without a registration workbook (%i rows)', (file, count) => {
    const rows = parseHistorical2025Text(getText(file), file);
    expect(rows).toHaveLength(count);
    expect(new Set(rows.map(row => row._archiveRowKey)).size).toBe(count);
    expect(rows.every(row => Number(row._archiveRow) > 0 && row._archiveOriginalName && row._archiveSourceLine)).toBe(true);
    expect(rows.every(row => row['Класс'] && row['ФИО'] && typeof row['Результат'] === 'number')).toBe(true);
  });
  it('preserves the printed place, sticker and first score in BassRace without importing each round as a new result', () => {
    const rows = parseHistorical2025Text(getText('volgograd-opening.txt'), 'volgograd-opening.txt');
    const shilov = rows.find(row => row['ФИО'] === 'Shilov Sergey' && row['Класс'] === 'BassRace 129.9');
    expect(shilov).toMatchObject({ 'Место': 1, 'Номер': 124, 'Результат': 129.95 });
    expect(String(shilov?._archiveExtraRounds)).toContain('129,95');
    const chelyabinsk = parseHistorical2025Text(getText('chelyabinsk.txt'), 'chelyabinsk.txt');
    const unscored = chelyabinsk.find(row => row['ФИО'] === 'Palkin Alexandr' && row['Класс'] === 'Limited 2.0');
    expect(unscored).toMatchObject({ 'Место': 3, 'Номер': 9, 'Результат': 0 });
  });
  it('parses BFSPL and BDW without inventing a sticker number', () => {
    const rows = parseHistorical2025Text(getText('astrakhan.txt'), 'astrakhan.txt');
    expect(rows.find(row => row['ФИО'] === 'Латышев Максим' && row['Класс'] === 'Wicket 6-10'))
      .toMatchObject({ 'Место': 1, 'Номер': null, 'Результат': 121.8 });
    expect(rows.find(row => row['ФИО'] === 'Войтенко Евгений' && row['Класс'] === 'BDW Ex'))
      .toMatchObject({ 'Место': 1, 'Номер': null, 'Результат': 126.53 });
  });
  it('accepts user corrections: removed duplicate/zero rows, while retaining original finish positions', () => {
    const orel = parseHistorical2025Text(getText('orel.txt'), 'orel.txt');
    expect(orel.some(row => row['ФИО'] === 'Kovalev Maksim' && row['Класс'] === 'Limited 2.0')).toBe(false);
    const ksenia = orel.filter(row => row['ФИО'] === 'Vasilenko Kseniya' && row['Класс'] === 'Coffin');
    expect(ksenia.map(row => row['Номер'])).toEqual([8]);
    expect(orel.some(row => row['Класс'] === 'Coffin' && row['Место'] === 8)).toBe(true);
    const opening = parseHistorical2025Text(getText('volgograd-opening.txt'), 'volgograd-opening.txt');
    expect(opening.filter(row => row['Класс'] === 'Limited 2.0')).toHaveLength(9);
    const lugansk = parseHistorical2025Text(getText('lugansk.txt'), 'lugansk.txt');
    expect(lugansk.some(row => row['ФИО'] === 'Hailo Pavel' && row['Класс'] === 'Mad-X' && row['Место'] === 4)).toBe(false);
    const lipetsk = parseHistorical2025Text(getText('lipetsk.txt'), 'lipetsk.txt');
    expect(lipetsk.some(row => row['ФИО'] === 'Golubnyak Anatoly' && row['Класс'] === '2x2')).toBe(true);
    expect(lipetsk.some(row => row['ФИО'] === 'Воробьев Андрей' && row['Класс'] === 'Wicket 10+')).toBe(true);
  });
  it('fails closed on a new unknown section or corrupt result line', () => {
    expect(() => parseHistorical2025Text('Результаты\nNew class\n1 150,0 003 Petrov Ivan', 'bad.txt'))
      .toThrow('bad.txt:2');
  });
});

describe('additive 2025 archive', () => {
  it('adds seven results-only 2025 stages without touching the existing 2025 final', () => {
    const sources = Object.fromEntries(HISTORICAL_2025_TEXT_STAGES.map(s => [s.file, getText(s.file)]));
    const names = new NameNormalizerService();
    const snapshot = readFileSync(join(base, 'historical-xlsx.json'), 'utf8');
    const plan = buildGlobalHistoricalPlan(snapshot, names, sources);
    expect(plan.identityRulesVersion).toBe(6);
    expect(plan.stages).toHaveLength(18);
    expect(plan.sourceResults).toBe(1777);
    expect(plan.stages.filter(s => s.year === 2025)).toHaveLength(8);
    expect(plan.stages.filter(s => s.year === 2025 && s.registrationSheet === null)).toHaveLength(8);
    expect(plan.stages.find(s => s.year === 2025 && s.number === 1)?.name).toBe('Финал Волгоград 2025');
    expect(plan.stages.find(s => s.year === 2025 && s.number === 2)?.results).toHaveLength(136);
    expect(plan.stages.find(s => s.year === 2025 && s.number === 3)?.results).toHaveLength(96);
    expect(plan.stages.find(s => s.year === 2025 && s.number === 8)).toMatchObject({
      name: 'Челябинск 2025', city: 'Челябинск', date: '2025-07-29',
      registrationSheet: null,
    });
    expect(plan.stages.find(s => s.year === 2025 && s.number === 8)?.results).toHaveLength(95);
    expect(plan.stages.filter(s => s.year === 2026)).toHaveLength(10);
    expect(new Set(plan.stages.flatMap(s => s.results).map(r => r._archiveRowKey)).size).toBe(1777);
    const originalOnly = buildGlobalHistoricalPlan(snapshot, names);
    expect(plan.registrationRows).toBe(originalOnly.registrationRows);
    expect(plan.sourceHash).not.toBe(originalOnly.sourceHash);
    expect(globalHistoricalAliasKey('34sound')).toBe(globalHistoricalAliasKey('34 Sound'));
  });
});

describe('2025 evidence-backed identities (same event/sticker; no fuzzy merges)', () => {
  const names = new NameNormalizerService();
  it.each([
    ['Hvorotyan Nikolay', 'Хворостян Николай'],
    ['Chyakiryan Artem', 'Чакирян Артем'],
    ['Kupyanskiy Vyacheslav', 'Купянский Вячеслав'],
    ['Latishev Maksim', 'Латышев Максим'],
    ['Matievskyi Danila', 'Матиевский Данила'],
    ['Matievskiy Danila', 'Матиевский Данила'],
  ])('restores only approved archived spelling %s', (raw, expected) => {
    expect(archivePersonName(raw, names)).toBe(expected);
  });
  it('uses the 2025 stage and original sticker to corroborate spelling differences', () => {
    const opening = parseHistorical2025Text(getText('volgograd-opening.txt'), 'volgograd-opening.txt');
    const pairs: Array<[string, string, number]> = [
      ['Hvorostyan Nikolay', 'Hvorotyan Nikolay', 1],
      ['Chakiryan Artem', 'Chyakiryan Artem', 2],
    ];
    for (const [canonical, damaged, sticker] of pairs) {
      const a = opening.find(row => row['ФИО'] === canonical && row['Номер'] === sticker);
      const b = opening.find(row => row['ФИО'] === damaged && row['Номер'] === sticker);
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(archivePersonName(a!['ФИО'], names)).toBe(archivePersonName(b!['ФИО'], names));
    }
    const lugansk = parseHistorical2025Text(getText('lugansk.txt'), 'lugansk.txt');
    expect(lugansk.filter(row => row['Номер'] === 16)
      .map(row => archivePersonName(row['ФИО'], names)))
      .toContain('Купянский Вячеслав');
  });
  it('maps Antoha Fs to the exact vetted archival project without guessing unrelated labels', () => {
    expect(globalHistoricalAliasKey('Antoha Fs')).toBe('antohasf');
    expect(globalHistoricalAliasKey('Antoha Sf')).toBe('antohasf');
    expect(globalHistoricalAliasKey('Antoha Force')).toBeNull();
    expect(globalHistoricalAliasKey('34sound')).toBe('34sound');
  });
  it('does not collapse distinct people with the same given name', () => {
    expect(archivePersonName('Tumanov Nikita', names)).not.toBe(archivePersonName('Romanov Nikita', names));
  });
});
