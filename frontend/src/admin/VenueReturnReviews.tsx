import {useEffect,useState} from 'react';
import {RefreshCw,ShieldCheck,AlertTriangle} from 'lucide-react';
import {apiGet,apiPost} from '../api';

type Candidate={id:string;name?:string;city?:string;plate?:string;brand?:string;model?:string;participantId?:string};
type Conflict={
 key:string;table:'Participant'|'Car';sourceId:string;
 source:Candidate;candidates:Candidate[];
};
type Review={
 id:string;stageId:string;status:string;journalEndHash:string;version:number;
 createdAt:string;conflictCount:number;
};
type ListResponse={items:Review[];page:number;pageSize:number;total:number};
type Detail=Review&{conflicts:Conflict[];decisions?:unknown[]|null;
 reviewedAt?:string|null;reviewedByUserId?:string|null;appliedAt?:string|null};
type Choice={selection:string;reason:string};
const statusText:Record<string,string>={
 PENDING:'Ожидает решения',DEFERRED:'Отложено',APPROVED:'Решено — повторите синхронизацию',
 APPLIED:'Перенесено онлайн',
};
const description=(candidate:Candidate,type:Conflict['table'])=>type==='Participant'
 ?[candidate.name,candidate.city].filter(Boolean).join(' · ')
 :[candidate.brand,candidate.model,candidate.plate].filter(Boolean).join(' · ');

export default function VenueReturnReviews(){
 const [items,setItems]=useState<Review[]>([]);
 const [selected,setSelected]=useState<Detail|null>(null);
 const [choices,setChoices]=useState<Record<string,Choice>>({});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 const [page,setPage]=useState(1),[total,setTotal]=useState(0);
 const refresh=async(nextPage=page)=>{
  setError('');
  try{
   const result=await apiGet<ListResponse>('/stages/venue/returns?page='+nextPage);
   setItems(result.items);setTotal(result.total);setPage(nextPage);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить заявки');}
  finally{setLoading(false);}
 };
 useEffect(()=>{
  let active=true;
  void apiGet<ListResponse>('/stages/venue/returns?page=1')
   .then(result=>{if(active){setItems(result.items);setTotal(result.total);}})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить заявки')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false;};
 },[]);
 const open=async(id:string)=>{
  setBusy(true);setError('');setMessage('');
  try{
   const detail=await apiGet<Detail>('/stages/venue/returns/'+encodeURIComponent(id));
   setSelected(detail);
   const defaults:Record<string,Choice>={};
   const known=new Map((Array.isArray(detail.decisions)?detail.decisions:[])
    .filter((x):x is {key:string;action:string;targetId?:string;reason:string}=>
     !!x&&typeof x==='object'&&'key'in x&&'action'in x&&'reason'in x)
    .map(x=>[x.key,x]));
   for(const conflict of detail.conflicts){
    const previous=known.get(conflict.key);
    defaults[conflict.key]={selection:previous?.action==='LINK'&&previous.targetId
     ?'LINK:'+previous.targetId:previous?.action==='NEW'?'NEW':'DEFER',
     reason:previous?.reason??''};
   }
   setChoices(defaults);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось открыть конфликт');}
  finally{setBusy(false);}
 };
 const updateChoice=(key:string,next:Partial<Choice>)=>{
  setChoices(prev=>({...prev,[key]:{selection:prev[key]?.selection??'DEFER',
   reason:prev[key]?.reason??'',...next}}));
 };
 const decide=async()=>{
  if(!selected||busy)return;
  const reviewId=selected.id;
  setBusy(true);setError('');setMessage('');
  try{
   const decisions=selected.conflicts.map(conflict=>{
    const choice=choices[conflict.key]??{selection:'DEFER',reason:''};
    const action=choice.selection.startsWith('LINK:')?'LINK':choice.selection;
    const targetId=action==='LINK'?choice.selection.slice(5):null;
    if(!['LINK','NEW','DEFER'].includes(action))throw new Error('Выберите действие');
    const reason=choice.reason.trim();
    if(action==='LINK'&&reason.length<10)
     throw new Error('Для привязки укажите причину минимум 10 символов');
    if(action==='NEW'&&reason.length<12)
     throw new Error('Для отдельного профиля укажите причину минимум 12 символов');
    return {key:conflict.key,action,targetId,reason};
   });
   const reply=await apiPost<{status:string}>('/stages/venue/returns/'+encodeURIComponent(reviewId)+'/decisions',
    {version:selected.version,decisions});
   setMessage(reply.status==='DEFERRED'
    ?'Решение отложено. Онлайн-импорт заблокирован до рассмотрения.'
    :'Решение сохранено с аудитом. На ноутбуке повторно нажмите «USD — Онлайн», чтобы перенести исходный подписанный пакет.');
   await refresh(page);
   setSelected(null);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить решение');}
  finally{setBusy(false);}
 };
 return <section className="panel venue-return-reviews" aria-label="Возврат данных с офлайн-сервера">
  <div className="venue-return-review-heading">
   <div><h2>Возврат данных · Конфликты</h2>
    <p>Решения принимаются только ADMIN на основном USD. До разрешения спорного профиля локальный пакет не переносится.</p></div>
   <button className="secondary-button" type="button" disabled={busy||loading}
    onClick={()=>void refresh()}><RefreshCw size={17}/>Обновить</button>
  </div>
  {loading?<p role="status">Загружаем заявки…</p>:items.length===0
   ?<p className="muted">Новых конфликтов пока нет. При совпадении ФИО или госномера заявка появится здесь после попытки возврата с ноутбука.</p>
   :<div className="venue-return-review-list">{items.map(item=>
    <button type="button" key={item.id} className="venue-return-review-item"
     disabled={busy} onClick={()=>void open(item.id)}>
     <span><strong>{statusText[item.status]??item.status}</strong>
      <small>Этап {item.stageId.slice(0,8)} · {new Date(item.createdAt).toLocaleString('ru-RU')}</small></span>
     <span>{item.conflictCount} конфликт(ов)</span>
    </button>)}</div>}
  {total>20&&<div className="venue-return-pagination">
   <button className="secondary-button" disabled={busy||page<=1} onClick={()=>void refresh(page-1)}>Назад</button>
   <span>Страница {page} из {Math.ceil(total/20)}</span>
   <button className="secondary-button" disabled={busy||page*20>=total} onClick={()=>void refresh(page+1)}>Далее</button>
  </div>}
  {selected&&<div className="venue-return-review-detail">
   <div className="venue-return-review-heading"><div><h3>Разбор заявки</h3>
    <p>Этап {selected.stageId.slice(0,8)} · журнал {selected.journalEndHash.slice(0,12)}</p>
    <p><strong>{statusText[selected.status]??selected.status}</strong></p>
    </div><button className="secondary-button" type="button" onClick={()=>setSelected(null)}>Закрыть</button></div>
   <div className="venue-return-review-warning"><AlertTriangle size={18}/>
    <p>Не объединяйте тёзок автоматически. Сверьте автомобиль, госномер и историю выступлений.
    Вариант «Привязать» оставляет исходный онлайн USD ID, вариант «Новый» создаёт отдельный профиль,
    «Отложить» блокирует весь возврат до решения.</p></div>
   {selected.conflicts.map(conflict=><div className="venue-return-conflict" key={conflict.key}>
    <h4>{conflict.table==='Participant'?'Совпадение участника':'Совпадение автомобиля'}</h4>
    <div className="venue-return-comparison">
     <div><small>Создано офлайн</small><strong>{description(conflict.source,conflict.table)}</strong>
      <code>{conflict.sourceId}</code></div>
     <div><small>Найдено онлайн</small>{conflict.candidates.map(candidate=>
      <div key={candidate.id}><strong>{description(candidate,conflict.table)}</strong>
       <code>{candidate.id}</code></div>)}</div>
    </div>
    {['PENDING','DEFERRED'].includes(selected.status)&&<>
     <label className="venue-return-choice">Решение
      <select aria-label={'Решение по '+conflict.key}
       value={choices[conflict.key]?.selection??'DEFER'}
       onChange={event=>updateChoice(conflict.key,{selection:event.target.value})}>
       <option value="DEFER">Отложить — не импортировать</option>
       <option value="NEW">Разные люди / автомобили — создать отдельную запись</option>
       {conflict.candidates.map(candidate=>
        <option key={candidate.id} value={'LINK:'+candidate.id}>Привязать к {description(candidate,conflict.table)}</option>)}
      </select>
     </label>
     <label className="venue-return-choice">Основание решения
      <textarea rows={2} maxLength={600} value={choices[conflict.key]?.reason??''}
       placeholder="Как проверили совпадение? Документы, номер, история выступлений"
       onChange={event=>updateChoice(conflict.key,{reason:event.target.value})}/>
     </label>
    </>}
   </div>)}
   {['PENDING','DEFERRED'].includes(selected.status)&&
    <button className="primary-button venue-return-submit" type="button" disabled={busy}
     onClick={()=>void decide()}><ShieldCheck size={18}/>{busy?'Проверяем…':'Сохранить решения с аудитом'}</button>}
   {selected.status==='APPROVED'&&<p>Решение утверждено. Повторите «USD — Онлайн» на ноутбуке. Ранее подписанный файл сохраняется.</p>}
   {selected.status==='APPLIED'&&<p>Данные перенесены. Изменения решений заблокированы.</p>}
  </div>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  {message&&<p className="notice" role="status">{message}</p>}
 </section>;
}
