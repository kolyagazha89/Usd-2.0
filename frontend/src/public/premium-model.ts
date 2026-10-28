/**
 * Stages are scheduled by calendar day, not by their UTC instant.
 * An ISO date stored at midnight UTC must still be shown on that date for
 * visitors west of UTC (otherwise it disappears the previous evening).
 */
function stageCalendarDay(value:unknown):string|null{
 const date=value instanceof Date?value:typeof value==='string'||typeof value==='number'?new Date(value):null;
 if(!date||!Number.isFinite(date.getTime()))return null;
 const iso=typeof value==='string'?value.match(/^(\\d{4}-\\d{2}-\\d{2})(?:T|$)/):null;
 if(iso)return iso[1];
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export function nextPublishedStage(stages:any[]=[],now=Date.now()){
 const today=stageCalendarDay(new Date(now));
 if(!today)return undefined;
 return stages.filter(stage=>{
  const day=stageCalendarDay(stage?.date);
  return stage?.status==='PUBLISHED'&&stage?.isDeleted!==true&&day!==null&&day>=today;
 }).sort((a,b)=>(stageCalendarDay(a.date)??'').localeCompare(stageCalendarDay(b.date)??''))[0];
}

export function publishedNews(rows:any[]=[],now=Date.now()){
 return rows.filter(row=>{
  if(!row||row.isPublished===false)return false;
  if(!row.publishedAt)return true;
  const publishedAt=new Date(row.publishedAt).getTime();
  return Number.isFinite(publishedAt)&&publishedAt<=now;
 }).slice().sort((a,b)=>{
  const date=(row:any)=>{const value=new Date(row.publishedAt||row.createdAt||0).getTime();return Number.isFinite(value)?value:0};
  return date(b)-date(a);
 });
}
export function teamGroups(people:any[]=[]){
 const groups=new Map<string,{name:string;members:any[]}>();
 for(const person of people){
  const name=String(person.team??'').trim(),key=name.replace(/\s+/g,' ').toLocaleLowerCase('ru');
  if(person.isPublic===false||!key||['без команды','нет','—','-'].includes(key))continue;
  const team=groups.get(key)??{name,members:[]};team.members.push(person);groups.set(key,team);
 }
 return [...groups.values()].sort((a,b)=>b.members.length-a.members.length||a.name.localeCompare(b.name,'ru'));
}
export function safeHref(value:unknown){
 const text=String(value??'').trim();if(!text||/[\u0000-\u001f\u007f]/.test(text)||text.startsWith('//')||text.includes('\\'))return '';
 if(text.startsWith('/'))return text;
 try{const url=new URL(text);return ['https:','http:','mailto:','tel:'].includes(url.protocol)?url.href:''}catch{return ''}
}
export function stageRegistrationPath(id:string){return '/login?next='+encodeURIComponent('/participant/register?stageId='+encodeURIComponent(id))}
export function highestDbRecord(rows:any[]){
 return rows.filter(row=>{
  const cls=row.class??row.result?.registrationClass?.class??{};
  return row.value!=null&&Number.isFinite(Number(row.value))&&!/MPS|M\/S|М\/С/i.test(String(cls.unit??row.unit??''))&&!/storm wall|hurrican/i.test(String(cls.name??'')+' '+String(cls.direction?.name??''));
 }).sort((a,b)=>Number(b.value)-Number(a.value))[0];
}
export function personName(person:any){return [person?.lastName,person?.firstName,person?.middleName].filter(Boolean).join(' ')||'Участник USD'}
export function carName(car:any){return [car?.brand,car?.model].map(value=>String(value??'').trim()).filter(value=>value&&!/^(не указано|не указан|нет|—|-)$/i.test(value)).join(' ')||'Автомобиль USD'}
export function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(x=>Array.from(x)[0]??'').join('').toLocaleUpperCase('ru')}
export function stageDate(value:unknown){const d=new Date(String(value??''));return Number.isNaN(d.getTime())?'Дата уточняется':new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(d)}
export function countLabel(count:number,one:string,few:string,many:string){const form=new Intl.PluralRules('ru').select(count);return count+' '+(form==='one'?one:form==='few'?few:many)}
