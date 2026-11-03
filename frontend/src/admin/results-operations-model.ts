/** Pure helpers for the stage-scoped judging desk; service validation is authoritative. */
type R=Record<string,any>;
const clean=(value:unknown)=>String(value??'').normalize('NFKC').toLocaleLowerCase('ru')
 .replaceAll('ё','е').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const compact=(value:unknown)=>clean(value).replace(/\s+/g,'');
const normPlate=(value:unknown)=>compact(value).replace(/[abcekмhopctyx]/gi,(x:string)=>({
  a:'а',b:'в',c:'с',e:'е',k:'к',m:'м',h:'н',o:'о',p:'р',t:'т',x:'х',y:'у'
 } as Record<string,string>)[x.toLowerCase()]??x);
// Read the shared participant-stage decision first, matching the backend.
// Legacy per-registration inspection is a fallback, never an override.
export function judgingInspectionStatus(registration:R):'PASSED'|'FAILED'|'PENDING'{
 const status=(registration?.stageInspection??registration?.inspection)?.status;
 return status==='PASSED'||status==='FAILED'?status:'PENDING';
}
export function judgingNumbers(registration:R):number[]{
 const values=[registration?.participantNumber,
  ...(Array.isArray(registration?.numbers)?registration.numbers:[]).map((n:R)=>n.number),
  ...(Array.isArray(registration?.classes)?registration.classes:[]).map((c:R)=>c.number?.number)];
 return [...new Set(values.map(Number).filter(n=>Number.isSafeInteger(n)&&n>0))].sort((a,b)=>a-b);
}
export function canJudgeRegistration(registration:R):boolean{
 return registration?.status==='ACTIVE'&&judgingInspectionStatus(registration)==='PASSED';
}
const stringsForRegistration=(registration:R)=>{
 const participant=registration?.participant??{},car=registration?.car??{};
 const team=typeof participant.team==='string'?participant.team:participant.team?.name??'';
 return [participant.lastName,participant.firstName,participant.middleName,team,participant.city,
  car.brand,car.model,car.registrationNumber,car.registrationCountry,
  ...(registration?.classes??[]).flatMap((c:R)=>[c.class?.name,c.class?.code,c.class?.direction?.name])];
};
export function matchesJudgeSearch(registration:R,search:string):boolean{
 const nums=judgingNumbers(registration);
 const numbered=String(search??'').trim().match(/^[№#]\s*(\d+)$/);
 if(numbered)return nums.includes(Number(numbered[1]));
 const q=clean(search);
 if(!q)return true;
 if(/^\d+$/.test(q))return nums.includes(Number(q));
 const original=stringsForRegistration(registration);
 const haystack=clean([...original,...nums.map(String)].join(' '));
 const qWords=q.split(/\s+/);
 const plate=normPlate(registration.car?.registrationNumber);
 const joined=compact(q);
 return qWords.every(word=>haystack.includes(word))||
  (joined.length>=3&&plate.includes(normPlate(joined)));
}
export function filterJudgeRegistrations(registrations:R[],search:string,{passedOnly=false}={}):R[]{
 const sorted=registrations.filter(r=>r?.status==='ACTIVE'&&(!passedOnly||canJudgeRegistration(r)));
 const primaryNumber=(r:R)=>Number(r.participantNumber)>0?Number(r.participantNumber):(judgingNumbers(r)[0]??Infinity);
 return sorted.filter(r=>matchesJudgeSearch(r,search)).sort((a,b)=>
  primaryNumber(a)-primaryNumber(b)||
   String(a.participant?.lastName??'').localeCompare(String(b.participant?.lastName??''),'ru'));
}
export function remainingJudgingClasses(registration:R|undefined,results:R[]):R[]{
 if(!registration)return [];
 const used=new Set(results.filter(r=>r?.registration?.id===registration.id||r?.registrationId===registration.id)
  .map(r=>String(r?.registrationClassId??r?.registrationClass?.id??'')));
 return (registration.classes??[]).filter((c:R)=>c?.id&&!used.has(String(c.id))&&c.class);
}
export function judgingOverview(registrations:R[],results:R[]){
 const active=registrations.filter(r=>r?.status==='ACTIVE');
 const passed=active.filter(canJudgeRegistration);
 const failed=active.filter(r=>judgingInspectionStatus(r)==='FAILED');
 const awaiting=active.filter(r=>judgingInspectionStatus(r)==='PENDING');
 const remaining=passed.reduce((n,r)=>n+remainingJudgingClasses(r,results).length,0);
 return {registrations:active.length,admitted:passed.length,failed:failed.length,awaiting:awaiting.length,
  entered:results.length,remaining};
}
export function matchesJudgingResult(result:R,search:string):boolean{
 const reg=result.registration??{};
 return matchesJudgeSearch({...reg,classes:[result.registrationClass],participantNumber:reg.participantNumber},search);
}
export function judgingResultLink(stageId:string,registrationId?:string){
 const params=new URLSearchParams({stageId});
 if(registrationId){params.set('registrationId',registrationId);params.set('entry','1');}
 return '/admin/results?'+params.toString();
}
