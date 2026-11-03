import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AlertTriangle,ArrowUpRight,CarFront,Check,ChevronRight,ClipboardCheck,Flag,HardDrive,Info,LockKeyhole,Plus,RefreshCw,ScanQrCode,Search,ShieldAlert,Trophy,Users,X} from 'lucide-react';
import {apiGet,apiPatch,apiPost,listData,type User} from '../api';
import {judgingNumbers,judgingResultLink} from './results-operations-model';
import {isPendingEquipment,walkInRegistrationPath} from './event-ops-model';
import {canChangeDayInspection,dayPath,dayStatus,eventDayCounts,filterEventDayRows,hasDayPermission,stageIsReadOnly,type DayRow,type DayStatus} from './event-day-model';
import {buildOfflineEventPackage} from './offline-event-model';
import {createOfflineVault} from './offline-event-vault';
import './event-day.css';

type Stage={id:string;name:string;city?:string|null;stageNumber?:number|null;date?:string|null;status?:string|null};
const statusLabels:Record<DayStatus,string>={ALL:'Активные',PASSED:'Допущены',PENDING:'Ожидают проверки',FAILED:'Не прошли',CANCELLED:'Отменены',EQUIPMENT:'Без конфигурации'};
const statusClass=(status:string)=>status==='PASSED'?'is-passed':status==='FAILED'?'is-failed':status==='CANCELLED'?'is-cancelled':'is-pending';
const participantLabel=(row:DayRow)=>[row.participant?.lastName,row.participant?.firstName,row.participant?.middleName].filter(Boolean).join(' ')||'Участник без имени';
const carLabel=(row:DayRow)=>[row.car?.brand,row.car?.model].filter(Boolean).join(' ')||'Автомобиль не указан';
const stageLabel=(stage:Stage)=>['№'+(stage.stageNumber??'—'),stage.name,stage.city].filter(Boolean).join(' · ');
const dateLabel=(date?:string|null)=>date?new Date(date).toLocaleDateString('ru-RU',{day:'2-digit',month:'long',year:'numeric'}):'Дата этапа не задана';
function chooseInitialStage(stages:Stage[]):string{
 const now=new Date();now.setHours(0,0,0,0);
 const sorted=[...stages].filter(s=>s.status!=='CANCELLED')
  .sort((a,b)=>Date.parse(a.date??'')-Date.parse(b.date??''));
 return sorted.find(s=>Number.isFinite(Date.parse(s.date??''))&&Date.parse(s.date??'')>=now.getTime())?.id
  ??sorted.at(-1)?.id??stages[0]?.id??'';
}
function displayError(value:unknown,fallback:string){return value instanceof Error?value.message:fallback;}

export default function EventDayPage({path,go,user,PageFrame,Empty,LoadingPage}:{
 path:string;go:(path:string)=>void;user:User;
 PageFrame:React.ComponentType<any>;Empty:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;
}){
 const requested=new URLSearchParams(path.split('?')[1]??'').get('stageId')??'';
 const [stageId,setStageId]=useState(requested);
 const [stages,setStages]=useState<Stage[]>([]);
 const [stagesBusy,setStagesBusy]=useState(true);
 const [rows,setRows]=useState<DayRow[]>([]),[loading,setLoading]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [search,setSearch]=useState(''),[filter,setFilter]=useState<DayStatus>('ALL');
 const [savingId,setSavingId]=useState(''),[confirmPass,setConfirmPass]=useState('');
 const [failId,setFailId]=useState(''),[failureReason,setFailureReason]=useState('');
 const [offlinePrepOpen,setOfflinePrepOpen]=useState(false),[offlinePass,setOfflinePass]=useState(''),[offlineConfirm,setOfflineConfirm]=useState(''),[offlineSaving,setOfflineSaving]=useState(false);
 const requestId=useRef(0);
 const canList=hasDayPermission(user,'registrations','view');
 const canSeeInspections=hasDayPermission(user,'inspections','view');
 const canRegister=hasDayPermission(user,'registrations','create')&&canSeeInspections;
 const canPrepareOffline=hasDayPermission(user,'inspections','create')&&canSeeInspections;
 const canSeeResults=hasDayPermission(user,'results','view');
 const canEnterResult=hasDayPermission(user,'results','create')&&canSeeResults;
 const selected=stages.find(s=>s.id===stageId);
 const readOnly=stageIsReadOnly(selected);
 const counts=useMemo(()=>eventDayCounts(rows),[rows]);
 const visible=useMemo(()=>filterEventDayRows(rows,search,filter),[rows,search,filter]);
 const stageOptions=useMemo(()=>[...stages].sort((a,b)=>Date.parse(b.date??'')-Date.parse(a.date??'')),[stages]);

 useEffect(()=>{
  if(requested&&requested!==stageId){setStageId(requested);setFilter('ALL');setSearch('');}
 },[requested]);
 useEffect(()=>{
  if(!canList){setStagesBusy(false);return;}
  let alive=true;
  setStagesBusy(true);setError('');
  const endpoint=hasDayPermission(user,'stages','view')?'/stages':'/stages/public';
  apiGet(endpoint).then(value=>{
   if(!alive)return;
   const items=listData<Stage>(value).filter(s=>s?.id);
   setStages(items);
   if(!requested&&items.length){
    const initial=chooseInitialStage(items);
    setStageId(initial);
    // Preserve the URL used for linking the desk, without leaving the app.
    const url=new URL(window.location.href);
    url.searchParams.set('stageId',initial);
    window.history.replaceState(window.history.state,'',url.pathname+url.search);
   }
  }).catch(e=>{if(alive)setError(displayError(e,'Не удалось загрузить этапы'))})
   .finally(()=>{if(alive)setStagesBusy(false)});
  return()=>{alive=false};
 },[canList,user.customRoleId,user.role]);
 const load=useCallback(async(id:string)=>{
  const token=++requestId.current;
  if(!id||!canList)return;
  setLoading(true);setError('');
  try{
   const result=await apiGet('/registrations?stageId='+encodeURIComponent(id));
   if(token===requestId.current)setRows(listData<DayRow>(result).filter(r=>r?.id));
  }catch(e){if(token===requestId.current){setRows([]);setError(displayError(e,'Не удалось загрузить регистрации этапа'))}}
  finally{if(token===requestId.current)setLoading(false)}
 },[canList]);
 useEffect(()=>{
  setRows([]);setConfirmPass('');setFailId('');setFailureReason('');
  if(!selected){requestId.current++;return;}
  void load(stageId);
  return()=>{requestId.current++};
 },[selected?.id,load]);
 const changeStage=(id:string)=>{
  if(savingId)return;
  setStageId(id);setFilter('ALL');setSearch('');setNotice('');
  go(id?dayPath('/admin/event-day',id):'/admin/event-day');
 };
 const refresh=async()=>{if(stageId&&!savingId)await load(stageId)};
 const prepareOffline=async()=>{
  if(!selected||loading||offlineSaving||readOnly||!canPrepareOffline)return;
  if(offlinePass.length<14||offlinePass!==offlineConfirm){setError('Для пакета требуется пароль не короче 14 символов и точное подтверждение.');return;}
  setOfflineSaving(true);setError('');setNotice('');
  try{
   const payload=buildOfflineEventPackage({stage:selected,rows,actor:{id:user.id,role:user.customRole?.name??user.role}});
   await createOfflineVault(payload,offlinePass);
   setOfflinePass('');setOfflineConfirm('');setOfflinePrepOpen(false);
   go('/offline-event');
  }catch(e){setError(displayError(e,'Не удалось зашифровать пакет. Возможно, на устройстве уже есть сохранённые черновики.'))}
  finally{setOfflineSaving(false)}
 };
 const inspectionPath=(row:DayRow)=>dayPath('/admin/inspections',stageId,row.id);
 const saveInspection=async(row:DayRow,status:'PASSED'|'FAILED')=>{
  if(!canChangeDayInspection(user,row,readOnly)||savingId)return;
  if(status==='FAILED'&&!failureReason.trim()){setError('Для отказа в допуске обязательно укажите причину.');return;}
  const current=row.stageInspection??row.inspection;
  setSavingId(row.id);setNotice('');setError('');
  try{
   const body={status,notes:status==='FAILED'?failureReason.trim():null};
   if(current?.id)await apiPatch('/inspections/'+encodeURIComponent(current.id),body);
   else await apiPost('/inspections',{registrationId:row.id,status,...(status==='FAILED'?{notes:failureReason.trim()}:{})});
   setConfirmPass('');setFailId('');setFailureReason('');
   await load(stageId);
   setNotice(status==='PASSED'?'Допуск подтверждён для '+participantLabel(row):'Причина отказа сохранена для '+participantLabel(row));
  }catch(e){setError(displayError(e,'Не удалось сохранить инспекцию. Проверьте права и обновите список.'))}
  finally{setSavingId('')}
 };
 const linkToResults=(row:DayRow)=>go(judgingResultLink(stageId,row.id));
 return <PageFrame className="event-ops-page event-day-page" title="День соревнований" subtitle="Единый рабочий список: въезд, допуски, классы и судейство"
  action={<button type="button" className="secondary-button compact" disabled={loading||stagesBusy||!!savingId||!selected} onClick={()=>void refresh()}><RefreshCw size={15}/>Обновить список</button>}>
  {!canList?<section className="panel event-day-blocked" role="alert"><ShieldAlert size={24}/><h2>Нет доступа к рабочему списку</h2><p>Для работы необходимы права «Регистрации → просмотр». Права на инспекции, регистрацию и результаты настраиваются отдельно.</p></section>:<>
   <section className="panel event-day-heading">
    <div><span className="eyebrow">USD / ОПЕРАТОРСКИЙ ЦЕНТР</span><h2>Рабочая площадка</h2><p>Один список и один выбранный этап для всех действий. Информация обновляется кнопкой — не заменяет автономный режим без сервера.</p></div>
    <label className="event-day-stage-picker">Текущий этап
     <select aria-label="Этап рабочего центра" disabled={stagesBusy||!!savingId} value={stageId} onChange={e=>changeStage(e.target.value)}>
      <option value="">{stagesBusy?'Загрузка этапов…':'Выберите этап'}</option>
      {stageOptions.map(stage=><option value={stage.id} key={stage.id}>{stageLabel(stage)}</option>)}
     </select>
    </label>
   </section>
   {error&&<div className="form-error" role="alert"><AlertTriangle size={16}/>{error}</div>}
   {notice&&<div className="notice" role="status"><Check size={16}/>{notice}</div>}
   {stagesBusy?<LoadingPage small/>:!selected?<section className="panel"><Empty text={stageId?'Выбранный этап не найден или недоступен для вашей роли. Укажите другой этап.':'Выберите этап для работы'}/></section>:<>
    <section className="event-day-stage-context" aria-label="Информация об этапе"><Flag size={17}/><strong>{selected.name}</strong><span>{selected.city||'Город не указан'} · {dateLabel(selected.date)}</span>{readOnly&&<span className="event-day-read-only"><Info size={14}/>Архив: изменения инспекций отключены</span>}</section>
    <section className="event-day-overview" aria-label="Сводка дня соревнований">
     {([
      ['ALL','Активных',counts.active],
      ['PENDING','Ожидают осмотра',counts.pending],
      ['PASSED','Допущено',counts.passed],
      ['FAILED','Не прошли',counts.failed],
      ['EQUIPMENT','Без оборудования',counts.equipment],
      ['CANCELLED','Отменено',counts.cancelled],
     ] as Array<[DayStatus,string,number]>).map(([id,title,count])=>
      <button type="button" className={'event-day-metric '+(filter===id?'is-active':'')} aria-pressed={filter===id} key={id} onClick={()=>setFilter(id)}><span>{title}</span><strong>{loading?'—':count}</strong></button>)}
    </section>
    <section className="panel event-day-actions" aria-label="Быстрые действия этапа">
     <div><h3>Следующее действие</h3><p>Создавайте профиль на въезде, сканируйте QR, оформляйте допуск и передавайте участников на судейство.</p></div>
     <div className="event-day-action-buttons">
      {canRegister&&!readOnly&&<button type="button" className="primary-button compact" onClick={()=>go(walkInRegistrationPath(stageId))}><Plus size={15}/>Регистрация на въезде</button>}
      {canSeeInspections&&<button type="button" className="secondary-button compact" onClick={()=>go('/admin/inspections?stageId='+encodeURIComponent(stageId)+'&scan=1')}><ScanQrCode size={15}/>QR / USD ID</button>}
      {canSeeInspections&&<button type="button" className="secondary-button compact" onClick={()=>go(dayPath('/admin/inspections',stageId))}><ClipboardCheck size={15}/>Все инспекции</button>}
      {(canSeeInspections||canSeeResults)&&<button type="button" className="secondary-button compact" aria-pressed={filter==='PASSED'} onClick={()=>{setSearch('');setFilter('PASSED')}}><Check size={15}/>Сформировать список допущенных · {counts.passed}</button>}
      {canSeeResults&&<button type="button" className="secondary-button compact" onClick={()=>go(judgingResultLink(stageId))}><Trophy size={15}/>Судейский протокол</button>}
      {canPrepareOffline&&!readOnly&&<button type="button" className="secondary-button compact" aria-expanded={offlinePrepOpen} onClick={()=>setOfflinePrepOpen(x=>!x)}><HardDrive size={15}/>Подготовить автономный пакет</button>}
      <button type="button" className="secondary-button compact" onClick={()=>go('/offline-event')}><LockKeyhole size={15}/>Открыть локальные черновики</button>
     </div>
    </section>
    {offlinePrepOpen&&canPrepareOffline&&!readOnly&&<section className="panel event-day-offline-prepare" aria-label="Подготовка автономного пакета">
     <h3><LockKeyhole size={19}/>Защищённый пакет на это устройство</h3>
     <p>Сохранится минимум данных выбранного этапа: ФИО, автомобиль, номер, классы и текущий статус осмотра. Без телефонов, email, JWT и всей базы USD. Пакет действует 72 часа и шифруется AES-GCM.</p>
     <p className="event-day-offline-warning">Этот первый offline-режим позволяет искать участников и сохранять черновики инспекций без интернета. Несколько судей не разделяют изменения. Отправка в API пока не реализована — решения нужно сверять и переносить вручную после восстановления связи.</p>
     <form onSubmit={e=>{e.preventDefault();void prepareOffline()}}>
      <div className="event-day-offline-fields">
       <label>Пароль пакета (от 14 символов)<input type="password" autoComplete="new-password" minLength={14} maxLength={128} value={offlinePass} onChange={e=>setOfflinePass(e.target.value)} required/></label>
       <label>Повторите пароль<input type="password" autoComplete="new-password" minLength={14} maxLength={128} value={offlineConfirm} onChange={e=>setOfflineConfirm(e.target.value)} required/></label>
      </div>
      <div className="event-day-row-actions">
       <button type="submit" className="primary-button compact" disabled={offlineSaving||loading||offlinePass.length<14||offlinePass!==offlineConfirm}>Зашифровать {rows.length} регистраций и открыть</button>
       <button type="button" className="secondary-button compact" onClick={()=>{setOfflinePrepOpen(false);setOfflinePass('');setOfflineConfirm('')}}>Отмена</button>
      </div>
     </form>
     <small>Если на устройстве уже есть пакет, сначала перенесите его черновики и удалите его вручную. Запись поверх запрещена. Перед отключением интернета откройте автономный экран и убедитесь, что оболочка установлена.</small>
    </section>}
    <section className="panel event-day-roster" aria-label="Рабочий список участников">
     <header className="event-day-roster-head"><div><span className="eyebrow">СПИСОК УЧАСТНИКОВ</span><h3>{filter==='PASSED'?'Итоговый список допущенных':statusLabels[filter]}</h3><p>{filter==='PASSED'?'Здесь только действующие регистрации с подтверждённой общей инспекцией.':'Поиск по точному номеру участника, ФИО, автомобилю, госномеру и классу.'}</p></div><span aria-live="polite" role="status" className="event-day-count">{loading?'Загрузка…':visible.length+' из '+(filter==='ALL'?counts.active:counts.total)}</span></header>
     <div className="event-day-search" role="search"><Search size={19}/><input type="search" aria-label="Поиск участника в день соревнований" value={search} onChange={e=>setSearch(e.target.value)} placeholder="№ участника, ФИО, госномер, автомобиль, класс…" autoComplete="off"/>{search&&<button type="button" className="secondary-button compact" onClick={()=>setSearch('')}>Очистить</button>}</div>
     <div className="event-day-filter-tabs" role="group" aria-label="Статус допуска">{(['ALL','PENDING','PASSED','FAILED','EQUIPMENT','CANCELLED'] as DayStatus[]).map(value=><button type="button" className={'secondary-button compact '+(filter===value?'active':'')} key={value} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{statusLabels[value]}</button>)}</div>
     {loading?<LoadingPage small/>:visible.length===0?<Empty text={rows.length?'По текущему фильтру участники не найдены':'На выбранном этапе нет регистраций'}/>:<div className="event-day-list">
      {visible.map(row=>{
       const inspected=dayStatus(row),numbers=judgingNumbers(row),canInspect=canSeeInspections,canEdit=canChangeDayInspection(user,row,readOnly),incomplete=isPendingEquipment(row);
       const classes=(row.classes??[]).map(c=>[c.class?.direction?.name,c.class?.name].filter(Boolean).join(' · ')).filter(Boolean);
       return <article className="event-day-person" key={row.id}>
        <div className="event-day-person-head">
         <div className="event-day-number"><span>НОМЕР</span><strong>{numbers.length?numbers.map(n=>String(n).padStart(3,'0')).join(' / '):'—'}</strong></div>
         <div className="event-day-person-details"><h4>{participantLabel(row)}</h4><p><CarFront size={14}/>{carLabel(row)}{row.car?.registrationNumber?' · '+row.car.registrationNumber:''}</p>{incomplete&&<small className="event-day-equipment">Конфигурация ожидает заполнения после этапа</small>}</div>
         <span className={'event-day-status '+statusClass(inspected)}>{inspected==='PASSED'?'Допущен':inspected==='FAILED'?'Не прошёл':inspected==='CANCELLED'?'Отменена':'Ожидает осмотра'}</span>
        </div>
        <div className="event-day-classes">{classes.length?classes.map((name,i)=><span key={i}>{name}</span>):<span>Классы не назначены</span>}</div>
        {failId===row.id&&<div className="event-day-confirm" role="group" aria-label={'Причина отказа '+participantLabel(row)}>
         <label>Причина отказа в допуске<textarea rows={3} maxLength={2000} autoFocus value={failureReason} onChange={e=>setFailureReason(e.target.value)} placeholder="Укажите конкретную причину, обязательное поле"/></label>
         <div className="event-day-row-actions"><button type="button" className="danger-button compact" disabled={!!savingId||!failureReason.trim()} onClick={()=>void saveInspection(row,'FAILED')}>Подтвердить отказ</button><button type="button" className="secondary-button compact" disabled={!!savingId} onClick={()=>{setFailId('');setFailureReason('')}}>Отмена</button></div>
        </div>}
        {confirmPass===row.id&&<div className="event-day-confirm" role="group" aria-label={'Подтверждение допуска '+participantLabel(row)}>
         <p>Подтвердить допуск для {participantLabel(row)} · {carLabel(row)}?</p><div className="event-day-row-actions"><button type="button" className="primary-button compact" disabled={!!savingId} onClick={()=>void saveInspection(row,'PASSED')}>Подтвердить допуск</button><button type="button" className="secondary-button compact" disabled={!!savingId} onClick={()=>setConfirmPass('')}>Отмена</button></div>
        </div>}
        <div className="event-day-row-actions">
         {canInspect&&<button type="button" className="secondary-button compact" disabled={!!savingId} onClick={()=>go(inspectionPath(row))}>Осмотр и классы<ChevronRight size={14}/></button>}
         {canEdit&&inspected!=='PASSED'&&<button type="button" className="primary-button compact" disabled={!!savingId} onClick={()=>{setConfirmPass(row.id);setFailId('');setFailureReason('')}}><Check size={14}/>Допустить</button>}
         {canEdit&&inspected!=='FAILED'&&<button type="button" className="secondary-button compact" disabled={!!savingId} onClick={()=>{setFailId(row.id);setConfirmPass('');setFailureReason('')}}><X size={14}/>Отказать</button>}
         {inspected==='PASSED'&&canSeeResults&&<button type="button" className={canEnterResult?'primary-button compact':'secondary-button compact'} disabled={!!savingId} onClick={()=>linkToResults(row)}><Trophy size={14}/>{canEnterResult?'Внести результат':'Результаты'}<ArrowUpRight size={14}/></button>}
        </div>
       </article>;
      })}
     </div>}
     <footer className="event-day-roster-footer"><span><Users size={14}/> {counts.people} уникальных участников · {counts.active} активных регистраций</span><span><ShieldAlert size={14}/> Отсутствие интернета не заменяется этим экраном: для автономной работы нужен отдельный offline-режим.</span></footer>
    </section>
   </>}
  </>}
 </PageFrame>;
}
