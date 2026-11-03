/** Maximum number of classes on ONE primary sticker, not on registration. */
export const MAX_REGISTRATION_CLASSES=5;

/** Preserve order while allowing every BassRace class to have its own sticker.
 * The backend is authoritative for the final per-number assignment. */
export function nextRegistrationClassIds(ids:string[],id:string,checked:boolean,isBassRace=false,selectedNonBassRaceCount=ids.length):string[]{
 if(!checked)return ids.filter(value=>value!==id);
 if(ids.includes(id)||(!isBassRace&&selectedNonBassRaceCount>=MAX_REGISTRATION_CLASSES))return ids;
 return [...ids,id];
}

export type ConfigurationReviewAnswer=''|'unchanged'|'updated';

/** Returning competitors must explicitly confirm the version they are entering with. */
export function canContinueVehicleRegistration(vehicleReady:boolean,repeatVehicle:boolean,answer:ConfigurationReviewAnswer,updatedReviewed:boolean):boolean{
 if(!vehicleReady)return false;
 if(!repeatVehicle)return true;
 return answer==='unchanged'||(answer==='updated'&&updatedReviewed);
}
