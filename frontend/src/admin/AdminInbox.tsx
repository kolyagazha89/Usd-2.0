import {useEffect,useRef,useState} from 'react';
import {Bell,Check,CheckCheck,ExternalLink,RefreshCw} from 'lucide-react';
import {apiGet,apiPatch} from '../api';
import InternalLink from '../navigation/InternalLink';
import './admin-inbox.css';
const changed='usd:admin-inbox-changed';
const notify=()=>window.dispatchEvent(new Event(changed));
export function AdminInboxBell({go}:{go:(path:string)=>void}){
 const [unread,setUnread]=useState<number|null>(null),[failed,setFailed]=useState(false);
 useEffect(()=>{
  let active=true,busy=false;
  const load=async()=>{
   if(busy||document.visibilityState==='hidden')return;busy=true;
   try{const data=await apiGet<{unread:number}>('/admin/inbox/summary');if(!Number.isInteger(data.unread)||data.unread<0)throw new Error('Недоступен счётчик');if(active){setUnread(data.unread);setFailed(false)}}
   catch{if(active)setFailed(true)}finally{busy=false}
  };
  void load();const timer=setInterval(()=>void load(),45000);
  window.addEventListener(changed,load);window.addEventListener('focus',load);document.addEventListener('visibilitychange',load);
  return()=>{active=false;clearInterval(timer);window.removeEventListener(changed,load);window.removeEventListener('focus',load);document.removeEventListener('visibilitychange',load)};
 },[]);
 return <InternalLink href="/admin/inbox" go={go} className="admin-inbox-bell" aria-label={failed?'Уведомления — счётчик временно недоступен':unread===null?'Уведомления':`Уведомления: ${unread} непросмотренных`} title={failed?'Не удалось обновить счётчик. Открыть уведомления':'Центр уведомлений'}>
  <Bell size={19} aria-hidden="true"/>{unread!==null&&unread>0&&<span className="admin-inbox-badge" aria-hidden="true">{unread>99?'99+':unread}</span>}{failed&&<span className="admin-inbox-count-error" aria-hidden="true">!</span>}
 </InternalLink>;
}

type Notice={id:string;title:string;body:string;path:string;createdAt:string;status:'UNREAD'|'READ'|'DONE';completedAt:string|null};
type Counts={unread:number;read:number;done:number;total:number};
type Inbox={items:Notice[];counts:Counts;nextCursor:string|null};
const labels={UNREAD:'Не просмотрено',READ:'Просмотрено',DONE:'Выполнено'};
const destinations=new Set(['/admin/components','/admin/components?tab=requests','/admin/profile-links','/admin/participants']);
export default function AdminInboxPage({go,PageFrame}:{go:(path:string)=>void;PageFrame:React.ComponentType<any>}){
 const [filter,setFilter]=useState('all'),[items,setItems]=useState<Notice[]>([]),[counts,setCounts]=useState<Counts|null>(null),[cursor,setCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const generation=useRef(0);
 const load=async(more=false)=>{
  const request=++generation.current;setLoading(true);setError('');
  try{const data=await apiGet<Inbox>('/admin/inbox?status='+filter+(more&&cursor?'&cursor='+encodeURIComponent(cursor):''));
   if(request!==generation.current)return;
   setItems(old=>more?[...old,...data.items.filter(row=>!old.some(item=>item.id===row.id))]:data.items);setCounts(data.counts);setCursor(data.nextCursor);
  }catch(e){if(request===generation.current)setError(e instanceof Error?e.message:'Не удалось загрузить уведомления')}
  finally{if(request===generation.current)setLoading(false)}
 };
 useEffect(()=>{setItems([]);setCursor(null);void load();return()=>{generation.current++}},[filter]);
 const action=async(notice:Notice,status:'READ'|'DONE',open=false)=>{
  if(busy)return;setBusy(notice.id);setError('');
  try{await apiPatch('/admin/inbox/'+encodeURIComponent(notice.id),{status});notify();
   if(open){if(!destinations.has(notice.path))throw new Error('Ссылка уведомления недоступна');go(notice.path)}else await load();
  }catch(e){setError(e instanceof Error?e.message:'Не удалось изменить статус')}finally{setBusy('')}
 };
 return <PageFrame title="Уведомления" subtitle="Заявки и события, требующие внимания ADMIN.">
  <section className="admin-inbox" aria-label="Центр уведомлений">
   <div className="admin-inbox-toolbar"><div className="admin-inbox-filters" role="group" aria-label="Статус уведомлений">
    {[['all','Все',counts?.total],['unread','Не просмотрено',counts?.unread],['read','Просмотрено',counts?.read],['done','Выполнено',counts?.done]].map(([value,label,count])=><button type="button" key={value} aria-pressed={filter===value} disabled={!!busy} onClick={()=>setFilter(String(value))}>{label}{count!==undefined&&<span>{count}</span>}</button>)}
   </div><button type="button" className="secondary-button" disabled={loading||!!busy} onClick={()=>void load()}><RefreshCw size={16}/>Обновить</button></div>
   <p className="admin-inbox-help">Просмотр отмечается отдельно для каждого администратора. Статус «Выполнено» общий: коллеги увидят, что уведомление обработано. Решение по самой заявке принимается в её разделе.</p>
   {error&&<p className="form-error" role="alert">{error}</p>}
   {loading&&<p role="status">Загружаем уведомления…</p>}
   {!loading&&!error&&!items.length&&<div className="admin-inbox-empty"><Bell size={30}/><h2>Уведомлений нет</h2><p>{filter==='all'?'Новые запросы комплектующих и события привязки профилей появятся здесь.':'С этим статусом пока нет уведомлений.'}</p></div>}
   <div className="admin-inbox-list">{items.map(notice=><article key={notice.id} className={'admin-inbox-card is-'+notice.status.toLowerCase()}>
    <div className="admin-inbox-card-heading"><span className="admin-inbox-status">{notice.status==='DONE'?<CheckCheck size={15}/>:notice.status==='READ'?<Check size={15}/>:<Bell size={15}/>} {labels[notice.status]}</span><time dateTime={notice.createdAt}>{new Date(notice.createdAt).toLocaleString('ru-RU')}</time></div>
    <h2>{notice.title}</h2><p>{notice.body}</p>
    {notice.completedAt&&<small>Выполнено {new Date(notice.completedAt).toLocaleString('ru-RU')}</small>}
    <div className="admin-inbox-card-actions">
     {destinations.has(notice.path)&&<button type="button" className="primary-button compact" disabled={!!busy} onClick={()=>void action(notice,'READ',true)}>Открыть раздел <ExternalLink size={14}/></button>}
     {notice.status==='UNREAD'&&<button type="button" className="secondary-button compact" disabled={!!busy} onClick={()=>void action(notice,'READ')}>Отметить просмотренным</button>}
     {notice.status!=='DONE'&&<button type="button" className="secondary-button compact" disabled={!!busy} onClick={()=>void action(notice,'DONE')}>{busy===notice.id?'Сохраняем…':'Отметить выполненным'}</button>}
    </div>
   </article>)}</div>
   {cursor&&<button type="button" className="secondary-button" disabled={loading||!!busy} onClick={()=>void load(true)}>Показать ещё</button>}
  </section>
 </PageFrame>;
}
