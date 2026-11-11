/** Minimal privacy-safe venue scoreboard response, not a profile endpoint. */
export type VenueLiveRow={
 id:string;value:string;unit:string;place:number|null;number:number|null;
 participant:string;car:string;
 class:{id:string;name:string;unit?:string;sortOrder?:number;
  direction?:{name:string;sortOrder?:number}};
};
export type VenueLiveSnapshot={
 stage:{id:string;name:string;city?:string|null;date?:string|null};
 updatedAt:string;rows:VenueLiveRow[];
};
export type VenueLiveGroup={
 key:string;name:string;direction:string;sortDirection:number;sortClass:number;
 rows:VenueLiveRow[];
};
const placeOf=(row:VenueLiveRow)=>{
 const number=Number(row.place);
 return row.place!==null&&Number.isSafeInteger(number)&&number>0?number:Number.MAX_SAFE_INTEGER;
};
export function groupVenueLiveRows(rows:readonly VenueLiveRow[]):VenueLiveGroup[]{
 const groups=new Map<string,VenueLiveGroup>();
 const seen=new Set<string>();
 for(const row of rows){
  if(!row?.id||seen.has(row.id))continue;
  seen.add(row.id);
  const cls=row.class??{id:'',name:'Класс не указан'};
  const key=cls.id||[cls.direction?.name,cls.name].join(':');
  let group=groups.get(key);
  if(!group){
   group={key,name:cls.name||'Класс не указан',direction:cls.direction?.name||'USD',
    sortDirection:cls.direction?.sortOrder??999,sortClass:cls.sortOrder??999,rows:[]};
   groups.set(key,group);
  }
  group.rows.push(row);
 }
 return [...groups.values()].map(group=>({
  ...group,rows:group.rows.slice().sort((a,b)=>placeOf(a)-placeOf(b)
   ||Number(b.value)-Number(a.value)||a.id.localeCompare(b.id)),
 })).sort((a,b)=>a.sortDirection-b.sortDirection||a.sortClass-b.sortClass
  ||a.name.localeCompare(b.name,'ru',{numeric:true}));
}
/** LAN health is measured by successful local reads, NEVER navigator.onLine. */
export function isVenueLiveSnapshotCurrent(lastSuccess:number|null,now=Date.now()):boolean{
 return lastSuccess!==null&&Number.isFinite(lastSuccess)
  &&now>=lastSuccess&&now-lastSuccess<12000;
}
