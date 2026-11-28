import {AdminListPagination} from './AdminListPagination';
import {AdminEntityLink,AdminRelatedEntities} from './AdminEntityLink';
import {useEffect,useRef,useState} from 'react';
import {FileClock,RefreshCw,Search,ArrowRight,UserRound,Clock3} from 'lucide-react';
import {getAudit,listData,type Role} from '../api';
import {describeAuditEvent,auditActionName,auditEntityName} from './audit-presentation';
import './audit-journal.css';

const defaultEntities=['User','Role','Participant','Car','CarConfiguration','Season','Stage','StageClass','Direction','Class','Registration','RegistrationClass','RegistrationNumber','Inspection','ParticipantStageInspection','RegistrationClassInspection','Result','Record','Disqualification','ImportJob','ImportRow','MediaUpload','SiteSettings','Team','ProfileLinkRequest','OfflineInspectionOperation','PublicSite'];
const emptyFilters={search:'',from:'',to:''};
const sorted=(items:string[],name:(key:string)=>string)=>[...new Set(items.filter(Boolean))].sort((a,b)=>name(a).localeCompare(name(b),'ru'));
const eventDate=(value:unknown)=>{const date=new Date(String(value??''));return Number.isFinite(date.getTime())?date.toLocaleString('ru-RU',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' МСК':'Время не сохранено'};

export function AuditPage({PageFrame,ErrorPanel,LoadingPage,Empty,roleName}:{PageFrame:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>;enumLabel:(v:any)=>string;formatDate:(v:string)=>string;roleName:Record<Role,string>}){
 const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(25),[total,setTotal]=useState(0);
 const requestSequence=useRef(0);
 const[entity,setEntity]=useState(''),[action,setAction]=useState('');
 const [draft,setDraft]=useState(emptyFilters),[filters,setFilters]=useState(emptyFilters);
 const [options,setOptions]=useState<{entities:string[];actions:string[]}>({entities:[],actions:[]});
 const load=async()=>{
  const request=++requestSequence.current;setLoading(true);setError('');
  try{
   const r=await getAudit(page,pageSize,entity,action,filters);if(request!==requestSequence.current)return;
   const rows=listData(r),count=r?.pagination?.total??rows.length;
   setData(rows);setTotal(count);
   setOptions({entities:Array.isArray(r?.filters?.entities)?r.filters.entities:rows.map(x=>x.entity),actions:Array.isArray(r?.filters?.actions)?r.filters.actions:rows.map(x=>x.action)});
   setPage(current=>Math.min(current,Math.max(1,Math.ceil(count/pageSize))));
  }catch(e){if(request===requestSequence.current){setError(e instanceof Error?e.message:'Не удалось загрузить аудит');setData([]);setTotal(0)}}
  finally{if(request===requestSequence.current)setLoading(false)}
 };
 useEffect(()=>{void load();return()=>{requestSequence.current++}},[entity,action,page,pageSize,filters]);
 const entities=sorted([...defaultEntities,...options.entities,entity],auditEntityName);
 const actions=sorted([...options.actions,action,...(entity==='PublicSite'?['PUBLIC_PAGE_VIEW']:[])],auditActionName);
 const reset=()=>{setEntity('');setAction('');setDraft(emptyFilters);setFilters(emptyFilters);setPage(1)};
 const active=Boolean(entity||action||filters.search||filters.from||filters.to);
 return <PageFrame title="Журнал действий" subtitle="Кто, когда и что изменил в системе. История сохранена без изменений." action={<button type="button" className="secondary-button compact" disabled={loading} onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  <div className="audit-journal">
   <form className="audit-toolbar panel" aria-label="Фильтры журнала действий" onSubmit={e=>{e.preventDefault();setPage(1);setFilters({...draft,search:draft.search.trim()})}}>
    <label>Раздел<select value={entity} onChange={e=>{setEntity(e.target.value);setAction('');setPage(1)}}><option value="">Все разделы</option>{entities.map(x=><option key={x} value={x}>{auditEntityName(x)}</option>)}</select></label>
    <label>Действие<select value={action} onChange={e=>{setAction(e.target.value);setPage(1)}}><option value="">Все действия</option>{actions.map(x=><option key={x} value={x}>{auditActionName(x)}</option>)}</select></label>
    <label>Автор / роль / email<input aria-label="Поиск по автору аудита" type="search" value={draft.search} maxLength={200} placeholder="Имя или роль сотрудника" onChange={e=>setDraft(v=>({...v,search:e.target.value}))}/></label>
    <label>Дата с (МСК)<input type="date" value={draft.from} max={draft.to||undefined} onChange={e=>setDraft(v=>({...v,from:e.target.value}))}/></label>
    <label>Дата по (МСК)<input type="date" value={draft.to} min={draft.from||undefined} onChange={e=>setDraft(v=>({...v,to:e.target.value}))}/></label>
    <div className="audit-filter-actions"><button className="primary-button compact" type="submit"><Search size={15}/>Найти</button>{(active||draft.search||draft.from||draft.to)&&<button type="button" className="secondary-button compact" onClick={reset}>Сбросить</button>}</div>
   </form>
   <div className="audit-journal-summary"><strong>{loading?'Загрузка…':error?'Журнал недоступен':total+' событий'}</strong><span>Новые события сверху · время МСК</span></div>
   <p className="audit-journal-note">Имя, роль и связанные карточки могут отражать текущие данные. Значения «было» и «стало» показываются только из сохранённого события; неизвестные сведения не восстанавливаются по догадке.</p>
   {error&&<ErrorPanel message={error} retry={load}/>}
   {total>0&&!error&&<AdminListPagination label="событий аудита" total={total} page={page} pageCount={Math.max(1,Math.ceil(total/pageSize))} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={size=>{setPageSize(size);setPage(1)}}/>}
   {loading?<LoadingPage/>:!error&&<div className="audit-list">{data.map((x:any)=><AuditEntryCard key={x.id} item={x} roleName={roleName}/>)}</div>}
   {!loading&&!error&&!data.length&&<div className="panel"><Empty text="По выбранным фильтрам событий нет"/></div>}
  </div>
 </PageFrame>
}
function AuditEntryCard({item,roleName}:{item:any;roleName:Record<Role,string>}){
 const event=describeAuditEvent(item,roleName);
 const meta=item.metadata&&typeof item.metadata==='object'&&!Array.isArray(item.metadata)?item.metadata:{};
 const related={...meta,...item.context};
 const directKind=item.entity==='Car'?'car':item.entity==='Stage'?'stage':item.entity==='Participant'?'participant':null;
 const primary=event.details.filter(f=>['value','unit','place','status','reason','notes','changedFields','source','added','removed'].includes(f.key));
 const summaryFields=(primary.length?primary:event.details).slice(0,3);
 const rest=event.details.filter(f=>!summaryFields.includes(f));
 const tone=/DELETED|DELETE|CANCELLED|REVOKED|REJECTED/.test(item.action)?'danger':/CREATED|CREATE|PUBLISHED|APPROVED|VERIFIED/.test(item.action)?'positive':'neutral';
 return <article className="audit-entry audit-event-card" data-tone={tone}>
  <div className="audit-entry-icon"><FileClock size={18} aria-hidden="true"/></div>
  <div className="audit-entry-main">
   <header className="audit-event-header"><div><span className="audit-event-category">{event.entity}</span><h3>{event.action}</h3></div><time dateTime={item.createdAt}><Clock3 size={14} aria-hidden="true"/>{eventDate(item.createdAt)}</time></header>
   <div className="audit-event-context">
    <div><span className="audit-event-label"><UserRound size={13} aria-hidden="true"/>Кто сделал</span><strong>{event.actor}</strong><small>{event.role}{event.email?' · '+event.email:''}</small></div>
    <div><span className="audit-event-label">Что изменено / где</span><strong>{directKind?<AdminEntityLink kind={directKind} id={item.entityId}>{event.target}</AdminEntityLink>:event.target}</strong>{!event.contextResolved&&<small>Связанные данные не сохранены или недоступны</small>}</div>
   </div>
   {event.changes.length>0&&<div className="audit-change-list" aria-label="Изменённые значения">{event.changes.slice(0,3).map(c=><ChangeRow key={c.key} change={c}/>)}</div>}
   {event.hasSnapshots&&!event.changes.length&&<p className="audit-event-muted">В доступных значениях различий нет.</p>}
   {!!summaryFields.length&&<dl className="audit-event-fields">{summaryFields.map(f=><div key={f.key}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
   {!event.hasSnapshots&&!event.details.length&&<p className="audit-event-muted">Дополнительные сведения в записи не сохранены.</p>}
   <AdminRelatedEntities item={related}/>
   <details className="audit-event-expand"><summary>Все подробности{event.changes.length>3?' · ещё '+(event.changes.length-3)+' изменений':''}</summary>
    {event.changes.length>3&&<div className="audit-change-list">{event.changes.slice(3).map(c=><ChangeRow key={c.key} change={c}/>)}</div>}
    {rest.length>0&&<dl className="audit-event-fields">{rest.map(f=><div key={f.key}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}</dl>}
    {!event.hasSnapshots&&<p className="audit-event-muted">Снимки до и после изменения не сохранены в этом событии.</p>}
    <dl className="audit-event-fields audit-event-technical"><div><dt>Номер записи аудита</dt><dd>{item.id||'Не указан'}</dd></div>{item.ipAddress&&<div><dt>IP-адрес</dt><dd>{item.ipAddress}</dd></div>}</dl>
   </details>
  </div>
 </article>
}
function ChangeRow({change}:{change:{label:string;before:string;after:string}}){
 return <div className="audit-change"><strong>{change.label}</strong><div className="audit-change-values"><div><span>Было</span><p>{change.before}</p></div><ArrowRight size={16} aria-hidden="true"/><div><span>Стало</span><p>{change.after}</p></div></div></div>
}

export default AuditPage;
