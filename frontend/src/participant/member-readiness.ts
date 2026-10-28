/**
 * Presentation-only readiness helpers. Final eligibility is always checked
 * by the registrations API against the selected immutable configuration version.
 */
export type AudioDirection='SUB'|'FRONT'|'REAR';
type AudioComponent={direction?:unknown;type?:unknown;brand?:unknown;model?:unknown;quantity?:unknown};

export function isDirectionConfigured(rows:unknown,direction:AudioDirection):boolean{
 if(!Array.isArray(rows))return false;
 return rows.some((value:unknown)=>{
  if(!value||typeof value!=='object')return false;
  const item=value as AudioComponent;
  const quantity=Number(item.quantity);
  return item.direction===direction
   &&String(item.brand??'').trim().length>0
   &&String(item.model??'').trim().length>0
   &&Number.isFinite(quantity)&&quantity>0
   &&(direction!=='SUB'||item.type==='SUBWOOFER');
 });
}

export function currentCarAudioComponents(car:any):unknown{
 const configs=Array.isArray(car?.configurations)?car.configurations:[];
 const config=configs.find((item:any)=>item?.isActive!==false);
 if(!config)return undefined;
 const versions=Array.isArray(config.versions)?config.versions:[];
 const version=versions.find((item:any)=>item.version===config.currentVersion)??versions[0];
 return version?.audioComponents;
}

/** Keep the member's next stage tied to its calendar date, not to a stale
 * registrationOpen flag left enabled on a past event. A stage's ISO date is
 * the organizer's event day; comparing its UTC timestamp to Date.now() can
 * hide today's event in time zones west of UTC. */
export function upcomingStages<T extends {date?:unknown;isDeleted?:boolean}>(stages:T[],now=new Date()):T[]{
 const localDay=(date:Date)=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 const today=localDay(now);
 const eventDay=(value:unknown):string|null=>{
  const date=value instanceof Date?value:typeof value==='string'||typeof value==='number'?new Date(value):null;
  if(!date||!Number.isFinite(date.getTime()))return null;
  const iso=typeof value==='string'?value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/):null;
  return iso?iso[1]:localDay(date);
 };
 return stages.filter(stage=>{const day=eventDay(stage.date);return !stage.isDeleted&&day!==null&&day>=today;})
  .sort((a,b)=>(eventDay(a.date)??'').localeCompare(eventDay(b.date)??''));
}

export function isCarRegisteredForStage(registrations:unknown,carId:unknown,stageId:unknown):boolean{
 if(!carId||!stageId||!Array.isArray(registrations))return false;
 return registrations.some((registration:any)=>registration?.status!=='CANCELLED'
  &&(registration?.carId??registration?.car?.id)===carId
  &&(registration?.stageId??registration?.stage?.id)===stageId);
}
