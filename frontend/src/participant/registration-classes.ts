/** Keep the client-side registration picker in sync with the server's five-class cap. */
export const MAX_REGISTRATION_CLASSES=5;

/** Preserve the selected order (the first class determines the main number). */
export function nextRegistrationClassIds(ids:string[],id:string,checked:boolean):string[]{
 if(!checked)return ids.filter(value=>value!==id);
 if(ids.includes(id)||ids.length>=MAX_REGISTRATION_CLASSES)return ids;
 return [...ids,id];
}

export type ConfigurationReviewAnswer=''|'unchanged'|'updated';

/** Returning competitors must explicitly confirm the version they are entering with. */
export function canContinueVehicleRegistration(vehicleReady:boolean,repeatVehicle:boolean,answer:ConfigurationReviewAnswer,updatedReviewed:boolean):boolean{
 if(!vehicleReady)return false;
 if(!repeatVehicle)return true;
 return answer==='unchanged'||(answer==='updated'&&updatedReviewed);
}
