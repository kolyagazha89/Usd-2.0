import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,ArrowLeft,CheckCircle2,ClipboardCheck,HardDrive,Lock,LockKeyhole,Search,ShieldCheck,Trash2,Wifi,WifiOff} from 'lucide-react';
import {findOfflineEntries,markOfflineInspectionSync,recordOfflineInspection,type OfflineEventPackage} from './offline-event-model';
import {apiPost,refresh} from '../api';
import {deleteOfflineVault,loadEncryptedVault,unsealOfflinePackage,updateOfflineVault,type EncryptedEventVault} from './offline-event-vault';
import './offline-event.css';

/** The offline page is intentionally outside the authenticated admin route:
 * it must open on a disconnected device after App /auth/refresh fails.
 * The only source of participant data is a passphrase-encrypted local vault.
 */
export default function OfflineEventPage({onGoOnline}:{onGoOnline:(path?:string)=>void}){
 const [raw,setRaw]=useState<EncryptedEventVault|null>(null);
 const [data,setData]=useState<OfflineEventPackage|null>(null);
 const [revision,setRevision]=useState('');
 const [passphrase,setPassphrase]=useState('');
 const [query,setQuery]=useState('');
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [connected,setConnected]=useState(()=>typeof navigator!=='undefined'&&navigator.onLine);
 const [workerReady,setWorkerReady]=useState(false);
 const [draftFor,setDraftFor]=useState(''),[status,setStatus]=useState<'PASSED'|'FAILED'>('PASSED'),[notes,setNotes]=useState('');
 const [confirmDelete,setConfirmDelete]=useState(false);
 const reload=async()=>{
  try{setRaw(await loadEncryptedVault());setError('')}
  catch(e){setError(e instanceof Error?e.message:'Не удалось прочитать пакет')}
  finally{setLoaded(true)}
 };
 useEffect(()=>{void reload();
  const online=()=>setConnected(navigator.onLine);
  window.addEventListener('online',online);window.addEventListener('offline',online);
  return()=>{window.removeEventListener('online',online);window.removeEventListener('offline',online)};
 },[]);
 useEffect(()=>{
  if(!('serviceWorker' in navigator)||!window.isSecureContext)return;
  if(import.meta.env.DEV)return;
  let active=true;
  const isOfflineWorker=(reg:ServiceWorkerRegistration|undefined)=>Boolean(
   reg?.active?.scriptURL.endsWith('/usd-offline-sw.js')&&
   new URL(reg.scope).pathname==='/offline-event');
  const check=async()=>{
   // The installed worker can serve the desk without Internet; a fresh
   // register() request would fail disconnected and falsely report not-ready.
   const prior=await navigator.serviceWorker.getRegistration('/offline-event');
   if(active&&isOfflineWorker(prior))setWorkerReady(true);
   if(!navigator.onLine)return;
   const reg=await navigator.serviceWorker.register('/usd-offline-sw.js',{scope:'/offline-event'});
   const refreshState=()=>{if(active&&isOfflineWorker(reg))setWorkerReady(true)};
   refreshState();
   reg.installing?.addEventListener('statechange',refreshState);
   reg.waiting?.addEventListener('statechange',refreshState);
  };
  void check().catch(()=>{if(active)setWorkerReady(false)});
  return()=>{active=false};
 },[]);
 const entries=useMemo(()=>data?findOfflineEntries(data,query):[],[data,query]);
 const carByRegistration=new Map((data?.entries??[]).map(entry=>[entry.id,entry.carId]));
 const drafts=new Map((data?.drafts??[]).map(d=>[carByRegistration.get(d.registrationId)??d.registrationId,d]));
 const pendingCount=data?.drafts.filter(d=>d.state==='LOCAL_ONLY').length??0;
 const acceptedCount=data?.drafts.filter(d=>d.state==='ACKNOWLEDGED').length??0;
 const conflictCount=data?.drafts.filter(d=>d.state==='CONFLICT').length??0;
 const unlock=async()=>{
  if(!raw||busy)return;setBusy(true);setError('');setNotice('');
  try{
   const value=await unsealOfflinePackage(raw,passphrase);
   setData(value);setRevision(raw.revision);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось открыть автономный пакет')}
  finally{setBusy(false)}
 };
 const lock=()=>{
  setData(null);setPassphrase('');setRevision('');setDraftFor('');setNotes('');
  setConfirmDelete(false);setNotice('Данные заблокированы. Для повторного доступа потребуется пароль.');
 };
 const saveDraft=async()=>{
  if(!data||!draftFor||busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const next=recordOfflineInspection(data,draftFor,status,notes);
   const nextRevision=await updateOfflineVault(next,passphrase,revision);
   setData(next);setRevision(nextRevision);setDraftFor('');setNotes('');
   setNotice('Сохранено только на этом устройстве. Центральный сервер НЕ получил результат.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить локальный черновик')}
  finally{setBusy(false)}
 };
 const syncDrafts=async()=>{
  if(!data||busy||!connected||pendingCount===0)return;
  setBusy(true);setError('');setNotice('');
  let next=data,activeRevision=revision,accepted=0,conflicts=0;
  try{
   // A device's cached role is informational only. Re-authenticate and verify
   // the original judge identity before sending any locally saved decision.
   const session=await refresh();
   if(!session?.user?.id)throw new Error('Войдите заново в USD как судья или администратор, затем повторите отправку.');
   if(session.user.id!==data.actor.id)
    throw new Error('Пакет подготовлен другим судьёй. Войдите под исходной учётной записью.');
   for(const draft of data.drafts.filter(item=>item.state==='LOCAL_ONLY')){
    try{
     const response=await apiPost<{
      success:boolean;operationId:string;registrationId:string;
      inspectionId:string;repeated:boolean;
     }>('/inspections/offline/sync',{
      operationId:draft.id,stageId:data.stage.id,registrationId:draft.registrationId,
      actorId:draft.actorId,createdAt:draft.createdAt,
      baseInspectionId:draft.baseInspectionId,status:draft.status,notes:draft.notes,
     });
     if(!response?.success||response.operationId!==draft.id||
        response.registrationId!==draft.registrationId||!response.inspectionId)
      throw new Error('Некорректное подтверждение сервера. Сохраните пакет и проверьте журнал операций.');
     const updated=markOfflineInspectionSync(next,draft.id,'ACKNOWLEDGED',
      response.repeated?'Повтор подтверждён сервером':'Сохранено на центральном сервере',response.inspectionId);
     // Durable local state first; if IndexedDB fails, retry is safe because
     // the server stores an immutable receipt for this exact operation ID.
     const savedRevision=await updateOfflineVault(updated,passphrase,activeRevision);
     next=updated;activeRevision=savedRevision;setRevision(savedRevision);setData(updated);accepted++;
    }catch(e){
     const serverStatus=(e as {status?:number})?.status;
     if(serverStatus===409){
      const updated=markOfflineInspectionSync(next,draft.id,'CONFLICT',
       e instanceof Error?e.message:'Конфликт данных на сервере');
      const savedRevision=await updateOfflineVault(updated,passphrase,activeRevision);
      next=updated;activeRevision=savedRevision;setRevision(savedRevision);setData(updated);conflicts++;
     }else throw e;
    }
   }
   setNotice(`Сервер подтвердил ${accepted} инспекций; конфликтов: ${conflicts}. Подтверждения сохранены в зашифрованном пакете.`);
  }catch(e){
   setError((e instanceof Error?e.message:'Не удалось синхронизировать инспекции')+
    (accepted?' · Уже подтверждено: '+accepted+'. Данные сохранены на устройстве.':''));
  }finally{setBusy(false)}
 };
 const remove=async()=>{
  if(!raw||!confirmDelete||busy)return;setBusy(true);setError('');
  try{
   await deleteOfflineVault(revision||raw.revision);setData(null);setPassphrase('');setRevision('');
   setRaw(null);setConfirmDelete(false);setNotice('Локальный пакет удалён. Это не изменяет результаты на сервере.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось удалить пакет')}
  finally{setBusy(false)}
 };
 const expiry=data?new Date(data.expiresAt).toLocaleString('ru-RU'):'';
 return <div className="usd-offline-page">
  <main className="usd-offline-container">
   <header className="usd-offline-header">
    <div><span className="usd-offline-kicker">USD / ЛОКАЛЬНЫЙ РЕЖИМ</span><h1>День соревнований</h1>
     <p>Автономный пакет, черновики инспекций и явная отправка после восстановления связи.</p></div>
    <button className="usd-offline-button secondary" type="button" onClick={()=>onGoOnline()}><ArrowLeft size={17}/>На сайт</button>
   </header>
   <div className="usd-offline-badges" aria-label="Состояние офлайн-приложения">
    <span><WifiOff size={15}/>{connected?'Устройство в сети · API не проверен':'Нет интернет-соединения'}</span>
    <span><HardDrive size={15}/>{workerReady?'Оболочка установлена':'Офлайн-оболочка не подтверждена'}</span>
    <span><LockKeyhole size={15}/>Данные зашифрованы AES-GCM</span>
   </div>
   {error&&<div className="usd-offline-alert" role="alert"><AlertTriangle size={18}/>{error}</div>}
   {notice&&<div className="usd-offline-notice" role="status"><CheckCircle2 size={18}/>{notice}</div>}
   {!loaded?<section className="usd-offline-panel">Проверяем локальное хранилище…</section>
   :!raw?<section className="usd-offline-panel">
    <Lock size={28}/><h2>Пакет ещё не подготовлен</h2>
    <p>Авторизуйтесь как судья или администратор с доступом к инспекциям, откройте «День соревнований» и подготовьте защищённый пакет, пока API доступен.</p>
    <p className="usd-offline-warning">Режим рассчитан на одно устройство: централизованная синхронизация появляется только после восстановления API и повторного входа. Общий судейский LAN-сервер ещё не реализован.</p>
    <button className="usd-offline-button" type="button" onClick={()=>onGoOnline()}>Вернуться к подготовке</button>
   </section>
   :!data?<section className="usd-offline-panel">
    <LockKeyhole size={27}/><h2>Разблокировать пакет</h2>
    <p>Данные участников хранятся только в зашифрованном виде. Для просмотра и записи черновиков введите пароль, заданный при подготовке.</p>
    <form className="usd-offline-unlock" onSubmit={e=>{e.preventDefault();void unlock()}}>
     <label>Пароль автономного пакета<input autoComplete="off" type="password" value={passphrase} onChange={e=>setPassphrase(e.target.value)} required minLength={14} placeholder="Не менее 14 символов"/></label>
     <button className="usd-offline-button" type="submit" disabled={busy||!passphrase}>Открыть пакет</button>
    </form>
    <p className="usd-offline-warning">При потере пароля восстановить локальные данные нельзя. Пакет действителен не более 72 часов. Не храните пароль в заметках на этом же устройстве.</p>
    <button type="button" className="usd-offline-button danger" onClick={()=>setConfirmDelete(true)} disabled={busy}>Удалить пакет при утере пароля или истечении срока</button>
    {confirmDelete&&<div className="usd-offline-confirm" role="group" aria-label="Удаление заблокированного пакета">
     <p>ВНИМАНИЕ: будут необратимо удалены зашифрованные регистрационные данные и ВСЕ локальные черновики, которые ещё могли не попасть на сервер. Восстановление невозможно.</p>
     <button className="usd-offline-button danger" type="button" disabled={busy} onClick={()=>void remove()}>Безвозвратно удалить</button>
     <button className="usd-offline-button secondary" type="button" onClick={()=>setConfirmDelete(false)}>Отмена</button>
    </div>}
   </section>
   :<><section className="usd-offline-panel">
    <div className="usd-offline-stage-top">
     <div><span className="usd-offline-kicker">СОХРАНЁННЫЙ ЭТАП</span><h2>{data.stage.name}</h2><p>{data.stage.city} · {data.stage.date} · действует до {expiry}</p></div>
     <button className="usd-offline-button secondary" type="button" onClick={lock}><Lock size={15}/>Заблокировать</button>
    </div>
    <div className="usd-offline-metrics">
     <span><strong>{data.entries.length}</strong> регистраций</span>
     <span><strong>{pendingCount}</strong> ожидают отправки</span>
     <span><strong>{acceptedCount}</strong> подтверждены сервером</span>
     <span><strong>{conflictCount}</strong> требуют проверки</span>
     <span><strong>{data.actor.role}</strong> роль при подготовке</span>
    </div>
    <p className="usd-offline-warning"><AlertTriangle size={16}/>Это снимок этапа на момент подготовки. Данные могли измениться на сервере. Локальные решения не являются официальными допусками.</p>
   </section>
   <section className="usd-offline-panel">
    <div className="usd-offline-section-heading"><h2>Регистрации и осмотр</h2><span>Только просмотр и сохранение локальных черновиков</span></div>
    <label className="usd-offline-search"><Search size={17}/><input type="search" aria-label="Поиск по локальному списку" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Номер, ФИО, госномер, автомобиль, класс…"/></label>
    <div className="usd-offline-list">{entries.map(entry=>{
     const draft=drafts.get(entry.carId);
     return <article className="usd-offline-entry" key={entry.id}>
      <div className="usd-offline-entry-head"><strong>№ {entry.number??'—'} · {entry.participantName}</strong><span>{entry.status==='CANCELLED'?'Отменена':draft?'ЛОКАЛЬНЫЙ ЧЕРНОВИК':entry.inspection.status==='PASSED'?'Допущен на момент загрузки':entry.inspection.status==='FAILED'?'Не прошёл на момент загрузки':'Без инспекции'}</span></div>
      <p>{entry.car}{entry.registrationNumber?' · '+entry.registrationNumber:''}</p>
      <div className="usd-offline-classes">{entry.classes.map((name,i)=><span key={i}>{name}</span>)}</div>
      {draft?<><p className={'usd-offline-draft '+(draft.state==='ACKNOWLEDGED'?'is-acknowledged':draft.state==='CONFLICT'?'is-conflict':'')}><ClipboardCheck size={15}/>{draft.status==='PASSED'?'Допустить':'Отказать'}{draft.notes?' · '+draft.notes:''} · {draft.state==='ACKNOWLEDGED'?'Подтверждено сервером · '+draft.serverInspectionId:draft.state==='CONFLICT'?'КОНФЛИКТ · '+(draft.syncMessage??'Требуется ручная проверка'):'Сохранено локально, ожидает отправки'}</p>
       {draft.state!=='ACKNOWLEDGED'&&<button type="button" className="usd-offline-button secondary" disabled={!connected} onClick={()=>onGoOnline('/admin/inspections?stageId='+encodeURIComponent(data.stage.id)+'&registrationId='+encodeURIComponent(entry.id))}>Сверить актуальную инспекцию в админке</button>}</>
      :entry.status==='ACTIVE'&&entry.inspection.status==='PENDING'
       &&<button className="usd-offline-button secondary" type="button" onClick={()=>{setDraftFor(entry.id);setStatus('PASSED');setNotes('')}} disabled={busy}>Создать черновик инспекции</button>}
      {draftFor===entry.id&&<form className="usd-offline-draft-form" onSubmit={e=>{e.preventDefault();void saveDraft()}}>
       <div className="usd-offline-status-buttons"><label><input type="radio" checked={status==='PASSED'} onChange={()=>setStatus('PASSED')}/>Допустить</label><label><input type="radio" checked={status==='FAILED'} onChange={()=>setStatus('FAILED')}/>Отказать</label></div>
       {status==='FAILED'&&<label>Причина отказа<textarea rows={3} maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)} required placeholder="Причина обязательна"/></label>}
       <div className="usd-offline-draft-actions"><button className="usd-offline-button" type="submit" disabled={busy||status==='FAILED'&&!notes.trim()}>Сохранить на устройстве</button><button className="usd-offline-button secondary" type="button" onClick={()=>setDraftFor('')}>Отмена</button></div>
       <p>Сохранение не отправляет инспекцию на сервер. После восстановления соединения перенесите решение через авторизованный экран, проверив актуальный статус.</p>
      </form>}
     </article>
    })}{entries.length===0&&<p>По заданному запросу никто не найден.</p>}</div>
   </section>
   <section className="usd-offline-panel">
    <h2>Завершение локальной работы</h2>
    <p>После восстановления сети войдите под той же учётной записью судьи, проверьте этап и отправьте решения. Каждая принятая операция получает отдельное подтверждение центральной БД. Конфликты сохраняются для ручной сверки, без перезаписи.</p>
    <p className="usd-offline-warning">Полноценная многосудейская автономная работа пока не готова: нет общего LAN-хаба и независимой офлайн-проверки прав. Не удаляйте пакет, пока все операции не подтверждены или не разобраны.</p>
    <div className="usd-offline-draft-actions"><button className="usd-offline-button" type="button" onClick={()=>void syncDrafts()} disabled={busy||!connected||pendingCount===0}><Wifi size={15}/>{busy?'Проверяем и отправляем…':'Отправить на сервер · '+pendingCount}</button><button className="usd-offline-button secondary" type="button" onClick={()=>onGoOnline()}><Wifi size={15}/>Перейти в онлайн-админку</button>
     <button className="usd-offline-button danger" type="button" onClick={()=>setConfirmDelete(true)} disabled={busy}><Trash2 size={15}/>Удалить локальный пакет</button></div>
    {confirmDelete&&<div className="usd-offline-confirm" role="group" aria-label="Подтверждение удаления пакета">
     <p>Безвозвратно удалятся {pendingCount} неподтверждённых решений, {conflictCount} конфликтов и {acceptedCount} подтверждённых записей. Удаляйте только после сверки с сервером!</p>
     <button className="usd-offline-button danger" type="button" onClick={()=>void remove()} disabled={busy}>Подтвердить удаление</button>
     <button className="usd-offline-button secondary" type="button" onClick={()=>setConfirmDelete(false)}>Отмена</button>
    </div>}
   </section></>}
   <footer className="usd-offline-footer"><ShieldCheck size={15}/>Офлайн-записи остаются только на устройстве до явного серверного подтверждения. Общий локальный сервер этапа остаётся отдельной задачей.</footer>
  </main>
 </div>;
}
