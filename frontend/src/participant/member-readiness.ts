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

/** Match the server's per-direction equipment rules for the garage checklist.
 * This is advisory only: registration eligibility is still checked by the API.
 * Unknown legacy class names do not introduce invented requirements.
 */
export function requiredDirectionsForRegistration(registration:unknown):AudioDirection[]{
 const classes=(registration as {classes?:unknown}|null)?.classes;
 if(!Array.isArray(classes))return [];
 const required=new Set<AudioDirection>();
 const normalize=(value:unknown)=>String(value??'').trim().toLowerCase().replace(/[\\s_-]/g,'');
 for(const row of classes){
  if(!row||typeof row!=='object')continue;
  const item=row as {class?:any;stageClass?:any};
  const cls=item.class??item.stageClass?.class??item.stageClass??item;
  const direction=normalize(cls?.direction?.name);
  const identity=[cls?.name,cls?.direction?.name,cls?.code].map(normalize).join(' ');
  if(['spl','bassrace','hurrican'].includes(direction)||identity.includes('bassrace')||identity.includes('stormwall')){
   required.add('SUB');
  }else if(identity.includes('bfspl')){
   required.add('FRONT');
  }else if(identity.includes('bdw')||identity.includes('dbwspl')||direction==='dbw'){
   required.add('REAR');
  }
 }
 return (['SUB','FRONT','REAR'] as const).filter(direction=>required.has(direction));
}

export function currentCarAudioComponents(car:any):unknown{
 const configs=Array.isArray(car?.configurations)?car.configurations:[];
 const config=configs.find((item:any)=>item?.isActive!==false);
 if(!config)return undefined;
 const versions=Array.isArray(config.versions)?config.versions:[];
 // Never treat a stale historical version as the active build when the
 // currentVersion pointer is present but its referenced version is missing.
 const version=config.currentVersion==null?versions[0]:versions.find((item:any)=>item.version===config.currentVersion);
 return version?.audioComponents;
}

/** Keep the member's next stage tied to its calendar date, not to a stale
 * registrationOpen flag left enabled on a past event. A stage's ISO date is
 * the organizer's event day; comparing its UTC timestamp to Date.now() can
 * hide today's event in time zones west of UTC. */
export function upcomingStages<T extends {date?:unknown;isDeleted?:boolean;status?:unknown}>(stages:T[],now=new Date()):T[]{
 const localDay=(date:Date)=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 const today=localDay(now);
 const eventDay=(value:unknown):string|null=>{
  const date=value instanceof Date?value:typeof value==='string'||typeof value==='number'?new Date(value):null;
  if(!date||!Number.isFinite(date.getTime()))return null;
  const iso=typeof value==='string'?value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/):null;
  return iso?iso[1]:localDay(date);
 };
 return stages.filter(stage=>{const day=eventDay(stage.date);return !stage.isDeleted&&(stage.status==null||stage.status==='PUBLISHED')&&day!==null&&day>=today;})
  .sort((a,b)=>(eventDay(a.date)??'').localeCompare(eventDay(b.date)??''));
}

export function isCarRegisteredForStage(registrations:unknown,carId:unknown,stageId:unknown):boolean{
 if(!carId||!stageId||!Array.isArray(registrations))return false;
 return registrations.some((registration:any)=>registration?.status!=='CANCELLED'
  &&(registration?.carId??registration?.car?.id)===carId
  &&(registration?.stageId??registration?.stage?.id)===stageId);
}

/**
 * When a competitor is already registered for a later event, show that event
 * as their primary upcoming start instead of an earlier unregistered event.
 * Expects the chronological, non-deleted output of upcomingStages; does not
 * alter the calendar or the selected car.
 */
export function preferredUpcomingStage<T extends {id?:unknown}>(upcoming:T[],registrations:unknown,carId:unknown):T|undefined{
 if(!carId)return upcoming[0];
 return upcoming.find(stage=>isCarRegisteredForStage(registrations,carId,stage.id))??upcoming[0];
}
