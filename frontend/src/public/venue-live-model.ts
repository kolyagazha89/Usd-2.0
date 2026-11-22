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

/** Two independent TV feeds. Both are LAN-only; other disciplines are omitted. */
export type VenueTvScreen='spl'|'bfspl-bdw';
export type VenueTvMode='all'|VenueTvScreen;
export type VenueTvSlide={
 id:string;screen:VenueTvScreen;heading:string;group:VenueLiveGroup|null;
 rows:VenueLiveRow[];page:number;pages:number;
};
export function venueLiveDirectionScreen(direction:string):VenueTvScreen|null{
 const normalized=String(direction??'').toUpperCase().replace(/[\s_-]+/g,'');
 if(normalized==='SPL')return 'spl';
 if(normalized==='BFSPL'||normalized==='BDWSPL')return 'bfspl-bdw';
 return null;
}
export function parseVenueTvMode(value:string|null):VenueTvMode{
 return value==='spl'||value==='bfspl-bdw'?value:'all';
}
/** Conservative amount for a single 16:9 TV viewport; excess rows rotate, not scroll. */
export function venueLiveRowsPerScreen(height:number,width:number):number{
 const h=Number.isFinite(height)?Math.max(0,height):720;
 const w=Number.isFinite(width)?Math.max(0,width):1280;
 const compact=w<640;
 const rowHeight=compact?54:w<980?58:Math.max(66,Math.min(84,h*.08));
 return Math.max(2,Math.min(compact?5:10,Math.floor(
  (h-(compact?275:w<980?300:330))/rowHeight
 )));
}
/** Rotate through every class, then through its pages. Empty disciplines still get a screen. */
export function buildVenueTvSlides(groups:readonly VenueLiveGroup[],pageSize:number,mode:VenueTvMode='all'):VenueTvSlide[]{
 const count=Math.max(1,Math.min(20,Math.floor(Number.isFinite(pageSize)?pageSize:6)));
 const screens:VenueTvScreen[]=mode==='all'?['spl','bfspl-bdw']:[mode];
 const slides:VenueTvSlide[]=[];
 for(const screen of screens){
  const relevant=groups.filter(group=>venueLiveDirectionScreen(group.direction)===screen);
  const heading=screen==='spl'?'SPL':'BFSPL + BDW SPL';
  if(relevant.length===0){
   slides.push({id:screen+':empty',screen,heading,group:null,rows:[],page:1,pages:1});
   continue;
  }
  for(const group of relevant){
   const pages=Math.max(1,Math.ceil(group.rows.length/count));
   for(let page=1;page<=pages;page++){
    slides.push({id:screen+':'+group.key+':'+page,screen,heading,group,
     rows:group.rows.slice((page-1)*count,page*count),page,pages});
   }
  }
 }
 return slides;
}
