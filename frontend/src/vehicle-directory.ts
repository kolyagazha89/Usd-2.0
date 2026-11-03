/** Factual, read-only vehicle make/model suggestions from the reviewed USD CSV.
 * This is not an allow-list: rare/imported cars must remain editable offline.
 */
export type VehicleDirectory = {
 makes: string[];
 modelsByNormalizedMake: Map<string, string[]>;
 modelCount: number;
};
export const MAX_VEHICLE_CSV_BYTES = 1024 * 1024;
const norm = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');

function cells(source: string): string[][] {
 const rows: string[][] = [];
 let row: string[] = [], field = '', quoted = false, closed = false;
 const endField = () => { row.push(field.trim()); field = ''; closed = false; };
 const endRow = () => { endField(); if (row.some(Boolean)) rows.push(row); row = []; };
 for (let i = 0; i < source.length; i++) {
  const ch = source[i];
  if (quoted) {
   if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
   else if (ch === '"') { quoted = false; closed = true; }
   else if (ch === '\r' || ch === '\n') throw new Error('Некорректный перенос в CSV автомобилей.');
   else field += ch;
   continue;
  }
  if (ch === '"') {
   if (field || closed) throw new Error('Некорректные кавычки в CSV автомобилей.');
   quoted = true;
  } else if (ch === ',' || ch === '\r' || ch === '\n') {
   if (ch === ',') endField();
   else { endRow(); if (ch === '\r' && source[i+1] === '\n') i++; }
  } else if (closed) {
   if (ch !== ' ' && ch !== '\t') throw new Error('Неверный разделитель CSV автомобилей.');
  } else field += ch;
 }
 if (quoted) throw new Error('Незакрытая кавычка в CSV автомобилей.');
 if (field || row.length || closed) endRow();
 return rows;
}

export function parseVehicleDirectoryCsv(source: string): VehicleDirectory {
 if (new TextEncoder().encode(source).length > MAX_VEHICLE_CSV_BYTES)
  throw new Error('Справочник автомобилей превышает 1 МБ.');
 const rows = cells(source.replace(/^\uFEFF/, ''));
 const header = rows.shift();
 if (!header || header.length !== 2 || norm(header[0]) !== 'марка' || norm(header[1]) !== 'модель')
  throw new Error('Нужен CSV из двух столбцов: марка,модель.');
 if (!rows.length || rows.length > 15000) throw new Error('Недопустимый размер справочника автомобилей.');
 const grouped = new Map<string, { name: string; models: Map<string, string> }>();
 for (const [index, row] of rows.entries()) {
  if (row.length !== 2) throw new Error('Неверное число столбцов в строке '+(index+2)+'.');
  const [make, model] = row;
  if (!make || !model || make.length > 100 || model.length > 120 ||
      [make, model].some(value => /[\u0000-\u001f\u007f]/.test(value)))
   throw new Error('Некорректная марка или модель в строке '+(index+2)+'.');
  const makeKey = norm(make);
  if (!grouped.has(makeKey)) grouped.set(makeKey, {name:make,models:new Map()});
  const record = grouped.get(makeKey)!;
  if (!record.models.has(norm(model))) record.models.set(norm(model),model);
 }
 const sort = (a:string,b:string) => a.localeCompare(b,'ru',{numeric:true});
 const makes = [...grouped.values()].map(v=>v.name).sort(sort);
 const modelsByNormalizedMake = new Map<string,string[]>();
 let modelCount = 0;
 for (const [key,group] of grouped) {
  const models = [...group.models.values()].sort(sort);
  modelCount += models.length;
  modelsByNormalizedMake.set(key,models);
 }
 return {makes,modelsByNormalizedMake,modelCount};
}
export function modelsForVehicleMake(directory:VehicleDirectory|null,make:string):string[] {
 return directory?.modelsByNormalizedMake.get(norm(make)) ?? [];
}
