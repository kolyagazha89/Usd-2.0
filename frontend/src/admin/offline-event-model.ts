/** Offline event *pilot*: a sealed, minimal roster and local inspection drafts.
 * No server writes, publication or background sync are performed by this module.
 * The venue hub and authenticated, idempotent sync protocol are still required.
 */
import type {DayRow} from './event-day-model.ts';

export const OFFLINE_PACKAGE_FORMAT=1;
export const OFFLINE_MAX_AGE_MS=72*60*60*1000;
export const OFFLINE_MAX_ENTRIES=2500;
export const OFFLINE_MAX_DRAFT_NOTES=2000;

export type OfflineEntry={
 id:string;
 number:number|null;
 participantName:string;
 car:string;
 registrationNumber:string;
 classes:string[];
 status:'ACTIVE'|'CANCELLED';
 inspection:{id:string|null;status:'PASSED'|'FAILED'|'PENDING';notes:string};
};
export type OfflineInspectionDraft={
 id:string;registrationId:string;actorId:string;createdAt:string;
 baseInspectionId:string|null;
 status:'PASSED'|'FAILED';notes:string;
 state:'LOCAL_ONLY';
};
export type OfflineEventPackage={
 format:1;stage:{id:string;name:string;city:string;date:string};
 actor:{id:string;role:string};
 createdAt:string;expiresAt:string;
 entries:OfflineEntry[];drafts:OfflineInspectionDraft[];
};

const clamp=(value:unknown,max:number)=>String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
const iso=(time:number)=>new Date(time).toISOString();

export function buildOfflineEventPackage({
 stage,rows,actor,now=Date.now(),
}:{
 stage:{id:string;name:string;city?:string|null;date?:string|null};
 rows:readonly DayRow[];actor:{id:string;role:string};now?:number;
}):OfflineEventPackage {
 if(!stage.id||!actor.id||!Number.isFinite(now))
  throw new Error('Не удалось определить этап, судью или время подготовки.');
 if(rows.length>OFFLINE_MAX_ENTRIES)
  throw new Error('Превышен лимит записей. Используйте локальный сервер этапа.');
 const ids=new Set<string>();
 const entries=rows.map(row=>{
  if(!row.id||ids.has(row.id))throw new Error('В списке есть пустые или повторяющиеся ID регистрации.');
  ids.add(row.id);
  const inspect=row.stageInspection??row.inspection;
  return {
   id:row.id,
   number:row.participantNumber??row.numbers?.find(n=>Number.isSafeInteger(n.number)&&Number(n.number)>0)?.number??null,
   participantName:clamp([row.participant?.lastName,row.participant?.firstName,row.participant?.middleName].filter(Boolean).join(' '),180)||'Без имени',
   car:clamp([row.car?.brand,row.car?.model].filter(Boolean).join(' '),180)||'Автомобиль не указан',
   registrationNumber:clamp(row.car?.registrationNumber,20),
   classes:(row.classes??[]).slice(0,5).map(c=>clamp([c.class?.direction?.name,c.class?.name].filter(Boolean).join(' · '),130)).filter(Boolean),
   status:row.status==='ACTIVE'?'ACTIVE' as const:'CANCELLED' as const,
   inspection:{
    id:typeof inspect?.id==='string'?inspect.id:null,
    status:inspect?.status==='PASSED'?'PASSED' as const:inspect?.status==='FAILED'?'FAILED' as const:'PENDING' as const,
    notes:clamp(inspect?.notes,OFFLINE_MAX_DRAFT_NOTES),
   },
  };
 });
 return {
  format:1,stage:{id:clamp(stage.id,100),name:clamp(stage.name,160),
   city:clamp(stage.city,100),date:clamp(stage.date,40)},
  actor:{id:clamp(actor.id,100),role:clamp(actor.role,60)},
  createdAt:iso(now),expiresAt:iso(now+OFFLINE_MAX_AGE_MS),entries,drafts:[],
 };
}
export function assertOfflinePackage(value:unknown,now=Date.now()):asserts value is OfflineEventPackage {
 if(!value||typeof value!=='object')throw new Error('Некорректный автономный пакет.');
 const data=value as Partial<OfflineEventPackage>;
 if(data.format!==OFFLINE_PACKAGE_FORMAT||!data.stage?.id||!data.actor?.id
  ||!Array.isArray(data.entries)||!Array.isArray(data.drafts)||data.entries.length>OFFLINE_MAX_ENTRIES)
  throw new Error('Неподдерживаемый формат автономного пакета.');
 const created=Date.parse(String(data.createdAt)),expiry=Date.parse(String(data.expiresAt));
 if(!Number.isFinite(created)||!Number.isFinite(expiry)||expiry<=created
  ||expiry-created>OFFLINE_MAX_AGE_MS||!Number.isFinite(now)||now>expiry||now<created-5*60*1000)
  throw new Error('Срок действия пакета истёк или время устройства неверно. Обновите пакет у организатора.');
 const ids=new Set<string>();
 for(const item of data.entries){
  if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id)
   ||!['ACTIVE','CANCELLED'].includes(item.status)||!Array.isArray(item.classes))
   throw new Error('Повреждён список регистраций.');
  ids.add(item.id);
 }
 for(const draft of data.drafts){
  if(!draft||!draft.id||!ids.has(draft.registrationId)||draft.actorId!==data.actor.id
   ||draft.state!=='LOCAL_ONLY'||!['PASSED','FAILED'].includes(draft.status)
   ||typeof draft.notes!=='string'||draft.notes.length>OFFLINE_MAX_DRAFT_NOTES)
   throw new Error('Повреждён локальный черновик инспекции.');
 }
}
export function recordOfflineInspection(
 value:OfflineEventPackage,
 registrationId:string,
 status:'PASSED'|'FAILED',
 notes:string,
 now=Date.now(),
 id:string=crypto.randomUUID(),
):OfflineEventPackage {
 assertOfflinePackage(value,now);
 const entry=value.entries.find(e=>e.id===registrationId);
 if(!entry||entry.status!=='ACTIVE')throw new Error('Регистрация отменена или отсутствует в пакете.');
 if(entry.inspection.status!=='PENDING')
  throw new Error('Инспекция уже была выполнена до подготовки пакета. Изменение требует подключения к серверу.');
 if(value.drafts.some(d=>d.registrationId===registrationId))
  throw new Error('Для этой регистрации уже сохранён черновик. Проверьте его перед продолжением.');
 if(!['PASSED','FAILED'].includes(status))throw new Error('Недопустимый результат инспекции.');
 const cleanNotes=notes.trim();
 if(cleanNotes.length>OFFLINE_MAX_DRAFT_NOTES||status==='FAILED'&&!cleanNotes)
  throw new Error('Для отказа обязательно укажите причину до 2000 символов.');
 return {...value,drafts:[...value.drafts,{
  id,registrationId,actorId:value.actor.id,createdAt:iso(now),
  baseInspectionId:entry.inspection.id,status,
  notes:status==='FAILED'?cleanNotes:'',
  state:'LOCAL_ONLY' as const,
 }]};
}
export function findOfflineEntries(data:OfflineEventPackage,search:string):OfflineEntry[]{
 const normalized=search.trim().toLocaleLowerCase('ru');
 return data.entries.filter(e=>{
  if(!normalized)return true;
  const no=normalized.replace(/^№\s*/,'');
  if(/^\d+$/.test(no))return e.number!==null&&String(e.number)===String(Number(no));
  return [e.participantName,e.car,e.registrationNumber,...e.classes].join(' ').toLocaleLowerCase('ru').includes(normalized);
 }).sort((a,b)=>(a.number??Infinity)-(b.number??Infinity)||a.participantName.localeCompare(b.participantName,'ru'));
}
