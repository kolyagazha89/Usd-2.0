export type AdminEntityKind='car'|'stage'|'participant';
export type AdminRelation={kind:AdminEntityKind;id:string};
export function adminEntityPath(kind:AdminEntityKind,id:unknown):string|null{
 if(typeof id!=='string'||!id.trim())return null;
 const encoded=encodeURIComponent(id);
 return kind==='car'?'/admin/cars?carId='+encoded:kind==='stage'?'/admin/stages/'+encoded:'/admin/participants?view='+encoded;
}
export function safeAdminReturn(value:unknown):string|null{
 if(typeof value!=='string'||value.length>8000||/[\\\s]/.test(value)||!/^\/admin(?:\/|\?|$)/.test(value))return null;
 try{const url=new URL(value,'https://usd.invalid');return url.pathname.split('/').includes('..')||url.pathname!==value.split('?')[0]?null:value}catch{return null}
}
export function adminCarEditorPath(carId:string,returnTo:string):string{
 const source=safeAdminReturn(returnTo);
 return '/admin/cars/edit?carId='+encodeURIComponent(carId)+(source?'&returnTo='+encodeURIComponent(source):'');
}
const identityFields:Record<AdminEntityKind,string[]>={car:['brand','model','registrationNumber'],stage:['name','stageNumber'],participant:['lastName','firstName','middleName']};
export function relationForColumn(row:any,key:string):AdminRelation|null{
 const parts=key.split('.');const field=parts.pop()??'';const kind=parts.pop() as AdminEntityKind;
 if(!identityFields[kind]?.includes(field))return null;
 const parent=parts.reduce((value:any,part)=>value?.[part],row);
 const id=parent?.[kind]?.id??parent?.[kind+'Id'];
 return adminEntityPath(kind,id)?{kind,id}:null;
}
export function relatedAdminEntities(item:any):Array<AdminRelation&{label:string}>{
 const links=new Map<string,AdminRelation&{label:string}>();
 for(const row of [item,item?.registration,item?.result?.registration]){
  for(const kind of ['car','stage','participant'] as const){
   const entity=row?.[kind],id=entity?.id??row?.[kind+'Id'];
   if(!adminEntityPath(kind,id))continue;
   const label=kind==='car'?[entity?.brand,entity?.model].filter(Boolean).join(' '):kind==='stage'?entity?.name:[entity?.lastName,entity?.firstName,entity?.middleName].filter(Boolean).join(' ');
   const key=kind+':'+id;
   if(!links.has(key))links.set(key,{kind,id,label:label||({car:'Автомобиль',stage:'Этап',participant:'Участник'}[kind])});
  }
 }
 return [...links.values()];
}
