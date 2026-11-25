type Named=string|{name?:string|null}|null;
type GateClass={class?:{name?:string|null;code?:string|null;direction?:{name?:string|null}|null}|null;number?:{number?:number|null}|null};
type GateRow={
 id?:string;status?:string;source?:string;participantNumber?:number|null;
 participant?:{lastName?:string|null;firstName?:string|null;middleName?:string|null}|null;
 car?:{brand?:Named;model?:Named;registrationNumber?:string|null}|null;
 numbers?:{number?:number|null;isPrimary?:boolean}[]|null;
 classes?:GateClass[]|null;
};
type Stage={name?:string;city?:string;date?:string};
type Cell=string|number;
type Sheet={name:string;rows:Cell[][];widths:number[]};
const label=(v:Named|undefined):string=>typeof v==='string'?v:v?.name??'';
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const normalize=(s:unknown)=>String(s??'').toLowerCase().replace(/[\s_-]/g,'');
const headers=['Инспекция','№ участника','ФИО','Авто','Госномер','SPL','BFSPL','BDW SPL','BassRace','Hurricane'];
const limits=[[8,10],[7,8],[20,29],[13,20],[11,14],[9,18],[9,18],[10,18],[10,18],[11,18]];
function classColumn(c:GateClass):number{
 const d=normalize(c.class?.direction?.name),identity=[d,normalize(c.class?.name),normalize(c.class?.code)].join(' ');
 if(identity.includes('bassrace')||identity.includes('bacc race'))return 8;
 if(identity.includes('bfspl'))return 6;
 if(identity.includes('bdw')||identity.includes('dbwspl'))return 7;
 if(identity.includes('hurrican')||identity.includes('stormwall'))return 9;
 if(d==='spl'||identity.includes('spl'))return 5;
 return -1;
}
function allNumbers(r:GateRow){
 return Array.from(new Set([r.participantNumber,...(r.numbers??[]).map(n=>n.number),...(r.classes??[]).map(c=>c.number?.number)].filter(positive)));
}
function makeRow(r:GateRow,n:number):Cell[]{
 const row:Cell[]=['',n,[r.participant?.lastName,r.participant?.firstName,r.participant?.middleName].filter(Boolean).join(' '),[label(r.car?.brand),label(r.car?.model)].filter(Boolean).join(' '),r.car?.registrationNumber??'','','','','',''];
 for(const c of r.classes??[]){
  if((c.number?.number??r.participantNumber)!==n)continue;
  const i=classColumn(c);
  // Unknown classes must remain visible rather than silently disappear.
  const col=i<0?5:i;
  const name=[i<0?c.class?.direction?.name:null,c.class?.name].filter(Boolean).join(' · ');
  if(name)row[col]=[row[col],i<0?'[?] '+name:name].filter(Boolean).join('\n');
 }
 return row;
}
export function buildGatePaperSheets(stage:Stage,rows:readonly GateRow[],observedAt:string):Sheet[]{
 const context='USD · '+[stage.name,stage.city,stage.date?.slice(0,10)].filter(Boolean).join(' · ');
 const stamp='Снимок: '+observedAt+' (UTC)';
 const occupied=new Map<number,Cell[]>();
 for(const r of rows.filter(r=>r.status==='ACTIVE')){
  for(const n of allNumbers(r)){
   if(occupied.has(n))throw new Error('Дублирующийся стартовый номер '+n+' — проверьте регистрации');
   occupied.set(n,makeRow(r,n));
  }
 }
 const last=Math.max(100,...occupied.keys());
 const data=Array.from({length:last},(_,i)=>occupied.get(i+1)??['',i+1,'','','','','','','','']);
 const widths=headers.map((header,i)=>Math.min(limits[i][1],Math.max(limits[i][0],header.length+1,...data.map(row=>Math.max(...String(row[i]??'').split('\n').map(line=>line.length+1))))));
 return [{name:'Регистрация',rows:[[context],[stamp],headers,...data],widths}];
}
