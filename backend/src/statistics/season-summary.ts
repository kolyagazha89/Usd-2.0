/** Read-only season aggregates from USD registrations/results. No inferred payments.
 * A person is counted once per season even when they own multiple BassRace numbers.
 */
export type SeasonStage = {
 id:string;seasonId:string;stageNumber:number;name:string;status:string;date:Date;
};
export type SeasonClass = {
 id:string;classId:string;numberId:string;
 class:{id:string;name:string;sortOrder:number;direction:{id:string;name:string;sortOrder:number}};
 results:Array<{id:string;place:number|null}>;
};
export type SeasonRegistration = {
 id:string;stageId:string;participantId:string;status:string;participantNumber:number;
 teamNameAtInspection?:string|null;
 participant:{createdAt:Date;city:string|null;team:string|null};
 classes:SeasonClass[];
};
export type SeasonRecord={id:string;seasonId:string|null;class:{direction:{name:string}}};
export type SeasonSummaryInput={
 season:{id:string;name:string;year:number};
 stages:SeasonStage[];
 registrations:SeasonRegistration[];
 records:SeasonRecord[];
};
export type SeasonReport={
 season:{id:string;name:string;year:number};
 generatedAt:string;
 stages:Array<{id:string;name:string;stageNumber:number;registered:number;actual:number}>;
 totals:{stages:number;registered:number;registrations:number;classEntries:number;actualParticipants:number;results:number;teams:number;podiums:number;records:number};
 directions:Array<{id:string;name:string;sortOrder:number;athletes:number;classEntries:number;actualAthletes:number;results:number;classes:Array<{id:string;name:string;sortOrder:number;athletes:number;classEntries:number;actualAthletes:number;results:number}>}>;
 notes:string[];
};
const uniq=(items:Iterable<string>)=>new Set(items).size;
export function summarizeSeason(input:SeasonSummaryInput):SeasonReport {
 const active=input.registrations.filter(row=>row.status==='ACTIVE');
 const registeredStages=new Set(input.stages.map(row=>row.id));
 const enrolled=active.filter(row=>registeredStages.has(row.stageId));
 const directionMap=new Map<string,{id:string;name:string;sortOrder:number;participants:Set<string>;actual:Set<string>;entries:Set<string>;results:number;classes:Map<string,{id:string;name:string;sortOrder:number;participants:Set<string>;actual:Set<string>;entries:Set<string>;results:number}>}>();
 const actualParticipants=new Set<string>();
 const teams=new Set<string>();
 const classEntries=new Set<string>();
 let results=0,podiums=0;
 const perStage=new Map(input.stages.map(stage=>[stage.id,{id:stage.id,name:stage.name,stageNumber:stage.stageNumber,registered:new Set<string>(),actual:new Set<string>()}]));
 for(const row of enrolled){
  perStage.get(row.stageId)?.registered.add(row.participantId);
  const team=row.teamNameAtInspection||row.participant.team;
  if(team?.trim())teams.add(team.trim().toLocaleLowerCase('ru'));
  for(const choice of row.classes){
   const direction=choice.class.direction;
   let d=directionMap.get(direction.id);
   if(!d){d={id:direction.id,name:direction.name,sortOrder:direction.sortOrder,participants:new Set(),actual:new Set(),entries:new Set(),results:0,classes:new Map()};directionMap.set(direction.id,d)}
   let c=d.classes.get(choice.class.id);
   if(!c){c={id:choice.class.id,name:choice.class.name,sortOrder:choice.class.sortOrder,participants:new Set(),actual:new Set(),entries:new Set(),results:0};d.classes.set(choice.class.id,c)}
   // A class registration is scoped to the number ID as well as the stage.
   const entry=[row.stageId,row.participantId,choice.classId,choice.numberId].join('|');
   d.participants.add(row.participantId);c.participants.add(row.participantId);
   if(!c.entries.has(entry)){c.entries.add(entry);d.entries.add(entry);classEntries.add(entry)}
   if(choice.results.length){
    d.actual.add(row.participantId);c.actual.add(row.participantId);
    actualParticipants.add(row.participantId);
    perStage.get(row.stageId)?.actual.add(row.participantId);
    c.results+=choice.results.length;d.results+=choice.results.length;
    results+=choice.results.length;
    podiums+=choice.results.filter(x=>x.place!==null&&x.place>=1&&x.place<=3).length;
   }
  }
 }
 return {
  season:input.season,
  generatedAt:new Date().toISOString(),
  stages:[...perStage.values()].sort((a,b)=>a.stageNumber-b.stageNumber).map(s=>({id:s.id,name:s.name,stageNumber:s.stageNumber,registered:s.registered.size,actual:s.actual.size})),
  totals:{
   stages:input.stages.filter(s=>s.status==='COMPLETED').length,
   registered:uniq(enrolled.map(r=>r.participantId)),
   registrations:enrolled.length,
   classEntries:classEntries.size,
   actualParticipants:actualParticipants.size,
   results,
   teams:teams.size,
   podiums,
   records:input.records.filter(record=>record.seasonId===input.season.id&&!/bass.?race/i.test(record.class.direction.name)).length,
  },
  directions:[...directionMap.values()].sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'ru')).map(d=>({
   id:d.id,name:d.name,sortOrder:d.sortOrder,athletes:d.participants.size,classEntries:d.entries.size,actualAthletes:d.actual.size,results:d.results,
   classes:[...d.classes.values()].sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'ru')).map(c=>({
    id:c.id,name:c.name,sortOrder:c.sortOrder,athletes:c.participants.size,classEntries:c.entries.size,actualAthletes:c.actual.size,results:c.results,
   })),
  })),
  notes:['Заявки: активные регистрации; участие: только при наличии результата в классе.','Один спортсмен учитывается один раз в сезоне, независимо от количества классов и дополнительных номеров BassRace.','Фактические платежи и неявки не вычисляются без подтверждённых данных.'],
 };
}
export type SeasonComparison={baseline:SeasonReport;current:SeasonReport;changes:Record<keyof SeasonReport['totals'],{difference:number;percent:number|null}>};
export function compareSeasons(baseline:SeasonReport,current:SeasonReport):SeasonComparison {
 const changes={} as SeasonComparison['changes'];
 for(const key of Object.keys(baseline.totals) as Array<keyof SeasonReport['totals']>){
  const old=baseline.totals[key],next=current.totals[key];
  changes[key]={difference:next-old,percent:old===0?null:Math.round((next-old)*10000/old)/100};
 }
 return {baseline,current,changes};
}
