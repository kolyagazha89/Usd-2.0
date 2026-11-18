import {useCallback,useEffect,useRef,useState} from 'react';
import {filterMailJournalEntries,mailTypeName} from './admin-communications-utils';
import {apiGet} from '../api';
import './mail-journal.css';

type MailJournalRow={
 id:string;type:string;recipient:string;status:string;attempts:number;
 createdAt:string;providerAcceptedAt:string|null;stageId?:string|null;registrationId?:string|null;
};
type JournalResponse={entries:MailJournalRow[];nextCursor:string|null};
const deliveryStatuses:Record<string,string>={
 PROVIDER_ACCEPTED:'Принято провайдером',FAILED:'Ошибка передачи',PENDING:'Ожидает',
 SENDING:'Передаётся',SKIPPED:'Пропущено',
};

export default function EmailJournalPanel(){
 const [filter,setFilter]=useState(''),[search,setSearch]=useState(''),[entries,setEntries]=useState<MailJournalRow[]>([]);
 const requestSequence=useRef(0);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const load=useCallback(async(cursor?:string)=>{
  const request=++requestSequence.current;
  setLoading(true);setError('');
  try{
   const params=new URLSearchParams();
   if(filter)params.set('status',filter);
   if(cursor)params.set('cursor',cursor);
   const data=await apiGet<JournalResponse>('/mail/journal'+(params.size?'?'+params.toString():''));
   if(request!==requestSequence.current)return;
   if(!Array.isArray(data?.entries))throw new Error('Журнал почты: неверный ответ API. Обновите страницу.');
   setEntries(rows=>cursor?[...rows,...data.entries.filter(row=>!rows.some(previous=>previous.id===row.id))]:data.entries);
   setNextCursor(data.nextCursor);
  }catch(e){
   if(request===requestSequence.current)setError(e instanceof Error?e.message:'Не удалось открыть журнал писем');
  }finally{if(request===requestSequence.current)setLoading(false)}
 },[filter]);
 useEffect(()=>{setEntries([]);setNextCursor(null);void load();return()=>{requestSequence.current+=1}},[load]);
 const visibleEntries=filterMailJournalEntries(entries,search);
 return <section id="mail-journal" className="settings-section usd-mail-journal" aria-labelledby="mail-journal-title">
  <div className="usd-mail-journal__heading">
   <div><h2 id="mail-journal-title">Журнал писем</h2>
    <p className="settings-help">Показаны попытки отправки и ответы почтового провайдера. Не подтверждает доставку в папку «Входящие». Секретные ссылки и содержимое писем не сохраняются.</p>
   </div>
   <div className="usd-mail-journal__filters">
    <label className="usd-mail-journal__search">Поиск по загруженным письмам <input type="search" aria-label="Поиск по журналу писем" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Email или тип письма" autoComplete="off"/>{search&&<button type="button" className="secondary-button compact" onClick={()=>setSearch('')}>Очистить поиск</button>}</label>
    <label>Статус <select value={filter} onChange={e=>setFilter(e.target.value)} disabled={loading}>
     <option value="">Все статусы</option>
     {Object.entries(deliveryStatuses).map(([status,label])=><option key={status} value={status}>{label}</option>)}
    </select></label>
    <button type="button" className="secondary-button" onClick={()=>void load()} disabled={loading}>Обновить</button>
   </div>
  </div>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {!loading&&!error&&<p className="usd-mail-journal__count" role="status">Загружено записей: {entries.length}{search?` · найдено: ${visibleEntries.length}`:''}{nextCursor?' · есть ещё страницы':''}</p>}
  {!loading&&entries.length===0&&!error&&<p className="muted">Писем с выбранным статусом пока нет.</p>}
  {!loading&&entries.length>0&&visibleEntries.length===0&&<p className="usd-mail-journal__empty">По запросу ничего не найдено среди загруженных писем. Очистите поиск или загрузите следующую страницу.</p>}
  <div className="usd-mail-journal__list">
   {visibleEntries.map(entry=><article key={entry.id} className="usd-mail-journal__item">
    <div className="usd-mail-journal__primary">
     <strong>{mailTypeName(entry.type)}</strong>
     <span>{entry.recipient}</span>
    </div>
    <div className="usd-mail-journal__meta">
     <span data-mail-status={entry.status}>{deliveryStatuses[entry.status]??entry.status}</span>
     <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('ru-RU')}</time>
     <small>Попыток: {entry.attempts}</small>
    </div>
   </article>)}
  </div>
  {loading&&<p role="status">Загружаем журнал…</p>}
  {nextCursor&&<button type="button" className="secondary-button usd-mail-journal__more" disabled={loading} onClick={()=>void load(nextCursor)}>Показать ещё</button>}
 </section>;
}
