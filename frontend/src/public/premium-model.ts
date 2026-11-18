import {isDbRecordEligible,resultNumericValue} from '../public-result-utils.ts';
/**
 * Stages are scheduled by calendar day, not by their UTC instant.
 * An ISO date stored at midnight UTC must still be shown on that date for
 * visitors west of UTC (otherwise it disappears the previous evening).
 */
function stageCalendarDay(value:unknown):string|null{
 const date=value instanceof Date?value:typeof value==='string'||typeof value==='number'?new Date(value):null;
 if(!date||!Number.isFinite(date.getTime()))return null;
 const iso=typeof value==='string'?value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/):null;
 if(iso){
  const [year,month,day]=iso[1].split('-').map(Number);
  const calendar=new Date(Date.UTC(year,month-1,day));
  if(calendar.getUTCFullYear()!==year||calendar.getUTCMonth()!==month-1||calendar.getUTCDate()!==day)return null;
  return iso[1];
 }
 return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
/**
 * Stage.date is a calendar day persisted at an artificial UTC hour.
 * Countdown is a separate instant: 10:00 Europe/Moscow (UTC+03:00)
 * unless the stage explicitly overrides startTimeMsk. Never count down
 * to the persisted date timestamp or infer a visitor's local timezone.
 */
export const DEFAULT_STAGE_START_TIME_MSK='10:00';
export function stageStartTimeLabel(stage:{startTimeMsk?:string|null}):string{
 return (stage.startTimeMsk??DEFAULT_STAGE_START_TIME_MSK)+' МСК';
}
export function stageCountdownTarget(stage:{date?:unknown;startTimeMsk?:string|null}):number|null{
 const day=stageCalendarDay(stage.date);
 const time=stage.startTimeMsk??DEFAULT_STAGE_START_TIME_MSK;
 if(!day||typeof time!=='string'||!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(time))return null;
 const timestamp=Date.parse(day+'T'+time+':00+03:00');
 return Number.isFinite(timestamp)?timestamp:null;
}

function moscowCalendarDay(now:number):string|null{
 const date=new Date(now);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',
 }).formatToParts(date);
 const read=(part:string)=>parts.find(item=>item.type===part)?.value;
 const year=read('year'),month=read('month'),day=read('day');
 return year&&month&&day?year+'-'+month+'-'+day:null;
}

export function nextPublishedStage(stages:any[]=[],now=Date.now()){
 const today=moscowCalendarDay(now);
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
  if(!person||typeof person!=='object')continue;
  const name=String(person.team??'').trim().replace(/\s+/g,' '),key=name.toLocaleLowerCase('ru');
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
 return rows.filter(isDbRecordEligible)
  .sort((a,b)=>resultNumericValue(b)-resultNumericValue(a))[0];
}
export function personName(person:any){return [person?.lastName,person?.firstName,person?.middleName].filter(Boolean).join(' ')||'Участник USD'}
export function carName(car:any){return [car?.brand,car?.model].map(value=>String(value??'').trim()).filter(value=>value&&!/^(не указано|не указан|нет|—|-)$/i.test(value)).join(' ')||'Автомобиль USD'}
export function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(x=>Array.from(x)[0]??'').join('').toLocaleUpperCase('ru')}
export function stageDate(value:unknown,includeYear=true){
 const day=stageCalendarDay(value);
 if(!day)return 'Дата уточняется';
 // Stage dates are calendar days, not UTC instants. Formatting an ISO midnight
 // in the viewer's timezone shifts the advertised day for some visitors.
 const date=new Date(day+'T00:00:00.000Z');
 return Number.isNaN(date.getTime())?'Дата уточняется':new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',...(includeYear?{year:'numeric'}:{}),timeZone:'UTC'}).format(date);
}
export function countLabel(count:number,one:string,few:string,many:string){const form=new Intl.PluralRules('ru').select(count);return count+' '+(form==='one'?one:form==='few'?few:many)}
