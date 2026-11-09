/** USD competition stickers: five classes belong to the primary number.
 * Additional BassRace classes each receive a separate number.
 */
export const MAX_PRIMARY_NUMBER_CLASSES=5;
export const MAX_REGISTRATION_CLASSES=100; // transport guard; NOT a primary-number cap.
export type StageClassChoice={classId?:string;class?:{id?:string;name?:string;direction?:{name?:string}};id?:string;name?:string;direction?:{name?:string}};
export function isBassRaceStageOption(item:StageClassChoice|undefined):boolean{
 const cls=item?.class??item;
 const normalize=(text:unknown)=>String(text??'').trim().toLowerCase().replace(/[\s_-]/g,'');
 return normalize(cls?.name).includes('bassrace')||normalize(cls?.direction?.name).includes('bassrace');
}
export function primaryNumberClassCount(ids:readonly string[],classes:readonly StageClassChoice[]):number{
 const lookup=new Map(classes.map(item=>[String(item.classId??item.class?.id??item.id),item]));
 const regular=ids.filter(id=>!isBassRaceStageOption(lookup.get(id))).length;
 const bass=ids.length-regular;
 return regular+(bass>0&&regular<MAX_PRIMARY_NUMBER_CLASSES?1:0);
}
export function nextRegistrationClassIds(
 ids:readonly string[],id:string,checked:boolean,classes:readonly StageClassChoice[],
):string[]{
 if(!checked)return ids.filter(value=>value!==id);
 if(!id||ids.includes(id)||ids.length>=MAX_REGISTRATION_CLASSES)return [...ids];
 const item=classes.find(option=>String(option.classId??option.class?.id??option.id)===id);
 if(!item)return [...ids];
 const next=[...ids,id];
 return primaryNumberClassCount(next,classes)>MAX_PRIMARY_NUMBER_CLASSES?[...ids]:next;
}
export type ConfigurationReviewAnswer=''|'unchanged'|'updated';
export function canContinueVehicleRegistration(vehicleReady:boolean,repeatVehicle:boolean,answer:ConfigurationReviewAnswer,updatedReviewed:boolean):boolean{
 if(!vehicleReady)return false;
 if(!repeatVehicle)return true;
 return answer==='unchanged'||(answer==='updated'&&updatedReviewed);
}
