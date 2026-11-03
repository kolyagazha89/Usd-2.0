/** Derived, non-destructive stage report. No point system is inferred from podiums. */
type Rec=Record<string,any>;
export type StageReportSource={stage:Rec;stats:Rec};
const safeCount=(value:unknown)=>{const n=Number(value);return Number.isFinite(n)&&n>0?Math.floor(n):0};
const nameOf=(p:Rec|undefined)=>[p?.lastName,p?.firstName,p?.middleName].filter(Boolean).join(' ').trim()||'Участник не указан';
const unitOf=(unit:string)=>unit==='DB'?'дБ':unit==='MPS'?'м/с':unit==='OTHER'?'':unit||'';
const normalizeTeam=(value:unknown)=>{
 if(typeof value!=='string')return '';
 return value.trim().slice(0,120);
};
export function buildStageReport(source:StageReportSource){
 const stage=source.stage??{},stats=source.stats??{},ins=stats.inspections??{};
 const registrations=safeCount(stats.registrations),participants=safeCount(stats.participants),cars=safeCount(stats.cars);
 const passed=safeCount(ins.passed),failed=safeCount(ins.failed),pending=safeCount(ins.pending);
 const completedInspection=Math.min(registrations,passed+failed);
 const inspectionPercent=registrations?Math.round(completedInspection/registrations*100):0;
 const status=stage.status==='COMPLETED'?(stage.resultsPublishedAt?'PUBLISHED':'INTERNAL'):'DRAFT';
 const classes=(Array.isArray(stats.registrationClasses)?stats.registrationClasses:[]).map((item:Rec)=>({
  id:String(item.class?.id??''),name:String(item.class?.name??'Класс'),direction:String(item.class?.direction?.name??'Без направления'),
  registrations:safeCount(item.registrations),participants:safeCount(item.participants),cars:safeCount(item.cars)
 }));
 const byDirection=new Map<string,{direction:string;registrations:number;classes:number}>();
 for(const c of classes){
  const row=byDirection.get(c.direction)??{direction:c.direction,registrations:0,classes:0};
  row.registrations+=c.registrations;row.classes++;byDirection.set(c.direction,row);
 }
 const podiums:Array<{id:string;direction:string;className:string;place:number;number:number;participant:string;car:string;value:string;unit:string;teamAtInspection:string}>=[];
 for(const group of Array.isArray(stats.classResults)?stats.classResults:[]){
  const seen=new Set<string>();
  for(const result of Array.isArray(group.results)?group.results:[]){
   const place=Number(result.place);
   if(!Number.isInteger(place)||place<1||place>3)continue;
   const id=String(result.id??'');
   if(!id||seen.has(id))continue;
   seen.add(id);
   podiums.push({
    id,direction:String(group.class?.direction?.name??'Без направления'),className:String(group.class?.name??'Класс'),
    place,number:safeCount(result.participantNumber),
    participant:nameOf(result.participant),car:[result.car?.brand,result.car?.model].filter(Boolean).join(' ')||'Не указан',
    value:String(result.value??'—'),unit:unitOf(String(result.unit??'')),
    teamAtInspection:normalizeTeam(result.teamAtInspection),
   });
  }
 }
 const placeOrder=(a:typeof podiums[number],b:typeof podiums[number])=>a.direction.localeCompare(b.direction,'ru')||a.className.localeCompare(b.className,'ru',{numeric:true})||a.place-b.place||a.number-b.number;
 podiums.sort(placeOrder);
 const medals=new Map<string,{name:string;gold:number;silver:number;bronze:number}>();
 for(const p of podiums){
  if(!p.teamAtInspection)continue;
  const m=medals.get(p.teamAtInspection)??{name:p.teamAtInspection,gold:0,silver:0,bronze:0};
  if(p.place===1)m.gold++;else if(p.place===2)m.silver++;else m.bronze++;
  medals.set(p.teamAtInspection,m);
 }
 const teams=[...medals.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'));
 const pendingConfigurations=(Array.isArray(stats.pendingConfigurations)?stats.pendingConfigurations:[]).map((r:Rec)=>({
  id:String(r.registrationId??''),number:safeCount(r.participantNumber),participant:nameOf(r.participant),
  car:[r.car?.brand,r.car?.model].filter(Boolean).join(' ')||'Автомобиль не указан'
 }));
 const inspectionProblems=(Array.isArray(stats.inspectionDetails)?stats.inspectionDetails:[]).filter((i:Rec)=>i.status==='FAILED').map((i:Rec)=>({
  id:String(i.registrationId??''),number:safeCount(i.participantNumber),participant:nameOf(i.participant),reason:String(i.notes??'Причина не указана')
 }));
 const pendingRegistrations=(Array.isArray(stats.pendingRegistrations)?stats.pendingRegistrations:[]).map((i:Rec)=>({
  id:String(i.registrationId??''),number:safeCount(i.participantNumber),participant:nameOf(i.participant)
 }));
 const warnings:string[]=[];
 if(stage.status!=='COMPLETED')warnings.push('Этап ещё не завершён. Данные отчёта могут измениться.');
 if(!stage.resultsPublishedAt)warnings.push('Результаты не опубликованы. Это внутренний отчёт, не официальный протокол.');
 if(pending)warnings.push('Ожидают инспекции: '+pending+'.');
 if(pendingConfigurations.length)warnings.push('После этапа требуется заполнить конфигурации: '+pendingConfigurations.length+'.');
 return {stage,status,registrations,participants,cars,appearances:safeCount(stats.appearances),
  inspections:{passed,failed,pending,completed:completedInspection,percent:inspectionPercent},
  classes,directions:[...byDirection.values()],podiums,teams,pendingConfigurations,inspectionProblems,pendingRegistrations,warnings,
  generatedAt:new Date().toISOString()};
}
export function stageReportStatusLabel(status:string){
 return status==='PUBLISHED'?'Результаты опубликованы':status==='INTERNAL'?'Внутренний отчёт':'Предварительный отчёт';
}
