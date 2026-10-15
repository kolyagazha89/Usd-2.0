import {useEffect,useState} from 'react';
import {AlertTriangle,CalendarDays,CarFront,Check,CheckCircle2,ChevronLeft,ChevronRight,ClipboardCheck,FileInput,Flag,History,Loader2,Plus,RefreshCw,ShieldAlert,Trophy,UserRound,Users} from 'lucide-react';
import {apiGet,apiPost,apiPut,getDashboard,getStageStatistics,listData,type Dashboard} from '../api';
import {formatPlateInput,formatRussianPhoneInput} from '../profile-validation';

export function DashboardPage({go,PageFrame,PanelTitle,Empty,ErrorPanel,LoadingPage,formatDate,enumLabel,displayCarName}:{go:(p:string)=>void;PageFrame:React.ComponentType<any>;PanelTitle:React.ComponentType<any>;Empty:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;formatDate:(v:string)=>string;enumLabel:(v:any)=>string;displayCarName:(car:any,fallback?:string)=>string}){
 const[data,setData]=useState<Dashboard|null>(null),[stageStats,setStageStats]=useState<any|null>(null),[error,setError]=useState(''),[quick,setQuick]=useState<'STAGE'|'PARTICIPANT'|'CAR'|null>(null);
 const load=async()=>{setError('');try{const dashboard=await getDashboard();setData(dashboard);if(dashboard.currentStage){try{setStageStats((await getStageStatistics(dashboard.currentStage.id))?.stats??null)}catch{setStageStats(null)}}else setStageStats(null)}catch(e){setError(e instanceof Error?e.message:'Ошибка загрузки')}};
 useEffect(()=>{void load()},[]);
 if(error)return <ErrorPanel message={error} retry={load}/>;
 if(!data)return <LoadingPage/>;
 if(quick)return <PageFrame title="Быстрое создание" subtitle="Создайте запись без всплывающего окна и продолжите работу в соответствующем разделе." action={<button className="secondary-button compact" onClick={()=>setQuick(null)}><ChevronLeft size={15}/>Назад к панели</button>}><QuickCreatePage kind={quick} onClose={()=>setQuick(null)} onSaved={async()=>{setQuick(null);await load()}} LoadingPage={LoadingPage}/></PageFrame>;
 const stage=data.currentStage,regs=data.activeRegistrationStats,a=data.attention,ov=data.overview;
 return <PageFrame title="Панель управления" subtitle="Операционный центр USD" action={<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>}>
  <section className="dashboard-kpis">
   <button className="dashboard-kpi" onClick={()=>go('/admin/participants')}><span><Users size={16}/>Участники</span><strong>{ov.participants.toLocaleString('ru-RU')}</strong><small>в базе</small></button>
   <button className="dashboard-kpi" onClick={()=>go('/admin/cars')}><span><CarFront size={16}/>Автомобили</span><strong>{ov.cars.toLocaleString('ru-RU')}</strong><small>активных</small></button>
   <button className="dashboard-kpi" onClick={()=>go('/admin/registrations')}><span><ClipboardCheck size={16}/>Регистрации</span><strong>{regs.registrations.toLocaleString('ru-RU')}</strong><small>{regs.participants} участников · {regs.cars} авто</small></button>
   <button className="dashboard-kpi" onClick={()=>go('/admin/results')}><span><Trophy size={16}/>Результаты</span><strong>{(ov.appearances??ov.results??0).toLocaleString('ru-RU')}</strong><small>учтённых выступлений</small></button>
  </section>
  <section className="dashboard-main-grid">
   <div className="panel dashboard-stage-card">
    <PanelTitle title={stage?'Рабочий этап':'Ближайший этап'} icon={Flag} action="Открыть этап" onAction={()=>stage&&go('/admin/stages/'+stage.id)}/>
    {stage?<div className="dashboard-working-stage">
      <button className="dashboard-feature" onClick={()=>go('/admin/stages/'+stage.id)}>
        <div className="stage-number large">{stage.stageNumber}</div>
        <div className="stage-main"><strong>{stage.name}</strong><span>{stage.city||'—'} · {formatDate(stage.date)}</span><small className="stage-statuses"><span className="status">{stage.registrationOpen?'Регистрация открыта':'Регистрация закрыта'}</span><span className={'status status-stage '+String(stage.status||'').toLowerCase()}>{enumLabel(stage.status)}</span></small></div>
        <ChevronRight size={20}/>
      </button>
      {stageStats&&<div className="working-stage-summary">
        <div className="working-summary-head"><div><span className="eyebrow">СВОДКА ПО ЭТАПУ</span><strong>Регистрации и инспекции</strong></div><button className="text-button" onClick={e=>{e.stopPropagation();go('/admin/registrations?stageId='+stage.id)}}>Открыть регистрации</button></div>
        <div className="working-summary-kpis">
          <div><span>Регистрации</span><strong>{stageStats.registrations}</strong><small>{stageStats.participants} участников · {stageStats.cars} авто</small></div>
          <div><span>Инспекции</span><strong>{stageStats.inspections?.total??0}</strong><small>{stageStats.inspections?.pending??0} ожидают</small></div>
          <div><span>Прошли</span><strong>{stageStats.inspections?.passed??0}</strong><small>допущены</small></div>
          <div><span>Не прошли</span><strong>{stageStats.inspections?.failed??0}</strong><small>требуют внимания</small></div>
        </div>

        <div className="working-summary-links">
          <button type="button" className="working-summary-link" onClick={e=>{e.stopPropagation();go('/admin/registrations?stageId='+stage.id)}}><span>Регистрации</span><strong>Открыть</strong><ChevronRight size={15}/></button>
          <button type="button" className="working-summary-link" onClick={e=>{e.stopPropagation();go('/admin/inspections?stageId='+stage.id)}}><span>Инспекции</span><strong>Открыть</strong><ChevronRight size={15}/></button>
        </div>

      </div>}
    </div>:<Empty text="Будущих этапов пока нет"/>}
   </div>
   <div className="panel dashboard-command-panel">
    <PanelTitle title="Быстро создать" icon={Plus}/>
    <div className="dashboard-actions dashboard-create-actions">
     <button onClick={()=>setQuick('STAGE')}><Plus size={17}/><span><strong>Создать этап</strong><small>Новый этап чемпионата</small></span></button>
     <button onClick={()=>setQuick('PARTICIPANT')}><UserRound size={17}/><span><strong>Добавить участника</strong><small>Создать профиль участника</small></span></button>
     <button onClick={()=>setQuick('CAR')}><CarFront size={17}/><span><strong>Добавить автомобиль</strong><small>Привязать авто к участнику</small></span></button>
    </div>
   </div>
  </section>
  <section className="dashboard-alert-grid">
   <button className={'dashboard-alert '+(a.pendingInspections?'attention':'')} onClick={()=>go('/admin/inspections')}><div><ShieldAlert size={20}/><span>Инспекции</span></div><strong>{a.pendingInspections}</strong><small>{a.pendingInspections?'ожидают проверки':'все проверены'}</small></button>
   <button className={'dashboard-alert '+(a.failedInspections?'danger':'')} onClick={()=>go('/admin/inspections')}><div><AlertTriangle size={20}/><span>Проблемные инспекции</span></div><strong>{a.failedInspections}</strong><small>{a.failedInspections?'требуют внимания':'нарушений не найдено'}</small></button>
   <button className={'dashboard-alert '+(a.unresolvedImports?'danger':'')} onClick={()=>go('/admin/import')}><div><FileInput size={20}/><span>Импорт</span></div><strong>{a.unresolvedImports}</strong><small>{a.unresolvedImports?'загрузок с предупреждениями':'очередь чистая'}</small></button>
   <button className={'dashboard-alert '+(a.activeDisqualifications?'attention':'')} onClick={()=>go('/admin/disqualifications')}><div><AlertTriangle size={20}/><span>Дисквалификации</span></div><strong>{a.activeDisqualifications}</strong><small>{a.activeDisqualifications?'активных':'активных нет'}</small></button>
   <button className="dashboard-alert" onClick={()=>go('/admin/results')}><div><Trophy size={20}/><span>Результаты сегодня</span></div><strong>{a.resultsToday}</strong><small>внесено за сегодня</small></button>
   <button className="dashboard-alert" onClick={()=>go('/admin/records')}><div><Trophy size={20}/><span>Текущие рекорды</span></div><strong>{ov.currentRecords}</strong><small>действующих</small></button>
  </section>
  <section className="dashboard-lower-grid">
   <div className="panel"><PanelTitle title="Ближайшие этапы" icon={CalendarDays} action="Все" onAction={()=>go('/admin/stages')}/>{data.upcomingStages.length?data.upcomingStages.map(s=><button className="stage-row" key={s.id} onClick={()=>go('/admin/stages/'+s.id)}><div className="stage-number">{s.stageNumber}</div><div className="stage-main"><strong>{s.name}</strong><span>{s.city||'—'} · {formatDate(s.date)}</span></div><span className={'status '+(s.registrationOpen?'open':'')}>{s.registrationOpen?'Открыта':'Закрыта'}</span><ChevronRight size={16}/></button>):<Empty text="Нет запланированных этапов"/>}</div>
   <div className="panel"><PanelTitle title="Последние этапы" icon={History} action="Все" onAction={()=>go('/admin/stages')}/>{data.recentStages.length?data.recentStages.map(s=><button className="stage-row" key={s.id} onClick={()=>go('/admin/stages/'+s.id)}><div className="stage-number">{s.stageNumber}</div><div className="stage-main"><strong>{s.name}</strong><span>{s.city||'—'} · {formatDate(s.date)}</span></div><ChevronRight size={16}/></button>):<Empty text="История этапов пока пуста"/>}</div>
  </section>
 </PageFrame>
}

function QuickCreatePage({kind,onClose,onSaved,LoadingPage}:{kind:'STAGE'|'PARTICIPANT'|'CAR';onClose:()=>void;onSaved:()=>Promise<void>;LoadingPage:React.ComponentType<any>}){
 const [v,setV]=useState<any>({status:'DRAFT',registrationOpen:false,isPublic:true}),[options,setOptions]=useState<any[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const isStage=kind==='STAGE',isParticipant=kind==='PARTICIPANT';
 useEffect(()=>{let cancelled=false;(async()=>{try{if(isStage){setOptions(listData(await apiGet<any>('/seasons')))}else if(!isParticipant){setOptions(listData(await apiGet<any>('/admin/participants')))}}catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Не удалось загрузить данные')}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[kind]);
 const submit=async()=>{setSaving(true);setError('');try{
   if(isStage){const body={stageNumber:Number(v.stageNumber),name:String(v.name||'').trim(),city:v.city?.trim()||undefined,date:v.date?v.date+'T12:00:00':undefined,status:v.status||'DRAFT',registrationOpen:!!v.registrationOpen,venue:v.venue?.trim()||undefined,address:v.address?.trim()||undefined,seasonId:v.seasonId};const created=await apiPost<any>('/stages',body);const stage=created?.stage??created?.data??created;if(stage?.id){const classes=listData(await apiGet<any>('/classes'));const ids=classes.filter((x:any)=>x.isActive!==false).map((x:any)=>x.id);if(ids.length)await apiPut('/stages/'+stage.id+'/classes',{classIds:ids})}
   }else if(isParticipant){await apiPost('/participants',{lastName:v.lastName?.trim(),firstName:v.firstName?.trim(),middleName:v.middleName?.trim()||undefined,city:v.city?.trim()||undefined,team:v.team?.trim()||undefined,phone:v.phone?.trim()||undefined,isPublic:!!v.isPublic})}
   else {if(!v.participantId)throw new Error('Выберите участника');await apiPost('/participants/'+encodeURIComponent(v.participantId)+'/cars',{brand:v.brand?.trim(),model:v.model?.trim(),registrationNumber:v.registrationNumber?.trim()||undefined,registrationCountry:v.registrationCountry||'RU',color:v.color?.trim()||undefined})}
   await onSaved()
 }catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить')}finally{setSaving(false)}};
 const title=isStage?'Создать этап':isParticipant?'Добавить участника':'Добавить автомобиль';
 return <section className="panel resource-editor-page"><div className="resource-editor-heading"><div><span className="eyebrow">USD · БЫСТРОЕ СОЗДАНИЕ</span><h2>{title}</h2><p>Заполните основные данные. Подробные настройки доступны в профильном разделе.</p></div><button type="button" className="secondary-button" onClick={onClose}><ChevronLeft size={16}/>Назад к панели</button></div>
  <div className="quick-create-modal">
   <div className="quick-create-head"><span>{isStage?<CalendarDays size={20}/>:isParticipant?<UserRound size={20}/>:<CarFront size={20}/>}</span><div><span className="eyebrow">БЫСТРОЕ СОЗДАНИЕ</span><strong>{isStage?'Заполните только главное — остальное можно настроить позже.':isParticipant?'Создайте профиль за несколько секунд.':'Добавьте автомобиль и сразу привяжите его к участнику.'}</strong></div></div>
   {error&&<div className="form-error"><AlertTriangle size={16}/><span>{error}</span></div>}
   {loading&&!isParticipant?<LoadingPage small/>:<div className="form quick-create-form">
    {isStage?<><div className="form-grid-3"><label>№ этапа<input type="number" value={v.stageNumber??''} onChange={e=>setV({...v,stageNumber:e.target.value})} required/></label><label>Название<input placeholder="Например: Тюмень" value={v.name??''} onChange={e=>setV({...v,name:e.target.value})} required/></label><label>Дата<input type="date" value={v.date??''} onChange={e=>setV({...v,date:e.target.value})} required/></label></div><div className="form-grid-3"><label>Сезон<select value={v.seasonId??''} onChange={e=>setV({...v,seasonId:e.target.value})}><option value="">Выберите сезон</option>{options.map(x=><option key={x.id} value={x.id}>{x.year}{x.name?' · '+x.name:''}</option>)}</select></label><label>Город<input value={v.city??''} onChange={e=>setV({...v,city:e.target.value})}/></label><label>Статус<select value={v.status} onChange={e=>setV({...v,status:e.target.value})}><option value="DRAFT">Черновик</option><option value="PUBLISHED">Опубликован</option></select></label></div></>:isParticipant?<div className="form-grid-3"><label>Фамилия<input value={v.lastName??''} onChange={e=>setV({...v,lastName:e.target.value})} required/></label><label>Имя<input value={v.firstName??''} onChange={e=>setV({...v,firstName:e.target.value})} required/></label><label>Отчество<input value={v.middleName??''} onChange={e=>setV({...v,middleName:e.target.value})}/></label><label>Город<input value={v.city??''} onChange={e=>setV({...v,city:e.target.value})}/></label><label>Команда<input value={v.team??''} onChange={e=>setV({...v,team:e.target.value})}/></label><label>Телефон<input type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 (999) 123-45-67" value={v.phone??''} onChange={e=>setV({...v,phone:formatRussianPhoneInput(e.target.value)})}/></label></div>:<><label>Участник<select value={v.participantId??''} onChange={e=>setV({...v,participantId:e.target.value})}><option value="">Выберите участника</option>{options.map(x=><option key={x.id} value={x.id}>{[x.lastName,x.firstName,x.middleName].filter(Boolean).join(' ')}{x.team?' · '+x.team:''}</option>)}</select></label><div className="form-grid-3"><label>Марка<input value={v.brand??''} onChange={e=>setV({...v,brand:e.target.value})} required/></label><label>Модель<input value={v.model??''} onChange={e=>setV({...v,model:e.target.value})} required/></label><label>Госномер<input value={v.registrationNumber??''} onChange={e=>setV({...v,registrationNumber:formatPlateInput(String(v.registrationCountry??'RU'),e.target.value)})} maxLength={9} autoCapitalize="characters"/></label></div><div className="form-grid-3"><label>Страна<select value={v.registrationCountry??'RU'} onChange={e=>setV({...v,registrationCountry:e.target.value})}><option>RU</option><option>KZ</option><option>BY</option><option>AM</option><option>GE</option></select></label><label>Цвет<input value={v.color??''} onChange={e=>setV({...v,color:e.target.value})}/></label></div></>}
    <div className="quick-create-actions"><button className="secondary-button" type="button" onClick={onClose}>Отмена</button><button className="primary-button" type="button" disabled={saving||loading||(isStage&&(!v.stageNumber||!v.name||!v.date||!v.seasonId))||(isParticipant&&(!v.lastName||!v.firstName))||(!isStage&&!isParticipant&&(!v.participantId||!v.brand||!v.model))} onClick={()=>void submit()}>{saving?<><Loader2 className="spin" size={15}/>Сохраняем…</>:<><Check size={15}/>Создать</>}</button></div>
   </div>}
  </div></section>
}

export default DashboardPage;
