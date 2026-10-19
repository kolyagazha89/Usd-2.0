import { createHash } from 'crypto';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { HISTORICAL_STAGE_MAPPINGS } from './historical-stage-mappings';

export type ArchiveRow = Record<string, unknown>;
export type ArchiveStage = {
  year: number; number: number; name: string; city: string; date: string;
  registrationSheet: string | null; resultsSheet: string | null;
  registrations: ArchiveRow[]; results: ArchiveRow[];
};
export type ArchivePlan = {
  version: 1; identityRulesVersion?: number; sourceHash: string; sourceWorkbooks: unknown[];
  sourceResults: number; registrationRows: number; stages: ArchiveStage[];
  people: Array<{ key: string; names: string[]; resultRows: number; cars: Array<{ plate: string; model: string; sheet: string; row: number }>; teams: string[] }>;
};

const givenNames = new Set(('Александр Алексей Андрей Антон Артем Артём Арсен Арсений Валентин Валерий Вадим Василий Виталий Виктор Владимир Владислав Вячеслав Григорий Даниил Данил Денис Дмитрий Егор Евгений Иван Игорь Илья Кирилл Константин Ксения Лаврентий Максим Матвей Михаил Назар Никита Николай Олег Павел Ричард Роман Руслан Сергей Терентий Тимофей Тимур Эдуард Юрий Яков Ярослав Ян').toLowerCase().split(' '));

/**
 * These THREE full-name identities were explicitly approved by the archive
 * operator on 2026-10-19. Correct only the entire normalized name; neither
 * generic surnames nor people who merely share a first name are ever merged.
 */
export const approvedHistoricalNamePairs = [
  { source: 'Дергунова Дария', canonical: 'Дергунова Дарья' },
  { source: 'Латишев Малсим', canonical: 'Латышев Максим' },
  { source: 'Никрасов Дмитрий', canonical: 'Некрасов Дмитрий' },
] as const;
const approvedFullNames = new Map<string, string>(
  approvedHistoricalNamePairs.map(pair => [pair.source.toLocaleLowerCase('ru'), pair.canonical]),
);

export function archivePersonName(raw: unknown, normalizer: NameNormalizerService): string {
  const name = normalizer.normalize(String(raw ?? ''));
  const words = name.split(/\s+/).filter(Boolean);
  // Restore an unambiguous given-name-first pair before approved corrections.
  // Keep the exact original result label in _archiveOriginalName for audit.
  const ordered = words.length === 2 &&
    givenNames.has(words[0].toLocaleLowerCase('ru')) &&
    !givenNames.has(words[1].toLocaleLowerCase('ru'))
    ? words[1] + ' ' + words[0] : name;
  return approvedFullNames.get(ordered.toLocaleLowerCase('ru')) ?? ordered;
}

export function archiveNameKey(raw: unknown, normalizer: NameNormalizerService): string {
  const words = normalizer.toLatin(archivePersonName(raw, normalizer)).toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 3) {
    const middle = words.filter(word => /(?:ovich|evich|ovna|evna|ichna)$/.test(word));
    if (middle.length === 1) words.splice(words.indexOf(middle[0]), 1);
  }
  return words.sort().join('|');
}

export function archivePlateKey(raw: unknown): string {
  const chars: Record<string, string> = { A: 'А', B: 'В', E: 'Е', K: 'К', M: 'М', H: 'Н', O: 'О', P: 'Р', C: 'С', T: 'Т', Y: 'У', X: 'Х' };
  return [...String(raw ?? '').normalize('NFKC').toUpperCase()].map(c => chars[c] ?? c).join('').replace(/[|\s.\-_/\\]/g, '');
}

function sheetRows(sheet: unknown, label: string, results: boolean): ArchiveRow[] {
  if (!Array.isArray(sheet) || !Array.isArray(sheet[0])) return [];
  const headers = sheet[0];
  const rows: ArchiveRow[] = [];
  let currentClass = '';
  for (let index = 1; index < sheet.length; index += 1) {
    const values = sheet[index];
    if (!Array.isArray(values)) continue;
    const row: ArchiveRow = {};
    headers.forEach((header: unknown, column: number) => {
      if (header !== null && header !== undefined && String(header).trim()) row[String(header)] = values[column] ?? null;
    });
    if (results) {
      if (String(row['Класс'] ?? '').trim()) currentClass = String(row['Класс']).trim();
      row['Класс'] = currentClass;
      if (!String(row['ФИО'] ?? '').trim() || !currentClass) continue;
      row._archiveOriginalName = row['ФИО'];
    } else if (!String(row['Фамилия и имя'] ?? '').trim()) continue;
    row._archiveSheet = label;
    row._archiveRow = index + 1;
    row._archiveRowKey = label + ':' + (index + 1);
    rows.push(row);
  }
  return rows;
}

export function buildGlobalHistoricalPlan(snapshot: string, normalizer: NameNormalizerService): ArchivePlan {
  const source = JSON.parse(snapshot);
  const registration = source['USD _ Регистрация.xlsx'] ?? {};
  const results = source['USD _ Результаты.xlsx'] ?? {};
  const stages: ArchiveStage[] = HISTORICAL_STAGE_MAPPINGS.map(mapping => ({
    year: mapping.year, number: mapping.number, name: mapping.name, city: mapping.city, date: mapping.date,
    registrationSheet: mapping.reg, resultsSheet: mapping.result,
    registrations: mapping.reg ? sheetRows(registration[mapping.reg], mapping.reg, false) : [],
    results: mapping.result ? sheetRows(results[mapping.result], mapping.result, true) : [],
  })).sort((left, right) => left.date.localeCompare(right.date) || left.number - right.number);
  const people = new Map<string, { key: string; names: Set<string>; resultRows: number; cars: Map<string, { plate: string; model: string; sheet: string; row: number }>; teams: Set<string> }>();
  const fullNames = new Map<string, Set<string>>();
  for (const stage of stages) for (const row of stage.results) {
    const original = String(row['ФИО']);
    const normalized = archivePersonName(original, normalizer);
    const inspection = normalizer.inspect(normalized);
    // Suspect labels remain verbatim for the archival alias path.
    row['ФИО'] = inspection.needsReview ? original : normalized;
    const key = archiveNameKey(row['ФИО'], normalizer);
    row._archivePersonKey = key;
    const person = people.get(key) ?? { key, names: new Set<string>(), resultRows: 0, cars: new Map(), teams: new Set<string>() };
    person.names.add(original); person.resultRows += 1; people.set(key, person);
    if (!inspection.needsReview) {
      const names = fullNames.get(key) ?? new Set<string>(); names.add(normalized); fullNames.set(key, names);
    }
  }
  const patronymics = new Map<string, Set<string>>();
  for (const stage of stages) for (const row of stage.registrations) {
    const words = normalizer.toLatin(String(row['Фамилия и имя'] ?? '')).split(/\s+/).filter(Boolean);
    if (words.length !== 3) continue;
    const middle = words.filter(word => /(?:ovich|evich|ovna|evna|ichna)$/.test(word));
    if (middle.length !== 1) continue;
    const key = archiveNameKey(row['Фамилия и имя'], normalizer);
    const values = patronymics.get(key) ?? new Set<string>(); values.add(middle[0]); patronymics.set(key, values);
  }
  // The shared index correlates exact names across the entire archive. Only
  // the SAME stage's helper row supplies its car or vibration configuration.
  for (const stage of stages) for (const row of stage.registrations) {
    const original = String(row['Фамилия и имя']);
    const key = archiveNameKey(original, normalizer);
    const person = people.get(key);
    if (!person) continue; // Registration-only names never become competitors.
    const names = fullNames.get(key);
    if (names?.size === 1 && (patronymics.get(key)?.size ?? 0) <= 1) {
      row._archiveOriginalName = original;
      row['Фамилия и имя'] = [...names][0];
    }
    const plate = String(row['Номер автомобиля'] ?? '').trim();
    if (plate) person.cars.set(archivePlateKey(plate), { plate, model: String(row['Модель автомобиля'] ?? ''), sheet: stage.registrationSheet!, row: Number(row._archiveRow) });
    const team = String(row['Команда'] ?? '').trim();
    if (team && !/^(?:без команды|нет|—|-|none|no team)$/i.test(team)) person.teams.add(team);
  }
  const plan: ArchivePlan = {
    version: 1, identityRulesVersion: 2, sourceHash: createHash('sha256').update(snapshot).digest('hex'),
    sourceWorkbooks: source._source?.workbooks ?? [],
    sourceResults: stages.reduce((sum, stage) => sum + stage.results.length, 0),
    registrationRows: stages.reduce((sum, stage) => sum + stage.registrations.length, 0), stages,
    people: [...people.values()].map(person => ({ key: person.key, names: [...person.names], resultRows: person.resultRows, cars: [...person.cars.values()], teams: [...person.teams] })),
  };
  const rawCount = Object.entries(results).reduce((sum, [sheet, rows]) => sum + sheetRows(rows, sheet, true).length, 0);
  if (rawCount !== plan.sourceResults) throw new Error('Есть листы Results, не включённые в план: импорт остановлен без потери строк');
  if (!plan.sourceResults) throw new Error('В архиве нет результатов');
  return plan;
}
