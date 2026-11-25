/** A person, rather than a car, class or number, is the unit of team enrolment. */
export type TeamRegistration={
 id:string;participantId:string;status:string;source?:string;
 teamIdAtInspection?:string|null;teamNameAtInspection?:string|null;teamAffiliationCapturedAt?:Date|null;
 participant:{team:string|null;teamMembership?:{status:string;team:{id:string;name:string;isActive:boolean}}|null};
};
const normalizeName=(value:string|null|undefined)=>{
 const name=(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
 return ['','-','–','—','нет','нет команды','без команды','не указано','не указана','n/a','na','none','no team'].includes(name.toLocaleLowerCase('ru'))?'':name;
};
export function canUseCurrentStageTeams(stage:{status:string;date:Date;resultsPublishedAt:Date|null},now=new Date()){
 const today=new Date(now);today.setUTCHours(0,0,0,0);
 return stage.status==='PUBLISHED'&&!stage.resultsPublishedAt&&stage.date>=today;
}
export function summarizeStageTeams(registrations:readonly TeamRegistration[],allowCurrentTeams:boolean){
 const people=new Map<string,TeamRegistration[]>();
 for(const row of registrations){
  if(row.status!=='ACTIVE')continue;
  const rows=people.get(row.participantId)??[];rows.push(row);people.set(row.participantId,rows);
 }
 const teams=new Map<string,{key:string;name:string;participants:number;preliminaryParticipants:number}>();
 let preliminaryParticipants=0;
 for(const rows of people.values()){
  // Inspections freeze one affiliation for every vehicle of an event participant.
  const captured=rows.filter(row=>row.teamAffiliationCapturedAt||row.teamIdAtInspection?.trim()||normalizeName(row.teamNameAtInspection));
  captured.sort((a,b)=>(a.teamAffiliationCapturedAt?.getTime()??Infinity)-(b.teamAffiliationCapturedAt?.getTime()??Infinity)||a.id.localeCompare(b.id));
  let key='unknown',name='Нет данных о команде',preliminary=false;
  if(captured.length){
   const row=captured[0],id=row.teamIdAtInspection?.trim(),label=normalizeName(row.teamNameAtInspection);
   if(id||label){key=id?'id:'+id:'name:'+label.toLocaleLowerCase('ru');name=label||'Команда (название не сохранено)'}
   else{key='unattributed';name='Без команды'}
  }else if(allowCurrentTeams&&rows.some(row=>row.source!=='IMPORT')){
   const row=rows.filter(row=>row.source!=='IMPORT').sort((a,b)=>a.id.localeCompare(b.id))[0];
   const membership=row.participant.teamMembership;
   const approved=membership?.status==='APPROVED'&&membership.team.isActive;
   const id=approved?membership.team.id:'';
   const label=normalizeName(membership?(approved?membership.team.name:null):row.participant.team);
   key=id?'id:'+id:label?'name:'+label.toLocaleLowerCase('ru'):'unattributed';
   name=label||'Без команды';preliminary=true;preliminaryParticipants++;
  }
  const team=teams.get(key)??{key,name,participants:0,preliminaryParticipants:0};
  team.participants++;if(preliminary)team.preliminaryParticipants++;teams.set(key,team);
 }
 return {totalParticipants:people.size,preliminaryParticipants,teams:[...teams.values()].sort((a,b)=>b.participants-a.participants||a.name.localeCompare(b.name,'ru')||a.key.localeCompare(b.key))};
}
