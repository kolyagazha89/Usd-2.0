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

export function isCarRegisteredForStage(registrations:unknown,carId:unknown,stageId:unknown):boolean{
 if(!carId||!stageId||!Array.isArray(registrations))return false;
 return registrations.some((registration:any)=>registration?.status!=='CANCELLED'
  &&(registration?.carId??registration?.car?.id)===carId
  &&(registration?.stageId??registration?.stage?.id)===stageId);
}
