/** Shared admin resource filters. Stage workflow states are not generic active flags. */
export type ResourceStatusFilter='ALL'|'ACTIVE'|'INACTIVE'|'DRAFT'|'PUBLISHED'|'COMPLETED'|'CANCELLED';

export type StatusOption={value:ResourceStatusFilter;label:string};

const genericOptions:readonly StatusOption[]=[
 {value:'ALL',label:'Все'},
 {value:'ACTIVE',label:'Активные'},
 {value:'INACTIVE',label:'Скрытые/завершённые'},
];
const stageOptions:readonly StatusOption[]=[
 {value:'ALL',label:'Все этапы'},
 {value:'PUBLISHED',label:'Опубликованные'},
 {value:'DRAFT',label:'Черновики'},
 {value:'COMPLETED',label:'Завершённые'},
 {value:'CANCELLED',label:'Отменённые'},
 {value:'INACTIVE',label:'Завершённые и отменённые'},
];

export function resourceStatusOptions(path:string):readonly StatusOption[]{
 return path==='/stages'?stageOptions:genericOptions;
}

/** Continue to support old sessionStorage status filters after upgrading. */
export function normalizedResourceStatus(path:string,filter:ResourceStatusFilter):ResourceStatusFilter{
 return path==='/stages'&&filter==='ACTIVE'?'PUBLISHED':filter;
}

export function resourceStatusMatches(path:string,row:any,filter:ResourceStatusFilter):boolean{
 if(filter==='ALL')return true;
 const state=normalizedResourceStatus(path,filter);
 if(path==='/stages'){
  if(state==='INACTIVE')return row?.status==='COMPLETED'||row?.status==='CANCELLED';
  return row?.status===state;
 }
 if(state==='ACTIVE')return row?.isActive===true||row?.status==='ACTIVE'||row?.status==='PUBLISHED';
 if(state==='INACTIVE')return row?.isActive===false||row?.status==='CANCELLED'||row?.status==='ARCHIVED';
 return false;
}

export function resourceEmptyMessage({total,search}:{total:number;search:string;filtered?:number}):string{
 if(total===0)return 'Записей пока нет';
 return search.trim()?'По запросу ничего не найдено':'Нет записей с выбранными фильтрами';
}
