import { readFileSync } from 'fs';
import { join } from 'path';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { buildGlobalHistoricalPlan } from './global-historical-plan';
import { globalHistoricalAliasKey } from './historical-alias-identity';
import { HISTORICAL_2025_TEXT_STAGES, parseHistorical2025Text } from './historical-2025-text';

const base = join(process.cwd(), 'data');
const getText = (file: string) => readFileSync(join(base, 'historical-2025', file), 'utf8');
const cases: Array<[string, number]> = [
  ['volgograd-opening.txt', 146], ['astrakhan.txt', 96],
  ['lugansk.txt', 81], ['rostov.txt', 118],
  ['orel.txt', 92], ['lipetsk.txt', 96],
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
    const opening = rows.find(row => row['ФИО'] === 'Begmuradov Artur' && row['Класс'] === 'Limited 2.0');
    expect(opening?.['Результат']).toBe(0);
  });
  it('parses BFSPL and BDW without inventing a sticker number', () => {
    const rows = parseHistorical2025Text(getText('astrakhan.txt'), 'astrakhan.txt');
    expect(rows.find(row => row['ФИО'] === 'Латышев Максим' && row['Класс'] === 'Wicket 6-10'))
      .toMatchObject({ 'Место': 1, 'Номер': null, 'Результат': 121.8 });
    expect(rows.find(row => row['ФИО'] === 'Войтенко Евгений' && row['Класс'] === 'BDW Ex'))
      .toMatchObject({ 'Место': 1, 'Номер': null, 'Результат': 126.53 });
  });
  it('does not discard same-name duplicate stickers or same-class results', () => {
    const orel = parseHistorical2025Text(getText('orel.txt'), 'orel.txt');
    const kovalev = orel.filter(row => row['ФИО'] === 'Kovalev Maksim' && row['Класс'] === 'Limited 2.0');
    expect(kovalev.map(row => row['Номер'])).toEqual([23, 28]);
    const ksenia = orel.filter(row => row['ФИО'] === 'Vasilenko Kseniya' && row['Класс'] === 'Coffin');
    expect(ksenia.map(row => row['Номер'])).toEqual([8, 9]);
  });
  it('fails closed on a new unknown section or corrupt result line', () => {
    expect(() => parseHistorical2025Text('Результаты\nNew class\n1 150,0 003 Petrov Ivan', 'bad.txt'))
      .toThrow('bad.txt:2');
  });
});

describe('additive 2025 archive', () => {
  it('adds six source-only stages to existing historical workbook without touching the 2025 final', () => {
    const sources = Object.fromEntries(HISTORICAL_2025_TEXT_STAGES.map(s => [s.file, getText(s.file)]));
    const names = new NameNormalizerService();
    const snapshot = readFileSync(join(base, 'historical-xlsx.json'), 'utf8');
    const plan = buildGlobalHistoricalPlan(snapshot, names, sources);
    expect(plan.identityRulesVersion).toBe(6);
    expect(plan.stages).toHaveLength(17);
    expect(plan.sourceResults).toBe(1697);
    expect(plan.stages.filter(s => s.year === 2025)).toHaveLength(7);
    expect(plan.stages.filter(s => s.year === 2025 && s.registrationSheet === null)).toHaveLength(7);
    expect(plan.stages.find(s => s.year === 2025 && s.number === 1)?.name).toBe('Финал Волгоград 2025');
    expect(plan.stages.find(s => s.year === 2025 && s.number === 2)?.results).toHaveLength(146);
    expect(plan.stages.find(s => s.year === 2025 && s.number === 3)?.results).toHaveLength(96);
    expect(plan.stages.filter(s => s.year === 2026)).toHaveLength(10);
    expect(new Set(plan.stages.flatMap(s => s.results).map(r => r._archiveRowKey)).size).toBe(1697);
    const originalOnly = buildGlobalHistoricalPlan(snapshot, names);
    expect(plan.registrationRows).toBe(originalOnly.registrationRows);
    expect(plan.sourceHash).not.toBe(originalOnly.sourceHash);
    expect(globalHistoricalAliasKey('34sound')).toBe(globalHistoricalAliasKey('34 Sound'));
  });
});
