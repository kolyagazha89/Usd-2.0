/** Sticker numbering policy for USD competitions.
 * Five is the limit on a single PRIMARY competitor number, not a limit
 * on BassRace classes in the complete registration. Each additional
 * BassRace entry receives its own separate stage-unique number.
 */
export const MAX_CLASSES_ON_PRIMARY_NUMBER=5;
export const MAX_REGISTRATION_CLASS_IDS=100; // Input safety bound, not a five-class rule.

export type NumberingStageClass={
 classId:string;
 class:{name:string;direction?:{name?:string|null}|null};
};

export function isBassRaceStageClass(className:string,directionName=''):boolean{
 const normalize=(name:string)=>String(name??'').trim().toLowerCase().replace(/[\s_-]/g,'');
 return normalize(className).includes('bassrace')||normalize(directionName).includes('bassrace');
}

export function planRegistrationClassNumbers(
 requestedIds:readonly string[],stageClasses:readonly NumberingStageClass[],
){
 const byId=new Map(stageClasses.map(item=>[item.classId,item]));
 const regularClassIds:string[]=[],bassRaceClassIds:string[]=[];
 for(const id of requestedIds){
  const entry=byId.get(id);
  if(!entry)throw new Error('Недоступный класс в заявке.');
  if(isBassRaceStageClass(entry.class.name,entry.class.direction?.name??''))bassRaceClassIds.push(id);
  else regularClassIds.push(id);
 }
 if(regularClassIds.length>MAX_CLASSES_ON_PRIMARY_NUMBER)
  throw new Error('На основном номере допускается не более 5 классов по всем направлениям. Классы BassRace сверх этого лимита получают отдельные номера.');
 const bassOnPrimaryId=regularClassIds.length<MAX_CLASSES_ON_PRIMARY_NUMBER?bassRaceClassIds[0]??null:null;
 return {
  regularClassIds,bassRaceClassIds,bassOnPrimaryId,
  primaryClassCount:regularClassIds.length+(bassOnPrimaryId?1:0),
  requiredNumberCount:1+bassRaceClassIds.length-(bassOnPrimaryId?1:0),
 };
}
