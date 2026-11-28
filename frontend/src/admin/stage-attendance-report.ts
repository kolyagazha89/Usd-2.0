/** Read-only operational report. Count saved class measurements, not podiums.
 * Missing inspection/result is not proof of physical absence. */
type Row=Record<string,any>;
const sources=['PRE_REGISTRATION','ON_SITE','IMPORT','UNKNOWN'] as const;
type Source=typeof sources[number];
const sourceOf=(r:Row):Source=>sources.includes(r.source)?r.source:'UNKNOWN';
const personOf=(r:Row)=>String(r.participantId??r.participant?.id??'');
const carOf=(r:Row)=>String(r.carId??r.car?.id??'');
const nameOf=(p:Row|undefined)=>[p?.lastName,p?.firstName,p?.middleName].filter(Boolean).join(' ')||'Участник не указан';
const num=(n:unknown)=>Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):null;
const unique=(rows:Row[],key:(r:Row)=>string)=>new Set(rows.map(key).filter(Boolean)).size;
const collator=new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
const order=(v:unknown)=>v!=null&&Number.isFinite(Number(v))?Number(v):999;
const inspectionOf=(r:Row)=>r.stageInspection??r.inspection;
const statusOf=(r:Row)=>{const status=inspectionOf(r)?.status;return status==='PASSED'||status==='FAILED'?status:'PENDING'};
const hasEvidence=(r:Row)=>sourceOf(r)==='ON_SITE'||statusOf(r)!=='PENDING'||r.results.length>0;
const personTeam=(r:Row)=>r.teamAffiliationCapturedAt?(r.teamNameAtInspection||'Без команды'):(typeof r.participant?.team==='string'?r.participant.team:r.participant?.team?.name)||'Не указана';
export function buildStageAttendanceReport(input:Row[],stageId:string){
 if(!Array.isArray(input)||!stageId)throw new Error('Нет данных этапа');
 const all=input.filter(r=>r?.stageId===stageId);
 if(input.some(r=>!r?.stageId)||all.some(r=>!r.id||!personOf(r)||!carOf(r)||!['ACTIVE','CANCELLED'].includes(r.status)||!Array.isArray(r.classes)||!Array.isArray(r.results)||r.classes.some((c:Row)=>!c?.id||!c.class?.id)||r.results.some((m:Row)=>!m?.registrationClassId&& !m?.registrationClass?.id)))throw new Error('Неполные данные регистраций этапа');
 if(new Set(all.map(r=>r.id)).size!==all.length)throw new Error('Повторяющиеся регистрации этапа');
 const active=all.filter(r=>r.status==='ACTIVE');
 const pre=active.filter(r=>sourceOf(r)==='PRE_REGISTRATION');
 const evidencedPeople=new Set(all.filter(hasEvidence).map(personOf));
 const registrations=all.map(r=>{
  const inspection=statusOf(r);
  const measuredIds=new Set(r.results.map((m:Row)=>String(m.registrationClassId??m.registrationClass?.id)));
  const classes=(r.classes as Row[]).map(c=>{
   const id=String(c.id),saved=(r.results as Row[]).filter(m=>String(m.registrationClassId??m.registrationClass?.id)===id);
   return {classId:id,catalogId:String(c.class.id),name:String(c.class.name??'Класс'),direction:String(c.class.direction?.name??'Без направления'),directionId:String(c.class.direction?.id??c.class.direction?.name??''),directionOrder:order(c.class.direction?.sortOrder),classOrder:order(c.class.sortOrder),number:num(c.number?.number)??num(r.participantNumber),measured:measuredIds.has(id),results:saved.map((m:Row)=>({value:String(m.value??'—'),unit:String(m.unit??c.class.unit??''),place:m.place??null}))};
  });
  const measured=classes.filter((c:Row)=>c.measured).length;
  return {id:String(r.id),personId:personOf(r),carId:carOf(r),number:num(r.participantNumber),participant:nameOf(r.participant),car:[r.car?.brand,r.car?.model].filter(Boolean).join(' ')||'Не указан',plate:String(r.car?.registrationNumber??''),city:String(r.participant?.city??''),team:personTeam(r),source:sourceOf(r),status:r.status,registeredAt:r.registeredAt??null,inspection,inspectedAt:inspectionOf(r)?.checkedAt??null,inspector:String(inspectionOf(r)?.checkedByName??''),reason:String(inspectionOf(r)?.notes??''),evidence:hasEvidence(r),classes,measured,missing:inspection==='PASSED'?classes.length-measured:0,orphanResults:r.results.filter((m:Row)=>!classes.some((c:Row)=>c.classId===String(m.registrationClassId??m.registrationClass?.id))).length};
 }).sort((a,b)=>(a.number??Infinity)-(b.number??Infinity)||collator.compare(a.participant,b.participant)||a.id.localeCompare(b.id));
 const current=registrations.filter(r=>r.status==='ACTIVE');
 const unconfirmed=current.filter(r=>r.source==='PRE_REGISTRATION'&&!r.evidence);
 const unconfirmedPeople=unconfirmed.filter((r,i,rows)=>!evidencedPeople.has(r.personId)&&rows.findIndex(x=>x.personId===r.personId)===i);
 const classRows=current.flatMap(r=>r.classes.map(c=>({...c,registrationId:r.id,personId:r.personId,carId:r.carId,participant:r.participant,car:r.car,plate:r.plate,source:r.source,inspection:r.inspection,evidence:r.evidence,team:r.team})));
 classRows.sort((a,b)=>a.directionOrder-b.directionOrder||collator.compare(a.direction,b.direction)||a.classOrder-b.classOrder||collator.compare(a.name,b.name)||(a.number??Infinity)-(b.number??Infinity));
 function summarize(rows:typeof classRows){
  return {entries:rows.length,people:unique(rows,r=>r.personId),cars:unique(rows,r=>r.carId),pre:rows.filter(r=>r.source==='PRE_REGISTRATION').length,onSite:rows.filter(r=>r.source==='ON_SITE').length,other:rows.filter(r=>r.source!=='PRE_REGISTRATION'&&r.source!=='ON_SITE').length,unconfirmed:rows.filter(r=>r.source==='PRE_REGISTRATION'&&!r.evidence).length,passed:rows.filter(r=>r.inspection==='PASSED').length,failed:rows.filter(r=>r.inspection==='FAILED').length,pending:rows.filter(r=>r.inspection==='PENDING').length,measured:rows.filter(r=>r.measured).length,missing:rows.filter(r=>r.inspection==='PASSED'&&!r.measured).length,measuredWithoutAdmission:rows.filter(r=>r.inspection!=='PASSED'&&r.measured).length};
 }
 const grouped=(key:(r:typeof classRows[number])=>string)=>{const groups=new Map<string,typeof classRows>();for(const row of classRows){const k=key(row);const group=groups.get(k)??[];group.push(row);groups.set(k,group)}return [...groups.values()]};
 const admitted=current.filter(r=>r.inspection==='PASSED');
 const pendingRows=classRows.filter(r=>r.inspection==='PASSED'&&!r.measured);
 const measuredRows=classRows.filter(r=>r.measured);
 const totals=summarize(classRows);
 return {total:all.length,active:active.length,cancelled:all.length-active.length,people:unique(active,personOf),cars:unique(active,carOf),
  prePeople:unique(pre,personOf),onSitePeople:unique(active.filter(r=>sourceOf(r)==='ON_SITE'),personOf),
  arrivalEvidence:current.filter(r=>r.evidence).length,arrivalPeople:unique(active.filter(r=>evidencedPeople.has(personOf(r))),personOf),
  sources:sources.map(source=>{const rows=all.filter(r=>sourceOf(r)===source),live=rows.filter(r=>r.status==='ACTIVE');return {source,total:rows.length,active:live.length,cancelled:rows.length-live.length,people:unique(live,personOf),cars:unique(live,carOf),inspected:live.filter(r=>statusOf(r)!=='PENDING').length,passed:live.filter(r=>statusOf(r)==='PASSED').length,failed:live.filter(r=>statusOf(r)==='FAILED').length,pending:live.filter(r=>statusOf(r)==='PENDING').length,arrivalEvidence:live.filter(hasEvidence).length}}),
  inspected:current.filter(r=>r.inspection!=='PENDING').length,passed:admitted.length,failed:current.filter(r=>r.inspection==='FAILED').length,pending:current.filter(r=>r.inspection==='PENDING').length,
  complete:admitted.filter(r=>r.classes.length>0&&r.missing===0).length,partial:admitted.filter(r=>r.measured>0&&r.missing>0).length,noMeasurements:admitted.filter(r=>r.classes.length>0&&r.measured===0).length,noClasses:admitted.filter(r=>r.classes.length===0).length,
  entries:totals.entries,measured:totals.measured,missing:totals.missing,measuredWithoutAdmission:totals.measuredWithoutAdmission,
  measuredPeople:unique(measuredRows,r=>r.personId),missingPeople:unique(pendingRows,r=>r.personId),orphanResults:current.reduce((n,r)=>n+r.orphanResults,0),
  directions:grouped(r=>r.directionId).map(rows=>({id:rows[0].directionId,name:rows[0].direction,...summarize(rows)})),
  classes:grouped(r=>r.catalogId).map(rows=>({id:rows[0].catalogId,name:rows[0].name,direction:rows[0].direction,...summarize(rows)})),
  registrations,unconfirmed,unconfirmedPeople,missingRows:pendingRows,measuredRows,unadmittedRows:measuredRows.filter(r=>r.inspection!=='PASSED')};
}
