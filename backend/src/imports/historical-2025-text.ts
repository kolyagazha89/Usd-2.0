import type { ArchiveRow } from './global-historical-plan';

/**
 * Source-backed 2025 events missing from the Results XLSX. The existing final
 * Volgograd 2025 is stage #1 in the current database, so do not renumber it or
 * mutate any registrations/results. These six new slots are stable #2–#7.
 */
export const HISTORICAL_2025_TEXT_STAGES = [
  { year: 2025, number: 2, name: 'Открытие Волгоград 2025', city: 'Волгоград', date: '2025-05-03', file: 'volgograd-opening.txt' },
  { year: 2025, number: 3, name: 'Астрахань 2025', city: 'Астрахань', date: '2025-05-17', file: 'astrakhan.txt' },
  { year: 2025, number: 4, name: 'Луганск 2025', city: 'Луганск', date: '2025-05-24', file: 'lugansk.txt' },
  { year: 2025, number: 5, name: 'Ростов-на-Дону 2025', city: 'Ростов-на-Дону', date: '2025-06-26', file: 'rostov.txt' },
  { year: 2025, number: 6, name: 'Орёл 2025', city: 'Орёл', date: '2025-07-12', file: 'orel.txt' },
  { year: 2025, number: 7, name: 'Липецк 2025', city: 'Липецк', date: '2025-07-19', file: 'lipetsk.txt' },
] as const;

const headings: Record<string, string> = {
  limited: 'Limited 2.0', '1x2': '1x2', '2x2': '2x2', nolim: 'NoLim',
  sedan: 'Sedan', coffin: 'Coffin', wall: 'Wall', 'wall+': 'Wall+',
  'mad-x': 'Mad-X', 'gate 1-6': 'Gate 1-6',
  'wicket 6-10': 'Wicket 6-10', 'wicket 10+': 'Wicket 10+',
  bdw: 'BDW SPL', 'bdw ex': 'BDW Ex',
};

const scoredLine = /^(\d+)\s+(\d+(?:[.,]\d+)?)\s+(\d{1,3})\s+(.+)$/;
const classPlaceLine = /^(\d+)\.\s+(.+?)\s*-\s*(\d+(?:[.,]\s*\d+)?)$/;
const numericRound = /\s+\d{2,3}[.,]\d{1,2}(?=\s|$)/;

/**
 * Results-only importer. Every scored line is retained with its printed place,
 * score, optional sticker number, original label, source file and line number.
 * BassRace extra rounds are preserved as evidence, but not additional results.
 * Unknown structures are errors, NEVER silently skipped or reassigned.
 */
export function parseHistorical2025Text(source: string, file: string): ArchiveRow[] {
  const output: ArchiveRow[] = [];
  let className = '';
  let mode: 'SPL' | 'BASSRACE' | 'BFSPL' = 'SPL';
  let headersSeen = false;
  const lines = source.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').split('\n');

  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index].trim();
    if (!raw || /^[—\-\s]+$/.test(raw)) continue;
    const upper = raw.toLocaleUpperCase('ru-RU');

    // One title at the very top, never count it as a competitor.
    if (!headersSeen && index === 0 && (/Р[ЕУ]З[УЕ]ЛЬТАТ/.test(upper) || /РЕЗУЛЬТАТ/.test(upper))) {
      headersSeen = true;
      continue;
    }
    if (upper === 'ОРЕЛ' || upper === 'ОРЁЛ') continue;
    if (upper === 'BFSPL') { mode = 'BFSPL'; className = ''; continue; }
    if (upper === 'BASSRACE') { mode = 'BASSRACE'; className = ''; continue; }

    const classHeading = headings[raw.toLocaleLowerCase('ru-RU')];
    if (classHeading) {
      className = classHeading;
      mode = ['Gate 1-6', 'Wicket 6-10', 'Wicket 10+'].includes(className) ? 'BFSPL' : 'SPL';
      continue;
    }
    const raceClass = raw.match(/^(?:BassRace\s+)?(?:120(?:[.,]0)?\s+To\s+)?(129[.,]9|139[.,]9|149[.,]9|159[.,]9)$/i)
      ?? raw.match(/^(?:130(?:[.,]0)?\s+To\s+)?(139[.,]9)$/i)
      ?? raw.match(/^(?:140(?:[.,]0)?\s+To\s+)?(149[.,]9)$/i)
      ?? raw.match(/^(?:150(?:[.,]0)?\s+To\s+)?(159[.,]9)$/i);
    if (raceClass) {
      className = 'BassRace ' + raceClass[1].replace(',', '.');
      mode = 'BASSRACE';
      continue;
    }

    let place: number;
    let number: number | null = null;
    let score: number;
    let name: string;
    let otherRounds = '';
    if (mode === 'BFSPL') {
      const match = raw.match(classPlaceLine);
      if (!match || !className) throw new Error(file + ':' + (index + 1) + ' — неизвестная строка BFSPL/BDW: ' + raw);
      place = Number(match[1]); name = match[2].trim();
      score = Number(match[3].replace(/\s+/g, '').replace(',', '.'));
    } else {
      const match = raw.match(scoredLine);
      if (!match || !className) throw new Error(file + ':' + (index + 1) + ' — неизвестная строка результата/класса: ' + raw);
      place = Number(match[1]); score = Number(match[2].replace(',', '.'));
      number = Number(match[3]);
      name = match[4].replace(/\s+-\s*Рекорд России\s*$/i, '').trim();
      const extra = name.match(numericRound);
      if (extra?.index !== undefined) {
        otherRounds = name.slice(extra.index).trim();
        name = name.slice(0, extra.index).trim();
      }
    }
    if (!name || !Number.isFinite(score) || !Number.isInteger(place) || place < 1 ||
      (number !== null && (!Number.isInteger(number) || number <= 0)))
      throw new Error(file + ':' + (index + 1) + ' — некорректный результат: ' + raw);
    output.push({
      'Класс': className, 'Место': place, 'Номер': number,
      'Результат': score, 'ФИО': name,
      _archiveOriginalName: name, _archiveSheet: '2025 TXT: ' + file,
      _archiveRow: index + 1, _archiveRowKey: '2025 TXT: ' + file + ':' + (index + 1),
      _archiveSourceLine: raw, _archiveExtraRounds: otherRounds,
      _archiveRecordNote: /Рекорд России/i.test(raw) ? 'Рекорд России (архив)' : null,
    });
  }
  if (!output.length) throw new Error(file + ': файл не содержит результатов');
  return output;
}
