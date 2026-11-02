import {isDbRecordEligible,resultNumericValue,sortRecordRows} from '../public-result-utils.ts';

export function resultClass(row:any){
 return row?.registrationClass?.class??row?.class??row?.result?.registrationClass?.class??{};
}
export function resultEntryNumber(row:any):number|null{
 const candidate=row?.registrationClass?.number?.number??row?.registration?.participantNumber??row?.registration?.number??row?.participantNumber;
 if(candidate===null||candidate===undefined||candidate==='')return null;
 const number=Number(candidate);
 return Number.isInteger(number)&&number>0?number:null;
}
export function groupLiveByClass(rows:any[]){
 const groups=new Map<string,{key:string;name:string;direction:string;sortDirection:number;sortClass:number;rows:any[]}>();
 for(const row of rows){
  if(!row||typeof row!=='object')continue;
  const cls=resultClass(row),direction=cls.direction??{};
  const name=String(cls.name??'').trim()||'Класс не указан';
  const directionName=String(direction.name??'').trim();
  const key=String(cls.id??row.registrationClass?.classId??[directionName,name].join(':')).toLocaleLowerCase('ru');
  let group=groups.get(key);
  if(!group){
   group={key,name,direction:directionName,sortDirection:Number(direction.sortOrder??999),sortClass:Number(cls.sortOrder??999),rows:[]};
   groups.set(key,group);
  }
  group.rows.push(row);
 }
 const place=(r:any)=>{const n=Number(r.place??r.position);return Number.isInteger(n)&&n>0?n:Number.MAX_SAFE_INTEGER};
 return [...groups.values()].map(group=>({
  ...group,
  rows:group.rows.slice().sort((a,b)=>place(a)-place(b)||resultNumericValue(b)-resultNumericValue(a)),
 })).sort((a,b)=>a.sortDirection-b.sortDirection||a.sortClass-b.sortClass||a.name.localeCompare(b.name,'ru',{numeric:true}));
}
export function otherHomepageRecords(rows:any[],bestId:string){
 return sortRecordRows(rows.filter(isDbRecordEligible)).filter(r=>r.id!==bestId);
}
