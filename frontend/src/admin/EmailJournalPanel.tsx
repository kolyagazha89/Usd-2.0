import {useCallback,useEffect,useState} from 'react';
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
const typeNames:Record<string,string>={
 AUTH_EMAIL_VERIFICATION:'Подтверждение email',
 AUTH_PASSWORD_RESET:'Восстановление пароля',
 AUTH_EMAIL_CHANGE:'Изменение email',
 AUTH_TEST_CONNECTION:'Проверка почтового канала',
 'TEST_AUTH_EMAIL_VERIFICATION':'Тест подтверждения email',
 'TEST_AUTH_PASSWORD_RESET':'Тест восстановления пароля',
 'TEST_AUTH_EMAIL_CHANGE':'Тест смены email',
};

export default function EmailJournalPanel(){
 const [filter,setFilter]=useState(''),[entries,setEntries]=useState<MailJournalRow[]>([]);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const load=useCallback(async(cursor?:string)=>{
  setLoading(true);setError('');
  try{
   const params=new URLSearchParams();
   if(filter)params.set('status',filter);
   if(cursor)params.set('cursor',cursor);
   const data=await apiGet<JournalResponse>('/mail/journal'+(params.size?'?'+params.toString():''));
   if(!Array.isArray(data?.entries))throw new Error('Журнал почты: неверный ответ API. Обновите страницу.');
   setEntries(rows=>cursor?[...rows,...data.entries.filter(row=>!rows.some(previous=>previous.id===row.id))]:data.entries);
   setNextCursor(data.nextCursor);
  }catch(e){
   setError(e instanceof Error?e.message:'Не удалось открыть журнал писем');
  }finally{setLoading(false)}
 },[filter]);
 useEffect(()=>{void load()},[load]);
 return <section className="settings-section usd-mail-journal" aria-labelledby="mail-journal-title">
  <div className="usd-mail-journal__heading">
   <div><h2 id="mail-journal-title">Журнал писем</h2>
    <p className="settings-help">Показаны попытки отправки и ответы почтового провайдера. Не подтверждает доставку в папку «Входящие». Секретные ссылки и содержимое писем не сохраняются.</p>
   </div>
   <div className="usd-mail-journal__filters">
    <label>Статус <select value={filter} onChange={e=>setFilter(e.target.value)} disabled={loading}>
     <option value="">Все статусы</option>
     {Object.entries(deliveryStatuses).map(([status,label])=><option key={status} value={status}>{label}</option>)}
    </select></label>
    <button type="button" className="secondary-button" onClick={()=>void load()} disabled={loading}>Обновить</button>
   </div>
  </div>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {!loading&&entries.length===0&&!error&&<p className="muted">Писем с выбранным статусом пока нет.</p>}
  <div className="usd-mail-journal__list">
   {entries.map(entry=><article key={entry.id} className="usd-mail-journal__item">
    <div className="usd-mail-journal__primary">
     <strong>{typeNames[entry.type]??entry.type.replace(/_/g,' ')}</strong>
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
