/**
 * Presentation-only readiness helpers. Final eligibility is always checked
 * by the registrations API against the selected immutable configuration version.
 */
export type AudioDirection='SUB'|'FRONT'|'REAR';

/** An imported or partially entered car is not ready just because it has an ID.
 * Keep historical cars visible, but guide the owner to complete missing fields. */
export function isCarIdentityComplete(car:unknown):boolean{
 if(!car||typeof car!=='object')return false;
 const item=car as {id?:unknown;brand?:unknown;model?:unknown};
 const usable=(value:unknown)=>typeof value==='string'&&value.trim().length>0
  &&!/^(не указано|не указан|нет|—|-)$/i.test(value.trim());
 return usable(item.id)&&usable(item.brand)&&usable(item.model);
}
type AudioComponent={direction?:unknown;type?:unknown;brand?:unknown;model?:unknown;quantity?:unknown};

export function isDirectionConfigured(rows:unknown,direction:AudioDirection):boolean{
 if(!Array.isArray(rows))return false;
 return rows.some((value:unknown)=>{
  if(!value||typeof value!=='object')return false;
  const item=value as AudioComponent;
  const validQuantity=typeof item.quantity==='number'||(typeof item.quantity==='string'&&/^[0-9]+$/.test(item.quantity.trim()));
  const quantity=Number(item.quantity);
  return validQuantity&&item.direction===direction
   &&String(item.brand??'').trim().length>0
   &&String(item.model??'').trim().length>0
   &&Number.isSafeInteger(quantity)&&quantity>0
   &&(direction==='SUB' ? item.type==='SUBWOOFER' : ['MIDBASS','MIDRANGE','HORN'].includes(String(item.type??'')));
 });
}

/** Keep registration, garage and onboarding hints on the same class mapping.
 * Historic imports sometimes nest the class inside stageClass and attach a
 * generic SPL parent to BFSPL/BDW. Specific classes must win. */
function requiredDirectionForClass(row:unknown):AudioDirection|null{
 if(!row||typeof row!=='object')return null;
 const item=row as {class?:any;stageClass?:any;directionName?:unknown;direction?:any};
 const cls=item.class??item.stageClass?.class??item.stageClass??item;
 const normalize=(value:unknown)=>String(value??'').trim().toLowerCase().replace(/[\s_-]/g,'');
 const direction=normalize(cls?.direction?.name??cls?.directionName??item.directionName??item.direction?.name);
 const identity=[cls?.name,cls?.code,direction].map(normalize).join(' ');
 if(identity.includes('bfspl'))return 'FRONT';
 if(identity.includes('bdw')||identity.includes('dbwspl')||direction==='dbw'||direction==='bdwspl')return 'REAR';
 if(['spl','bassrace','hurrican','hurricane','stormwall'].includes(direction)||identity.includes('bassrace')||identity.includes('stormwall'))return 'SUB';
 return null;
}
export function requiredDirectionsForRegistration(registration:unknown):AudioDirection[]{
 const classes=(registration as {classes?:unknown}|null)?.classes;
 if(!Array.isArray(classes))return [];
 const required=new Set<AudioDirection>();
 for(const row of classes){
  const direction=requiredDirectionForClass(row);
  if(direction)required.add(direction);
 }
 return (['SUB','FRONT','REAR'] as const).filter(direction=>required.has(direction));
}

/** Advisory only: the API validates the immutable configuration snapshot. */
export function missingConfigurationRequirementForClass(item:any,config:any):string{
 if(!config)return '';
 const direction=requiredDirectionForClass(item);
 if(!direction||isDirectionConfigured(config.audioComponents,direction))return '';
 if(direction==='FRONT')return 'Для участия в BFSPL необходимо заполнить фронтальную акустику в конфигурации автомобиля.';
 if(direction==='REAR')return 'Для участия в BDW необходимо заполнить тыловую акустику в конфигурации автомобиля.';
 return 'Для направлений SPL, BassRace и Storm Wall необходимо добавить сабвуфер в конфигурацию автомобиля.';
}

export function currentCarAudioComponents(car:any):unknown{
 const configs=Array.isArray(car?.configurations)?car.configurations:[];
 const config=configs.find((item:any)=>item?.isActive!==false);
 if(!config)return undefined;
 const versions=Array.isArray(config.versions)?config.versions:[];
 // Never treat a stale historical version as the active build when the
 // currentVersion pointer is present but its referenced version is missing.
 const version=config.currentVersion==null
  ?versions.filter((item:any)=>Number.isSafeInteger(item?.version)&&item.version>0)
   .reduce((latest:any,item:any)=>!latest||item.version>latest.version?item:latest,undefined)
  :versions.find((item:any)=>item.version===config.currentVersion);
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
