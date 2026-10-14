import {useEffect,useState} from 'react';
import {FileClock,RefreshCw} from 'lucide-react';
import {getAudit,listData,type Role} from '../api';
import {humanize} from './AdminPrimitives';

export function AuditPage({PageFrame,ErrorPanel,LoadingPage,Empty,enumLabel,formatDate,roleName}:{PageFrame:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>;enumLabel:(v:any)=>string;formatDate:(v:string)=>string;roleName:Record<string,string>}){
 const[data,setData]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const[entity,setEntity]=useState(''),[action,setAction]=useState('');
 const load=async()=>{setLoading(true);setError('');try{const r=await getAudit(1,100,entity,action);setData(listData(r))}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить аудит')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[entity,action]);
 const actions=[...new Set(data.map(x=>x.action).filter(Boolean))];
 return <PageFrame title="Аудит" subtitle="Понятная история: кто, что, где и когда изменил в системе." action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  <div className="audit-toolbar panel">
   <label>Раздел<select value={entity} onChange={e=>setEntity(e.target.value)}><option value="">Все разделы</option>{['User','Participant','Car','CarConfiguration','Season','Stage','StageClass','Direction','Class','Registration','RegistrationClass','RegistrationNumber','Inspection','Result','Record','Disqualification','ImportJob','ImportRow','MediaUpload','AssistantRequest','SiteSettings'].map(x=><option key={x} value={x}>{auditEntityName(x)}</option>)}</select></label>
   <label>Действие<select value={action} onChange={e=>setAction(e.target.value)}><option value="">Все действия</option>{actions.map(x=><option key={x} value={x}>{auditActionName(x)}</option>)}</select></label>
   <div className="audit-count"><strong>{data.length}</strong><span>событий показано</span></div>
  </div>
  {error&&<ErrorPanel message={error} retry={load}/>}
  {loading?<LoadingPage/>:<div className="audit-list">{data.map((x:any)=><AuditEntryCard key={x.id} item={x} enumLabel={enumLabel} formatDate={formatDate} humanizeAuditKey={humanizeAuditKey} roleName={roleName}/>)}</div>}
  {!loading&&!data.length&&<div className="panel"><Empty text="По выбранным фильтрам событий нет"/></div>}
 </PageFrame>
}
function AuditEntryCard({item,enumLabel,formatDate,humanizeAuditKey,roleName}:{item:any;enumLabel:(v:any)=>string;formatDate:(v:string)=>string;humanizeAuditKey:(v:string)=>string;roleName:Record<string,string>}){
 const meta=item.metadata&&typeof item.metadata==='object'?item.metadata:{};
 const actor=item.user?.name||item.user?.email||'Система';
 const details=Object.entries(meta).filter(([k,v])=>v!==null&&v!==undefined&&k!=='password'&&!/id$/i.test(k)&&!/Ids$/i.test(k)).slice(0,8);
 return <article className="audit-entry">
  <div className="audit-entry-icon"><FileClock size={17}/></div>
  <div className="audit-entry-main">
   <div className="audit-entry-head"><strong>{auditActionName(item.action)}</strong><time>{new Date(item.createdAt).toLocaleString('ru-RU')}</time></div>
   <div className="audit-entry-sub"><span className="badge">{actor}</span><span>{roleName[item.user?.role as Role]??'Система'}</span><span>·</span><span>{auditEntityName(item.entity)}</span></div>
   {details.length>0&&<div className="audit-details">{details.map(([k,v])=><div key={k}><span>{humanizeAuditKey(k)}</span><strong>{formatAuditValue(v,enumLabel)}</strong></div>)}</div>}
   {item.ipAddress&&<small className="audit-ip">IP: {item.ipAddress}</small>}
  </div>
 </article>
}
function auditEntityName(x:string){const m:Record<string,string>={Stage:'Этап',Registration:'Регистрация',Participant:'Участник',Car:'Автомобиль',Result:'Результат',Inspection:'Инспекция',ImportJob:'Импорт',AssistantRequest:'Запрос ассистента',SiteSettings:'Настройки сайта',User:'Пользователь',Disqualification:'Дисквалификация',Season:'Сезон',Class:'Класс',Direction:'Направление',Record:'Рекорд'};return m[x]??humanize(x)}
function auditActionName(x:string){const m:Record<string,string>={
 CREATE:'Создание',UPDATE:'Изменение',DELETE:'Удаление',LOGIN:'Вход',LOGOUT:'Выход',HISTORICAL_RESULT_CREATED:'Добавлен исторический результат',HISTORICAL_RESULT_VERIFIED:'Исторический результат подтверждён',HISTORICAL_RESULT_CORRECTED:'Исторический результат исправлен',INSPECTION_DELETED:'Инспекция удалена',ASSISTANT_AI_USED:'Ассистент ИИ использован',
 IMPORT_PREVIEW:'Предпросмотр импорта',IMPORT_COMMITTED:'Импорт зафиксирован',IMPORT_ROW_RESOLVED:'Строка импорта исправлена',
 INSPECTION_CREATED:'Инспекция создана',INSPECTION_UPDATED:'Инспекция изменена',RESULT_CREATED:'Результат внесён',RESULT_UPDATED:'Результат изменён',RESULT_DELETED:'Результат удалён',
 DISQUALIFICATION_CREATED:'Дисквалификация создана',DISQUALIFICATION_REVOKED:'Дисквалификация отозвана',
 ASSISTANT_CHAT_USED:'Использован чат ассистента',ASSISTANT_FUNCTION_EXECUTED:'Выполнена функция ассистента',ASSISTANT_REQUEST_CREATED:'Создан запрос ассистента',ASSISTANT_REQUEST_SUBMITTED:'Запрос отправлен на подтверждение',ASSISTANT_REQUEST_APPROVED:'Запрос подтверждён',ASSISTANT_REQUEST_REJECTED:'Запрос отклонён',ASSISTANT_REQUEST_APPLIED:'Запрос применён',
 SITE_SETTINGS_UPDATED:'Настройки сайта изменены',USER_CREATED:'Пользователь создан',USER_UPDATED:'Пользователь изменён'
 };if(m[x])return m[x];const words:Record<string,string>={CREATE:'Создание',UPDATE:'Изменение',DELETE:'Удаление',LOGIN:'Вход',LOGOUT:'Выход',CREATED:'Создано',UPDATED:'Изменено',DELETED:'Удалено',VERIFIED:'Подтверждено',CORRECTED:'Исправлено',REVOKED:'Отозвано',COMMITTED:'Зафиксировано',RESOLVED:'Исправлено',USED:'Использован',EXECUTED:'Выполнено',SUBMITTED:'Отправлено',APPROVED:'Подтверждено',REJECTED:'Отклонено',APPLIED:'Применено',HISTORICAL:'Исторический',RESULT:'результат',INSPECTION:'инспекция',DISQUALIFICATION:'дисквалификация',REGISTRATION:'регистрация',IMPORT:'импорт',USER:'пользователь',CAR:'автомобиль',PARTICIPANT:'участник',STAGE:'этап',SEASON:'сезон',CLASS:'класс',ASSISTANT:'ассистент',FUNCTION:'функция',CHAT:'чат',SITE:'сайт',SETTINGS:'настройки',PREVIEW:'предпросмотр',ROW:'строка',DATA:'данные',QUALITY:'качество'};return x.split('_').map(w=>words[w]??w.toLowerCase()).join(' ')}
function humanizeAuditKey(x:string){const m:Record<string,string>={stageId:'Этап',rowsCount:'Количество строк',historicalResults:'Исторический импорт',type:'Тип',title:'Название',functionCode:'Функция',scope:'Область',reason:'Причина',confirmation:'Подтверждение',status:'Статус',risk:'Риск',entity:'Раздел',before:'До изменения',after:'После изменения',sections:'Изменённые разделы',model:'Модель ассистента'};return m[x]??humanize(x)}
function formatAuditValue(v:any,enumLabel:(v:any)=>string){if(typeof v==='boolean')return v?'Да':'Нет';if(typeof v==='string')return enumLabel(v);if(typeof v==='object')return JSON.stringify(v);return String(v)}

export default AuditPage;
