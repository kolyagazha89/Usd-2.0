/** Keep the client-side registration picker in sync with the server's five-class cap. */
export const MAX_REGISTRATION_CLASSES=5;

/** Preserve the selected order (the first class determines the main number). */
export function nextRegistrationClassIds(ids:string[],id:string,checked:boolean):string[]{
 if(!checked)return ids.filter(value=>value!==id);
 if(ids.includes(id)||ids.length>=MAX_REGISTRATION_CLASSES)return ids;
 return [...ids,id];
}
