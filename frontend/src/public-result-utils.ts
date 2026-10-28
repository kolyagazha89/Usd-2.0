export function publicResultUnit(value:any,classItem?:any){
 const unit=String(value??'').trim().toUpperCase();
 const className=String(classItem?.name??'').trim().toLowerCase();
 const direction=String(classItem?.direction?.name??'').trim().toLowerCase();
 // Storm Wall is measured in metres per second; the remaining USD directions use dB.
 if(unit==='MPS'||unit==='M/S'||unit==='М/С'||className==='storm wall'||direction==='hurrican')return 'м/с';
 if(unit==='DB'||unit==='DBS'||unit==='ДБ')return 'дБ';
 // OTHER/empty is not a reason to hide the unit on a public result card.
 return 'дБ';
}
export function publicResultValue(value:any){
 if(value===null||value===undefined||value==='')return '—';
 const numeric=Number(value);
 return Number.isFinite(numeric)?new Intl.NumberFormat('ru-RU',{maximumFractionDigits:3}).format(numeric):String(value);
}
export function recordDirectionKind(row:any){
 const direction=String(row.class?.direction?.name??row.result?.registrationClass?.class?.direction?.name??row.direction?.name??'').toLocaleUpperCase('ru-RU').replace(/\s/g,'').replace(/[_-]/g,'');
 if(direction.includes('BFSPL'))return 'BFSPL';
 if(direction.includes('BDW'))return 'BDWSPL';
 if(direction.includes('SPL'))return 'SPL';
 return 'OTHER';
}
export function resultNumericValue(row:any){
 const raw=row?.value??row?.result?.value??row?.score??row?.result;
 // An unpublished/empty measurement must never become a valid zero dB record.
 if(raw===null||raw===undefined||raw===''||typeof raw==='boolean')return Number.NEGATIVE_INFINITY;
 if(typeof raw==='number')return Number.isFinite(raw)?raw:Number.NEGATIVE_INFINITY;
 const parsed=Number(String(raw??'').replace(/,/g,'.').replace(/[^0-9.+-]/g,''));
 return Number.isFinite(parsed)?parsed:Number.NEGATIVE_INFINITY;
}
/** Records compare sound-pressure readings only. BassRace is a separate
 * competition format, while Storm Wall uses speed rather than dB.
 * Keep this check on public surfaces even when legacy rows have SPL parents.
 */
export function isDbRecordEligible(row:any):boolean{
 const cls=row?.class??row?.result?.registrationClass?.class??{};
 const identity=[cls.name,cls.code,cls.direction?.name,row?.direction?.name]
  .map(value=>String(value??'')).join(' ').toLowerCase().replace(/[^a-zа-я0-9]+/g,'');
 const unit=String(cls.unit??row?.unit??'').trim().toLowerCase();
 const value=resultNumericValue(row);
 return Number.isFinite(value)&&value>=0
  &&!['bassrace','stormwall','hurrican'].some(kind=>identity.includes(kind))
  &&!['mps','m/s','м/с'].includes(unit);
}

export function sortRecordRows(rows:any[]){
 return rows.slice().sort((a:any,b:any)=>{
  const directionA=Number(a.class?.direction?.sortOrder??a.result?.registrationClass?.class?.direction?.sortOrder??0);
  const directionB=Number(b.class?.direction?.sortOrder??b.result?.registrationClass?.class?.direction?.sortOrder??0);
  if(directionA!==directionB)return directionA-directionB;
  const kindA=recordDirectionKind(a),kindB=recordDirectionKind(b);
  if(kindA!==kindB)return kindA.localeCompare(kindB,'ru');
  const valueDiff=resultNumericValue(b)-resultNumericValue(a);
  if(Number.isFinite(valueDiff)&&valueDiff!==0)return valueDiff;
  const classA=Number(a.class?.sortOrder??a.result?.registrationClass?.class?.sortOrder??0);
  const classB=Number(b.class?.sortOrder??b.result?.registrationClass?.class?.sortOrder??0);
  if(classA!==classB)return classA-classB;
  return String(a.class?.name??a.className??'').localeCompare(String(b.class?.name??b.className??''),'ru',{numeric:true});
 });
}
export function selectHomepageRecords(rows:any[]){
 const sorted=sortRecordRows(rows.filter(isDbRecordEligible));
 return [
  ...sorted.filter((row:any)=>recordDirectionKind(row)==='SPL').slice(0,3),
  ...sorted.filter((row:any)=>recordDirectionKind(row)==='BFSPL').slice(0,2),
  ...sorted.filter((row:any)=>recordDirectionKind(row)==='BDWSPL').slice(0,1),
 ];
}
export function selectHomepageResults(rows:any[]){
 const classItem=(row:any)=>row.registrationClass?.class??row.class??row.result?.registrationClass?.class??{};
 const directionKind=(row:any)=>{
  const cls=classItem(row);
  const direction=String(cls.direction?.name??row.registrationClass?.direction?.name??row.direction?.name??row.result?.registrationClass?.class?.direction?.name??'').toLocaleUpperCase('ru-RU').replace(/\s/g,'').replace(/[_-]/g,'');
  if(direction.includes('BFSPL'))return 'BFSPL';
  if(direction.includes('BDW')||direction.includes('DBW'))return 'BDWSPL';
  if(direction.includes('SPL'))return 'SPL';
  return 'OTHER';
 };
 const classKey=(row:any)=>{
  const cls=classItem(row);
  return String(row.registrationClass?.classId??row.classId??cls.id??cls.name??'').trim().toLocaleLowerCase('ru-RU');
 };
 const placeOf=(row:any)=>Number(row.place??row.position??row.result?.place??row.result?.position);
 const byMeasurement=(a:any,b:any)=>resultNumericValue(b)-resultNumericValue(a);
 const winnersFor=(kind:string,limit:number)=>{
  const grouped=new Map<string,any[]>();
  for(const row of rows){
   if(directionKind(row)!==kind||placeOf(row)!==1)continue;
   const key=classKey(row);
   if(!key)continue;
   const bucket=grouped.get(key)??[];
   bucket.push(row);
   grouped.set(key,bucket);
  }
  return [...grouped.values()].map((items:any[])=>items.slice().sort(byMeasurement)[0]).sort(byMeasurement).slice(0,limit);
 };
 // Fixed championship distribution: 3 SPL, 2 BFSPL, 1 BDW SPL. Never mix in other directions.
 return [...winnersFor('SPL',3),...winnersFor('BFSPL',2),...winnersFor('BDWSPL',1)];
}
