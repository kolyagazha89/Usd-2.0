/**
 * Program-exported BassRace final standings, NOT a numeric dB ranking.
 * Printed places must be preserved even when another entrant has a higher reading.
 */
export type BassRaceClassMark = 129.9 | 139.9 | 149.9 | 159.9;
export type BassRaceTextRow = {
  classMark: BassRaceClassMark;
  place: number;
  value: number;
  number: number;
  printedName: string;
  line: number;
};

const ranges: Record<string, BassRaceClassMark> = {
  '120.0-129.9': 129.9,
  '130.0-139.9': 139.9,
  '140.0-149.9': 149.9,
  '150.0-159.9': 159.9,
};

export function parseBassRaceText(text: string): BassRaceTextRow[] {
  if (typeof text !== 'string' || !text.trim() || text.length > 100_000) {
    throw new Error('Вставьте протокол BassRace (не более 100 000 символов).');
  }
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const rows: BassRaceTextRow[] = [];
  const seen = new Set<string>();
  let classMark: BassRaceClassMark | null = null;
  let hasTitle = false;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    if (/^bass\s*race\s*:?$/i.test(line)) {
      hasTitle = true;
      classMark = null;
      continue;
    }
    const header = line.match(/^(\d{3}[.,]\d)\s+to\s+(\d{3}[.,]\d)$/i);
    if (header) {
      if (!hasTitle) throw new Error('Строка ' + (index + 1) + ': перед диапазоном укажите BassRace.');
      const key = header[1].replace(',', '.') + '-' + header[2].replace(',', '.');
      classMark = ranges[key] ?? null;
      if (!classMark) throw new Error('Строка ' + (index + 1) + ': неизвестный диапазон BassRace.');
      continue;
    }
    if (!classMark) throw new Error('Строка ' + (index + 1) + ': нужен заголовок диапазона BassRace.');
    const match = line.match(/^(\d{1,3})\s+(\d{1,3}[.,]\d{1,3})\s+(\d{1,5})\s+(.+)$/);
    if (!match) throw new Error('Строка ' + (index + 1) + ': ожидается место, дБ, номер, ФИО.');
    const place = Number(match[1]);
    const value = Number(match[2].replace(',', '.'));
    const number = Number(match[3]);
    const printedName = match[4].trim();
    if (place < 1 || place > 999 || !Number.isFinite(value) || value < 0 || number < 1 || !printedName || printedName.length > 180) {
      throw new Error('Строка ' + (index + 1) + ': неверное место, значение, номер или ФИО.');
    }
    const unique = classMark + ':' + number;
    if (seen.has(unique)) throw new Error('Строка ' + (index + 1) + ': повтор номера ' + number + ' в одном классе.');
    seen.add(unique);
    rows.push({ classMark, place, value, number, printedName, line: index + 1 });
    if (rows.length > 500) throw new Error('Протокол слишком длинный (максимум 500 участников).');
  }
  if (!rows.length) throw new Error('В протоколе не найдены участники BassRace.');
  return rows;
}
