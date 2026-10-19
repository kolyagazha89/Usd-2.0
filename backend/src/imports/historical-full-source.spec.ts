import {readFileSync} from 'fs';
import {join} from 'path';
import {NameNormalizerService} from '../common/names/name-normalizer.service';
import {historicalProjectKey} from '../common/names/historical-project-labels';
import {historicalExistingFullNameRepairs} from '../common/names/historical-source-corrections';
import {archiveNameKey,archivePersonName,approvedHistoricalNamePairs,buildGlobalHistoricalPlan} from './global-historical-plan';
import {HISTORICAL_2025_TEXT_STAGES} from './historical-2025-text';
import {ImportsService} from './imports.service';
const names=new NameNormalizerService();
const read=(p:string)=>readFileSync(join(process.cwd(),'data',p),'utf8');
const plan=buildGlobalHistoricalPlan(read('historical-xlsx.json'),names,Object.fromEntries(HISTORICAL_2025_TEXT_STAGES.map(s=>[s.file,read('historical-2025/'+s.file)])));
describe('entire supplied historical archive',()=>{
 it('retains all 1777 results and their original evidence exactly once',()=>{
  const rows=plan.stages.flatMap(s=>s.results);expect(rows).toHaveLength(1777);
  expect(new Set(rows.map(r=>r._archiveRowKey)).size).toBe(1777);
  for(const r of rows){expect(r._archiveOriginalName).toBeTruthy();expect(r._archivePersonKey).toBeTruthy()}
 });
 it('does not mistake any personal source name for a project or store broken endings',()=>{
  for(const stage of plan.stages)for(const row of stage.results){
   const label=String(row['ФИО']);
   if(historicalProjectKey(label)){expect(names.inspect(label).needsReview).toBe(true);continue}
   expect({label,inspection:names.inspect(label).reasons}).toEqual({label,inspection:[]});
   expect(label).toMatch(/^[А-ЯЁа-яё -]+$/);
   expect(label).not.toMatch(/(?:скиы|скы|ниы|лыи)(?: |$)/i);
   expect(archivePersonName(label,names)).toBe(label);
   expect(archiveNameKey(label,names)).toBe(row._archivePersonKey);
  }
 });
 it('repairs every exact previously corrupted full-name output idempotently',()=>{
  for(const [oldName,canonical] of Object.entries(historicalExistingFullNameRepairs)){
   expect(names.normalize(oldName)).toBe(canonical);
   expect(names.normalize(canonical)).toBe(canonical);
  }
 });
 it.each([
  ['Troickiy Nikolay','Троицкий Николай'],['Cinkler Denis','Цинклер Денис'],
  ['Zaicev Alexandr','Зайцев Александр'],['Rumyancev Aleksey','Румянцев Алексей'],
  ['Voroncov Alexandr','Воронцов Александр'],['Andreychenko Lev','Андрейченко Лев'],
  ['Skromniy Denis','Скромный Денис'],['Roman Vasilyi','Роман Василий'],
  ['Sova Tatiyana','Сова Татьяна'],['Hmelnicky Danil','Хмельницкий Данил'],
  ['Puzikov Vladislav 1','Пузаков Владислав'],['Kaminin Vyachelav','Камынин Вячеслав'],
  ['Sidoorov Alexandr','Сидоров Александр'],['Chyaev Tigran','Чяев Тигран'],
 ])('gives %s one canonical identity',(source,canonical)=>{
  expect(archivePersonName(source,names)).toBe(canonical);
  expect(archiveNameKey(source,names)).toBe(archiveNameKey(canonical,names));
 });
 it.each(approvedHistoricalNamePairs)('applies the confirmed full-name pair $source',({source,canonical})=>{expect(archivePersonName(source,names)).toBe(canonical);expect(archiveNameKey(source,names)).toBe(archiveNameKey(canonical,names))});
 it('keeps distinct Wall and Wall+ classes and canonical BDW when connecting a new stage',()=>{
  const service=new ImportsService({} as any,names);
  const keys=['Wall','Wall+','BDW SPL','BDW SPL Ex'].map(n=>service.historicalClassName(n).toLowerCase().replace(/[^a-zа-я0-9+]/g,''));
  expect(keys).toEqual(['wall','wall+','bdw','bdwex']);
 });
});
