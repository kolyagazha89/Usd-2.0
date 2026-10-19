import { readFileSync } from 'fs';
import { join } from 'path';
import { NameNormalizerService } from '../common/names/name-normalizer.service';
import { archiveNameKey, archivePersonName, buildGlobalHistoricalPlan } from './global-historical-plan';
const names = new NameNormalizerService();
const resultHeader = ['Класс', 'Место', 'Номер', 'Результат', 'ФИО'];
const regHeader = ['Номер участника', 'Фамилия и имя', 'Модель автомобиля', 'Номер автомобиля', 'SPL', 'BF SPL', 'BDW SPL', 'Bass Race', 'SPL Hurricane', 'Виброизоляция', 'Команда', 'Email'];
const snapshot = (results: Record<string, unknown>, registrations: Record<string, unknown> = {}) => JSON.stringify({ 'USD _ Результаты.xlsx': results, 'USD _ Регистрация.xlsx': registrations });
describe('global historical source plan', () => {
  it('accounts for every source result once, including rows without sticker numbers', () => {
    const plan = buildGlobalHistoricalPlan(readFileSync(join(process.cwd(), 'data/historical-xlsx.json'), 'utf8'), names);
    expect(plan.sourceResults).toBe(1068);
    expect(plan.identityRulesVersion).toBe(6);
    expect(plan.stages).toHaveLength(11);
    const rows = plan.stages.flatMap(stage => stage.results);
    expect(new Set(rows.map(row => row._archiveRowKey)).size).toBe(1068);
    expect(plan.people.reduce((sum, person) => sum + person.resultRows, 0)).toBe(1068);
    expect(rows.some(row => Number(row['Номер']) === 0)).toBe(true);
    expect(plan.stages[0].year).toBe(2025);
    expect(plan.stages.find(stage => stage.registrationSheet === 'Ростов 05.09')?.results).toEqual([]);
    expect(rows.every(row => row._archiveOriginalName && row._archiveSheet && row._archiveRow)).toBe(true);
  });
  it('builds a common car reference but never copies a future configuration into an earlier stage', () => {
    const plan = buildGlobalHistoricalPlan(snapshot({ final_volgograd2025: [resultHeader, ['Coffin', 1, 1, 150, 'Petrov Ivan']], open_volgograd2026: [resultHeader, ['Coffin', 1, 1, 155, 'Petrov Ivan']] }, { 'Открытие Волгоград': [regHeader, [1, 'Петров Иван Алексеевич', 'Car', 'А123АА34', null, null, null, null, null, 'STP', 'Team']] }), names);
    expect(plan.people).toHaveLength(1);
    expect(plan.people[0].cars).toHaveLength(1);
    expect(plan.stages[0].registrations).toEqual([]);
    const helper = plan.stages.find(stage => stage.year === 2026 && stage.number === 3)!.registrations[0];
    expect(helper['Фамилия и имя']).toBe('Петров Иван');
    expect(helper._archiveOriginalName).toBe('Петров Иван Алексеевич');
    expect(helper['Виброизоляция']).toBe('STP');
  });
  it('does not turn Registration-only people into attendees', () => {
    const plan = buildGlobalHistoricalPlan(snapshot({ open_volgograd2026: [resultHeader, ['Coffin', 1, 1, 150, 'Petrov Ivan']] }, { 'Открытие Волгоград': [regHeader, [2, 'Сидоров Пётр', 'Car', 'А222АА34']] }), names);
    expect(plan.people).toHaveLength(1);
    expect(plan.sourceResults).toBe(1);
  });
  it('does not erase conflicting patronymics to make a short-name match look unique', () => {
    const plan = buildGlobalHistoricalPlan(snapshot({ open_volgograd2026: [resultHeader, ['Coffin', 1, 1, 150, 'Petrov Ivan']] }, { 'Открытие Волгоград': [regHeader, [1, 'Петров Иван Алексеевич', 'A', 'А111АА34'], [2, 'Петров Иван Сергеевич', 'B', 'А222АА34']] }), names);
    const rows = plan.stages.find(stage => stage.number === 3)!.registrations;
    expect(rows.map(row => row['Фамилия и имя'])).toEqual(['Петров Иван Алексеевич', 'Петров Иван Сергеевич']);
  });
  it('fails visibly if an extra Results sheet is absent from the stage mapping', () => {
    expect(() => buildGlobalHistoricalPlan(snapshot({ unknown_event: [resultHeader, ['Coffin', 1, 1, 150, 'Petrov Ivan']] }), names)).toThrow('не включённые в план');
  });
  it('preserves a raw alias instead of inventing a legal first and last name', () => {
    const plan = buildGlobalHistoricalPlan(snapshot({ open_volgograd2026: [resultHeader, ['Coffin', 1, 1, 150, '34 Sound']] }), names);
    const row = plan.stages.find(stage => stage.number === 3)!.results[0];
    expect(row['ФИО']).toBe('34 Sound'); expect(row._archiveOriginalName).toBe('34 Sound');
  });
  it('formats an unambiguous given-name-first pair without fuzzy surname correction', () => {
    expect(archivePersonName('Vyacheslav Kupyansky', names)).toBe('Купянский Вячеслав');
    expect(archiveNameKey('Лютов Виктор Александрович', names)).toBe(archiveNameKey('Виктор Лютов', names));
    expect(archiveNameKey('Мухарский Игорь', names)).not.toBe(archiveNameKey('Мушарский Игорь', names));
  });
});
it.each([
 ['Trubnikov Matvey', 'Трубников Матвей'], ['Kravcov Mihail', 'Кравцов Михаил'],
 ['Davletshin Kirill', 'Давлетшин Кирилл'], ['Cvirko Yan', 'Цвирко Ян'],
 ['Prokopov Savely', 'Прокопов Савелий'], ['Voznev Timofey', 'Вознев Тимофей'],
 ['Kareckih Valery', 'Карецких Валерий'], ['Sergucheva Alexandra', 'Сергучева Александра'],
])('normalizes the actual archival spelling %s without creating an alias', (raw, expected) => {
 expect(names.inspect(raw)).toMatchObject({ normalized: expected, needsReview: false });
});


it.each([
 ['Suleymanov Ruslan', 'Сулеыманов Руслан', 'Сулейманов Руслан'],
 ['Chudaykin Dmitry', 'Чудаыкин Дмитрий', 'Чудайкин Дмитрий'],
 ['Staylovsky Vasily', 'Стаыловскы Василий', 'Стайловский Василий'],
 ['Lvov Petr', 'Лвов Петр', 'Львов Петр'],
 ['Emeliyanenko Evgeny', 'Эмелияненко Евгений', 'Емельяненко Евгений'],
 ['Grigoriev Aleksey', 'Григориев Алексей', 'Григорьев Алексей'],
 ['Klyev Daniil', 'Клыев Даниил', 'Клюев Даниил'],
 ['Shaulsky Mihail', 'Шаулскы Михаил', 'Шаульский Михаил'],
 ['Shychkin Egor', 'Шычкин Егор', 'Щучкин Егор'],
 ['Soloviev Andrey', 'Соловиев Андрей', 'Соловьёв Андрей'],
])('repairs the exact source and previously damaged Cyrillic spelling %s', (source, damaged, canonical) => {
 expect(names.normalize(source)).toBe(canonical);
 expect(names.normalize(damaged)).toBe(canonical);
 expect(archivePersonName(source, names)).toBe(canonical);
 expect(archiveNameKey(source, names)).toBe(archiveNameKey(damaged, names));
 expect(names.inspect(source).needsReview).toBe(false);
});
it.each(['Sidoorov Alexandr', 'Chyaev Tigran', 'Ksy Aperol'])(
 'quarantines suspicious archive label %s instead of inventing a verified human', label => {
  expect(names.inspect(label).needsReview).toBe(true);
 });

it.each(['Sidoorov Alexandr', 'Chyaev Tigran'])(
 'does not silently rewrite unverified surname %s to a different person', source => {
  expect(names.normalize(source)).not.toMatch(/Сидоров Александр|Шаульский Михаил|Чаев Тигран|Шичкин Егор/);
 });

it.each([
 ['samara', 'Самара', 'Grigoriev Aleksey', 'Григорьев Алексей', 34],
 ['orel', 'Орел', 'Klyev Daniil', 'Клюев Даниил', 20],
 ['smolensk', 'Смоленск', 'Klyev Daniil', 'Клюев Даниил', 26],
 ['rostov-on-don', 'Ростов', 'Shaulsky Mihail', 'Шаульский Михаил', 4],
 ['samara', 'Самара', 'Shychkin Egor', 'Щучкин Егор', 72],
 ['smolensk', 'Смоленск', 'Soloviev Andrey', 'Соловьёв Андрей', 3],
])('links verified Results surname to Registration at %s sticker %i', (sheet, regSheet, latin, verified, sticker) => {
  const plan = buildGlobalHistoricalPlan(readFileSync(join(process.cwd(), 'data/historical-xlsx.json'), 'utf8'), names);
  const stage = plan.stages.find(stage => stage.resultsSheet === sheet)!;
  expect(stage.results.some(row => String(row._archiveOriginalName) === latin && Number(row['Номер']) === sticker)).toBe(true);
  expect(stage.registrations.some(row => row._archiveOriginalName === verified || String(row['Фамилия и имя']) === verified)).toBe(true);
  expect(archiveNameKey(latin, names)).toBe(archiveNameKey(verified, names));
});
