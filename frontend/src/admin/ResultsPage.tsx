import {OperationDetailCard} from './OperationDetailCard';
import {EventOperationsStagePicker,EventOperationsActions,EventOperationsSummary} from './EventOperationsControls';
import {EventOperationsPrimaryActions} from './EventOperationsPrimaryActions';
import {InspectionQrScanner} from './InspectionQrScanner';
import {AdminLoadMore,useIncrementalRows} from './AdminLoadMore';
import {ActionError} from '../ActionError';
import {AdminEntityLink,useAdminDetail} from './AdminEntityLink';
import './form-journey.css';
import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,CheckCircle2,ChevronLeft,ChevronRight,ClipboardCheck,Hash,Pencil,RefreshCw,Search,ShieldAlert,Trash2,Trophy,Users,XCircle,X} from 'lucide-react';
import {apiGet,apiPatch,apiPost,listData,type User} from '../api';
import {useViewState,useEditorScroll,matchesSeason,seasonYears,stageYear} from './view-state';
import {loadOperationalStages} from './operational-stages';
import {isPastStageCalendar} from './stage-calendar';
import {EventOperationsNavigation} from './EventOperationsNavigation';
import BassRaceTextImport from './BassRaceTextImport';
import {
 canJudgeRegistration,judgingInspectionStatus,judgingNumbers,
 judgingOverview,judgingResultLink,matchesJudgingResult,remainingJudgingClasses,canConfirmJudgingResult,
 groupJudgingResults,pendingJudgeRegistrations,groupPendingMeasurements,
} from './results-operations-model';

type Go=(path:string)=>void;
type Common={go:Go;PageFrame:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>;EntityDetailModal:React.ComponentType<any>;enumLabel:(v:any)=>string;displayCarName:(car:any,fallback?:string)=>string;displayPersonName:(v:any)=>string;user:User;path:string};
const queryOf=(path:string)=>new URLSearchParams(path.split('?')[1]??'');
const participantName=(row:any)=>[row?.lastName,row?.firstName,row?.middleName].filter(Boolean).join(' ').trim()||'Участник не указан';
const shortCar=(row:any)=>[row?.brand,row?.model].filter(Boolean).join(' ')||'Автомобиль не указан';

function StagePicker({path,go,Empty,children}:{path:string;go:Go;Empty:React.ComponentType<any>;children:(stageId:string,stage:any,stageControls:(extra?:React.ReactNode)=>React.ReactNode)=>React.ReactNode}){
 const requested=queryOf(path).get('stageId')??'';
 const [stages,setStages]=useState<any[]>([]);
 const [stageId,setStageId]=useViewState('results:stage','');
 const [season,setSeason]=useViewState('results:season','ALL');
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let current=true;setLoading(true);setError('');
  void loadOperationalStages<any>().then(rows=>{
   if(!current)return;
   setStages(rows);
   const requestedStage=requested?rows.find(s=>s.id===requested):null;
   if(requested&&!requestedStage){setStageId('');setError('Этап по ссылке не найден. Выберите существующий этап.');return}
   const currentStage=requestedStage??rows.find(s=>s.venueActive)??rows.find(s=>s.id===stageId&&matchesSeason(s,season))??rows.find(s=>matchesSeason(s,season));
   setStageId(currentStage?.id??'');
   if(currentStage&&!matchesSeason(currentStage,season))setSeason(stageYear(currentStage));
  }).catch(e=>{if(current)setError(e instanceof Error?e.message:'Не удалось загрузить календарь')})
   .finally(()=>{if(current)setLoading(false)});
  return()=>{current=false};
 },[requested]);
 const choose=(id:string)=>{setStageId(id);go(id?judgingResultLink(id):'/admin/results')};
 const current=stages.find(s=>s.id===stageId);
 const stageControls=(extra?:React.ReactNode)=><EventOperationsStagePicker viewKey="results" stageId={stageId} stageName={current?.name}><div className="toolbar stage-picker judging-stage-picker"><label>Этап<select aria-label="Этап судейства" value={stageId} disabled={loading} onChange={e=>choose(e.target.value)}>
    <option value="">{loading?'Загрузка этапов…':'Выберите этап'}</option>
    {stages.filter(s=>matchesSeason(s,season)).map(s=><option key={s.id} value={s.id}>№{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}
   </select></label>
   <label>Сезон<select aria-label="Сезон судейства" value={season} disabled={loading} onChange={e=>{
    const next=e.target.value;setSeason(next);
    const stage=stages.find(s=>matchesSeason(s,next));choose(stage?.id??'');
   }}><option value="ALL">Все сезоны</option>{seasonYears(stages).map(y=><option key={y} value={y}>{y}</option>)}</select></label>

  </div>{extra}</EventOperationsStagePicker>;
 return <>
  {error&&<p className="judging-data-error" role="alert">{error}</p>}
  {stageId&&current?<>{children(stageId,current,stageControls)}</>:<>{stageControls()}<section className="panel"><Empty text="Выберите этап для судейства"/></section></>}
 </>;
}

export function ResultsPage({path,go,user,PageFrame,ErrorPanel,LoadingPage,Empty,EntityDetailModal,enumLabel,displayCarName,displayPersonName}:Common){
 const requested=queryOf(path);
 const entryId=requested.get('entry')==='1'?requested.get('registrationId')??'':'';
 return <PageFrame className="event-ops-page judging-page" title="Результаты" subtitle="Результаты участников этапа" showHelp={false}>
  <StagePicker path={path} go={go} Empty={Empty}>
   {(stageId,stage,stageControls)=><>
    <ResultsStage key={stageId} stageControls={stageControls} stageId={stageId} stage={stage} entryId={stageId===requested.get('stageId')?entryId:''} go={go}
     user={user} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty}
     EntityDetailModal={EntityDetailModal} enumLabel={enumLabel}
     displayCarName={displayCarName} displayPersonName={displayPersonName}/>
   </>}
  </StagePicker>
 </PageFrame>;
}

function ResultsStage({stageControls,stageId,stage,entryId,go,user,ErrorPanel,LoadingPage,Empty,EntityDetailModal,enumLabel,displayCarName,displayPersonName}:{
 stageControls:(extra?:React.ReactNode)=>React.ReactNode;stageId:string;stage:any;entryId:string;go:Go;user:User;ErrorPanel:React.ComponentType<any>;
 LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>;EntityDetailModal:React.ComponentType<any>;
 enumLabel:(v:any)=>string;displayCarName:(car:any,fallback?:string)=>string;displayPersonName:(v:any)=>string;
}){
 const [results,setResults]=useState<any[]>([]),[registrations,setRegistrations]=useState<any[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [editor,setEditor]=useState<any|null>(null),[detail,setDetail]=useAdminDetail(results),[editorError,setEditorError]=useState('');
 const [saving,setSaving]=useState(false),[deleteTargetId,setDeleteTargetId]=useState(''),[deleteReason,setDeleteReason]=useState('');
 const [classFilter,setClassFilter]=useViewState('results:'+stageId+':class','ALL');
 const [search,setSearch]=useViewState('results:'+stageId+':search','');
 const [scanOpen,setScanOpen]=useState(false);
 const [pendingOpen,setPendingOpen]=useState(false),[pendingReady,setPendingReady]=useState(false);
 const handledEntry=useRef('');
 const isVenue=stage.venueActive!==undefined;
 const readOnly=isVenue&&isPastStageCalendar(stage);
 useEditorScroll('results:'+stageId,editor!==null||detail!==null,!loading);
 const load=async()=>{
  setLoading(true);setError('');setPendingReady(false);
  try{
   const [saved,entries]=await Promise.all([
    apiGet<any>('/results/admin/stage/'+encodeURIComponent(stageId)),
    apiGet<any>('/registrations?stageId='+encodeURIComponent(stageId)+'&status=ACTIVE'),
   ]);
   setResults(listData(saved));setRegistrations(listData(entries));setPendingReady(true);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить судейство этапа')}
  finally{setLoading(false)}
 };
 useEffect(()=>{void load()},[stageId]);
 useEffect(()=>{
  if(readOnly||loading||!entryId||handledEntry.current===entryId)return;
  handledEntry.current=entryId;
  const requested=registrations.find(r=>r.id===entryId);
  if(!requested){setError('Указанная регистрация не найдена на этом этапе');return}
  if(!canJudgeRegistration(requested)){setError('Результат доступен только после успешной инспекции. Проверьте допуск.');return}
  if(!remainingJudgingClasses(requested,results).length){setError('Для этой регистрации все классы уже получили результаты. Исправление доступно ADMIN.');return}
  setEditor({registrationId:entryId});setDetail(null);setEditorError('');
 },[entryId,loading,registrations,results,readOnly]);
 const closeEditor=()=>{setEditor(null);setEditorError('');if(entryId)go(judgingResultLink(stageId))};
 const save=async(v:any)=>{
  if(readOnly||saving)return;
  setSaving(true);setEditorError('');setNotice('');
  try{
   if(v.id){
    if(user.role!=='ADMIN')throw new Error('Исправить результат может только администратор');
    await apiPatch('/results/'+encodeURIComponent(v.id),{
     value:Number(v.value),place:v.place===''?null:Number(v.place),notes:v.notes?.trim()||null,
    });
   }else{
    const selected=registrations.find(r=>r.id===v.registrationId);
    if(!selected||!canJudgeRegistration(selected))throw new Error('Регистрация должна иметь действующий допуск');
    if(!remainingJudgingClasses(selected,results).some(c=>c.id===v.registrationClassId))
     throw new Error('Результат для этого класса уже существует или класс не выбран');
    await apiPost('/results',{
     registrationId:v.registrationId,registrationClassId:v.registrationClassId,value:Number(v.value),
     ...(v.place===''||v.place==null?{}:{place:Number(v.place)}),
     ...(v.notes?.trim()?{notes:v.notes.trim()}:{}),
     confirmed:true,
    });
   }
   await load();closeEditor();setNotice('Результат сохранён. Состав классов и допуск остались без изменений.');
  }catch(e){setEditorError(e instanceof Error?e.message:'Не удалось сохранить результат')}
  finally{setSaving(false)}
 };
 const deleteResult=async(row:any)=>{
  if(readOnly)return;
  if(!deleteReason.trim()){setError('Укажите причину удаления результата');return}
  if(user.role!=='ADMIN')return;
  setSaving(true);setError('');
  try{
   const response=await apiPost<any>('/results/'+encodeURIComponent(row.id)+'/delete',{confirmed:true,reason:deleteReason.trim()});
   setDeleteTargetId('');setDeleteReason('');await load();
   if(response?.postProcessingWarnings?.length)setError(response.postProcessingWarnings.join('\n'));
   else setNotice('Результат удалён с записью причины в аудит.');
  }catch(e){setError(e instanceof Error?e.message:'Не удалось удалить результат')}
  finally{setSaving(false)}
 };
 const stats=judgingOverview(registrations,results);
 const pendingGroups=pendingOpen&&pendingReady?groupPendingMeasurements(registrations,results):[];
 const classes=[...new Map(registrations.flatMap((r:any)=>(r.classes??[]).map((x:any)=>[x.class?.id,x.class]))).values()]
  .filter(Boolean).sort((a:any,b:any)=>
   (a.direction?.sortOrder??999)-(b.direction?.sortOrder??999)||
   (a.sortOrder??999)-(b.sortOrder??999)||String(a.name??'').localeCompare(String(b.name??''),'ru'));
 const filteredResults=results.filter(r=>
  (classFilter==='ALL'||r.registrationClass?.class?.id===classFilter)&&matchesJudgingResult(r,search));
 const orderedResults=groupJudgingResults(filteredResults).flatMap(group=>group.rows);
 const incremental=useIncrementalRows('results:'+stageId,orderedResults,[search,classFilter].join('\0'));
 const selectedRegistration=registrations.find(r=>r.id===(editor?.registrationId??entryId))??detail?.registration;
 const canCreate=!readOnly&&registrations.some(r=>canJudgeRegistration(r)&&remainingJudgingClasses(r,results).length>0);
 if(scanOpen)return <InspectionQrScanner stageId={stageId} initialUsdId="" contextLabel="Результаты" onClose={()=>setScanOpen(false)} onScan={(nextStageId,registrationId)=>{setScanOpen(false);go(judgingResultLink(nextStageId,registrationId))}}/>;
 return <>
  <EventOperationsNavigation current="results" stageId={stageId} stageName={stage.name} registrationId={selectedRegistration?.id} participantNumber={selectedRegistration?.participantNumber} showListJump={!editor&&!detail} compact={editor===null} go={go}/>
  {readOnly&&<p className="notice">Этап в архиве. Результаты доступны для просмотра.</p>}
  {notice&&<div className="notice judging-notice" role="status"><CheckCircle2 size={16}/>{notice}</div>}
  {error&&<ErrorPanel message={error} retry={load}/>}
  {editor!==null?<ResultEditor value={editor} saving={saving} error={editorError}
    registrations={registrations} results={results} enumLabel={enumLabel}
    displayCarName={displayCarName} onClose={closeEditor} onSubmit={save}/>:
   detail?<OperationDetailCard registration={{...detail.registration,stage:detail.registration?.stage??stage}} result={detail} onBack={()=>setDetail(null)} go={go} displayCarName={displayCarName} enumLabel={enumLabel}
    onEdit={!readOnly&&user.role==='ADMIN'&&!detail.isHistorical?()=>{
     setDetail(null);setEditor({id:detail.id,value:Number(detail.value),place:detail.place??'',notes:detail.notes??''});
    }:undefined}/>:
   <>

    <div className="event-ops-primary-row judging-toolbar">
     <div className="judging-search" role="search"><Search size={17} aria-hidden="true"/>
      <input aria-label="Поиск результата" type="search" value={search}
       onChange={e=>{setSearch(e.target.value)}} placeholder="№, ФИО, госномер, класс или команда"/>
      {search&&<button className="judging-result-search-clear" type="button" aria-label="Очистить поиск результатов" title="Очистить поиск" onClick={()=>{setSearch('')}}><X size={18} aria-hidden="true"/></button>}
     </div>


     <EventOperationsPrimaryActions createLabel="Внести результат" onCreate={()=>{setEditor({});setEditorError('');setDetail(null)}} onScan={()=>setScanOpen(true)} createDisabled={loading||!canCreate} scanDisabled={loading||readOnly}/>
    </div>
    <p className="judging-quick-help" role="status" aria-live="polite">
     Найдено {filteredResults.length} из {results.length} результатов.
     {!readOnly&&!canCreate&&!loading?' · Нет доступных классов для внесения':''}
    </p>
    <div className="event-ops-secondary-controls">{stageControls(<label className="event-ops-extra-filter">Класс<select className="filter-select" aria-label="Фильтр результатов по классу" value={classFilter}
      onChange={e=>{setClassFilter(e.target.value)}}>
      <option value="ALL">Все классы</option>
      {classes.map((c:any)=><option key={c.id} value={c.id}>{c.direction?.name?c.direction.name+' · ':''}{c.name}</option>)}
     </select></label>)}<EventOperationsActions viewKey="results"><div className="event-ops-secondary-actions">     <button className="secondary-button compact" type="button" disabled={loading} onClick={()=>void load()}>
      <RefreshCw size={15}/>Обновить</button><button type="button" className="secondary-button compact" aria-expanded={pendingOpen} aria-controls="pending-measurements" disabled={loading} onClick={()=>{setPendingOpen(!pendingOpen);if(!pendingOpen)void load()}}><ClipboardCheck size={16}/>Не выехали на замер</button>{(search.trim()||classFilter!=='ALL')&&<button className="secondary-button compact judging-filter-reset" type="button" aria-label="Сбросить фильтры результатов" onClick={()=>{setSearch('');setClassFilter('ALL')}}>Сбросить фильтры</button>}<button type="button" className="secondary-button compact" onClick={()=>go('/admin/event-day?stageId='+encodeURIComponent(stageId))}>Участники и допуски</button>{stats.awaiting>0&&<button type="button" className="secondary-button compact" onClick={()=>go('/admin/inspections?stageId='+encodeURIComponent(stageId))}><ShieldAlert size={16}/>Завершить инспекции</button>}</div>{!isVenue && user.role === 'ADMIN' && <BassRaceTextImport stageId={stageId} stageStatus={stage.status} onImported={load}/>}</EventOperationsActions>  <EventOperationsSummary viewKey="results" summary={`Сводка: ${stats.admitted} допущены · ${stats.remaining} классов без результатов · ${stats.entered} внесено`}><section className="judging-summary" aria-label="Сводка судейства">
   {[
    {key:'registrations',name:'Регистрации',icon:Users,value:stats.registrations},
    {key:'admitted',name:'Допущены',icon:CheckCircle2,value:stats.admitted},
    {key:'remaining',name:'Классы без результатов',icon:ClipboardCheck,value:stats.remaining},
    {key:'entered',name:'Результаты',icon:Trophy,value:stats.entered},
   ].map(metric=><div key={metric.key} className="judging-summary-card"><metric.icon size={20}/><strong>{loading?'—':metric.value}</strong><span>{metric.name}</span></div>)}
  </section>
  <section className="judging-context" aria-label="Состояние этапа">
   <div><strong><AdminEntityLink kind="stage" id={stageId}>{stage.name}</AdminEntityLink></strong><p>{stats.awaiting} ожидают инспекцию · {stats.failed} не прошли · {stats.admitted} допущены</p></div>

  </section>
</EventOperationsSummary></div>
    {pendingOpen&&<section id="pending-measurements" className="panel resource-editor-page" aria-label="Участники без замера" aria-busy={loading}>
     <div className="resource-editor-heading"><div><h2>Не выехали на замер</h2>
      <p>Допущенные участники без сохранённого результата по классу. Список по всему этапу, независимо от фильтров протокола. Отсутствие результата не подтверждает фактическую неявку.</p></div>
      <div className="page-actions"><button type="button" className="secondary-button compact" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/>Обновить список</button><button type="button" className="secondary-button compact" onClick={()=>setPendingOpen(false)}><X size={15}/>Закрыть</button></div>
     </div>
     {loading?<LoadingPage small/>:!pendingReady?<p role="alert">Не удалось получить актуальный список. Нажмите «Обновить список».</p>:!pendingGroups.length?<Empty text="У всех допущенных участников внесены результаты по всем классам."/>:<>
      <p className="judging-quick-help" role="status">Классов без результатов: {pendingGroups.reduce((total,group)=>total+group.rows.length,0)}</p>
      <div className="table-wrap judging-results"><table className="data-table judging-results-table" aria-label="Список незавершённых замеров по направлениям">
       <thead><tr><th>Класс</th><th>Номер</th><th>Участник</th><th>Автомобиль</th></tr></thead>
       <tbody>{pendingGroups.flatMap(group=>[
        <tr key={'pending-direction-'+group.id} className="results-direction-row"><td colSpan={4}><strong>{group.name}</strong><span>Без результата: {group.rows.length}</span></td></tr>,
        ...group.rows.map(row=><tr key={row.id}>
         <td data-label="Класс">{row.registrationClass.class.name||'—'}</td>
         <td data-label="Номер"><strong>№{row.registrationClass.number?.number??row.registration.participantNumber??'—'}</strong></td>
         <td data-label="Участник"><strong>{participantName(row.registration.participant)}</strong></td>
         <td data-label="Авто">{displayCarName(row.registration.car)||'—'}{row.registration.car?.registrationNumber&&<small className="table-sub">{row.registration.car.registrationNumber}</small>}</td>
        </tr>),
       ])}</tbody>
      </table></div>
     </>}
    </section>}
    <div id="event-ops-records" className="panel table-wrap judging-results" aria-busy={loading}>
     {loading?<LoadingPage small/>:!filteredResults.length?
      <Empty text={results.length?'По запросу результаты не найдены':'Измерения пока не внесены'}/>:
      <table className="data-table judging-results-table" aria-label="Протокол результатов этапа">
       <thead><tr><th>Класс</th><th>Участник</th><th>Автомобиль</th><th>Результат</th><th>Место</th><th>Статус</th><th>Действия</th></tr></thead>
       <tbody>{groupJudgingResults(incremental.rows).flatMap(group=>[
        <tr key={'direction-'+group.id} className="results-direction-row"><td colSpan={7}><strong>{group.name}</strong><span>{group.rows.length} результатов</span></td></tr>,
        ...group.rows.map((row:any)=><tr key={row.id} className="clickable-row" tabIndex={0} aria-label={'Открыть результат: '+participantName(row.registration?.participant)+' · '+String(row.registrationClass?.class?.name??'класс не указан')} onClick={()=>setDetail(row)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setDetail(row)}}}>
         <td data-label="Класс">{row.registrationClass?.class?.name||'—'}</td>
         <td data-label="Участник"><strong><AdminEntityLink kind="participant" id={row.registration?.participant?.id??row.registration?.participantId}>{participantName(row.registration?.participant)}</AdminEntityLink></strong>
          <small className="table-sub">№{row.registrationClass?.number?.number??judgingNumbers(row.registration??{})[0]??row.registration?.participantNumber??'—'}</small></td>
         <td data-label="Авто"><AdminEntityLink kind="car" id={row.registration?.car?.id??row.registration?.carId}>{displayCarName(row.registration?.car)||'—'}</AdminEntityLink>{row.registration?.car?.registrationNumber&&<small className="table-sub result-car-plate">{row.registration.car.registrationNumber}</small>}</td>
         <td data-label="Результат"><strong>{row.value}</strong>{row.registrationClass?.class?.unit&&
          <small className="table-sub">{enumLabel(row.registrationClass.class.unit)}</small>}</td>
         <td data-label="Место"><strong>{row.place??'—'}</strong></td>
         <td data-label="Статус">{row.isHistorical?<span className="badge">Исторический</span>:
          <span className="badge good">Официальный</span>}</td>
         <td data-label="Действия" className="row-actions" onClick={e=>e.stopPropagation()}>
          <button type="button" className="secondary-button compact result-open" onClick={()=>setDetail(row)}>Открыть<ChevronRight size={14}/></button>
          {!readOnly&&user.role==='ADMIN'&&!row.isHistorical&&<>
           <button type="button" className="icon-button" title="Исправить результат" aria-label="Исправить результат" onClick={()=>{
            setEditor({id:row.id,value:Number(row.value),place:row.place??'',notes:row.notes??''});setEditorError('');
           }}><Pencil size={16}/></button>
           {deleteTargetId===row.id?<span className="inline-confirm-actions result-delete-confirm">
            <input aria-label="Причина удаления результата" value={deleteReason} onChange={e=>setDeleteReason(e.target.value)} required placeholder="Причина удаления"/>
            <button type="button" className="danger-button compact" disabled={saving||!deleteReason.trim()} onClick={()=>void deleteResult(row)}><Trash2 size={14}/>Удалить</button>
            <button type="button" className="secondary-button compact" disabled={saving} onClick={()=>{setDeleteTargetId('');setDeleteReason('')}}>Отмена</button>
           </span>:<button type="button" className="icon-button danger" title="Удалить результат" aria-label="Удалить результат" onClick={()=>{
            setDeleteTargetId(row.id);setDeleteReason('');setError('');
           }}><Trash2 size={16}/></button>}
          </>}
         </td>
        </tr>),
       ])}</tbody>
      </table>}
    </div>
    <AdminLoadMore label="Результаты" total={filteredResults.length} shown={incremental.rows.length} onMore={incremental.showMore} busy={loading}/>
   </>}
 </>;
}

function ResultEditor({value,registrations,results,saving,error,onClose,onSubmit,displayCarName,enumLabel}:{
 value:any;registrations:any[];results:any[];saving:boolean;error:string;onClose:()=>void;
 onSubmit:(v:any)=>Promise<void>;displayCarName:(v:any,fallback?:string)=>string;enumLabel:(v:any)=>string;
}){
 const [v,setV]=useState<any>(value??{}),[term,setTerm]=useState('');
 const [judgingStep,setJudgingStep]=useState<0|1|2>(value?.id?2:0);
 const judgingHeadingRef=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(!value?.id)judgingHeadingRef.current?.focus()},[judgingStep]);
 const eligible=pendingJudgeRegistrations(registrations,results,term);
 const selected=registrations.find(r=>r.id===v.registrationId);
 const available=remainingJudgingClasses(selected,results).sort((a:any,b:any)=>
  (a.class?.direction?.sortOrder??999)-(b.class?.direction?.sortOrder??999)||
  (a.class?.sortOrder??999)-(b.class?.sortOrder??999)||
  String(a.class?.name??'').localeCompare(String(b.class?.name??''),'ru'));
 const valid=Number.isFinite(Number(v.value))&&v.value!==''&&v.value!==undefined&&
  Number(v.value)>=0&&(v.place===''||v.place===undefined||
  (Number.isInteger(Number(v.place))&&Number(v.place)>=1&&Number(v.place)<=999));
 const editable=!!v.id;
 const judgingSteps=['Допущенный участник','Класс регистрации','Измерение и проверка'] as const;
 const judgingReady=[Boolean(selected),Boolean(selected&&available.some(c=>c.id===v.registrationClassId)),valid];
 const nextJudgingStep=()=>setJudgingStep(current=>current<2&&judgingReady[current]?(current+1) as 0|1|2:current);
 const submitJudging=()=>{
  // An explicit button click (pointer, keyboard or assistive tech) is the only write path.
  if(canConfirmJudgingResult({
   explicit:true,step:judgingStep,editing:editable,valid,
   hasRegistration:Boolean(selected),hasClass:available.some(c=>c.id===v.registrationClassId),
  }))void onSubmit(v);
 };

 return <section className="panel resource-editor-page judging-entry-wizard" aria-label="Редактор результата">
  <div className="resource-editor-heading"><div><span className="eyebrow">USD · СУДЕЙСТВО</span>
   <h2>{editable?'Исправление результата':'Новое измерение'}</h2>
   <p>{editable?'Изменить существующий результат может только ADMIN. Исправление фиксируется в аудите.':
    'Выберите допущенного участника по номеру, затем свободный класс и внесите значение.'}</p>
  </div><button type="button" className="secondary-button" onClick={onClose} disabled={saving}><ChevronLeft size={16}/>К протоколу</button></div>
  <form className="form judging-entry-form" noValidate
   onKeyDown={e=>{if(e.key==='Enter'&&e.target instanceof HTMLInputElement)e.preventDefault()}}
   onSubmit={e=>e.preventDefault()}>
   {!editable&&<><nav className="form-wizard-nav" aria-label="Шаги внесения результата">{judgingSteps.map((label,index)=><button key={label} type="button" className={judgingStep===index?'is-active':''} aria-current={judgingStep===index?'step':undefined} disabled={saving||(index>0&&!judgingReady.slice(0,index).every(Boolean))} onClick={()=>setJudgingStep(index as 0|1|2)}><span>{index+1}</span><strong>{label}</strong><small>{index===0?(judgingReady[0]?'Участник выбран':'Выберите участника'):index===1?(judgingReady[1]?'Класс выбран':'Выберите класс'):'Проверка результата'}</small></button>)}</nav><p className="form-wizard-progress" role="status" aria-live="polite">Шаг {judgingStep+1} из 3 · {judgingSteps[judgingStep]}</p><h3 tabIndex={-1} ref={judgingHeadingRef} className="form-wizard-title">{judgingSteps[judgingStep]}</h3></>}
   {!editable&&<>
    <fieldset className="judging-entry-step" hidden={judgingStep!==0} disabled={saving}>
     <legend><span className="judging-step-number">01</span>Допущенный участник</legend>
     <label className="judging-entry-search"><Search size={17}/><input type="search"
      aria-label="Поиск участника по номеру или ФИО" value={term} onChange={e=>setTerm(e.target.value)}
      placeholder="№7, Семёнов, ВАЗ, А001УР001, Limited 2.0"/></label>
     {selected&&<div className="judging-selected">
      <CheckCircle2 size={20}/><div><strong>№{judgingNumbers(selected).join(' / ')} · {participantName(selected.participant)}</strong>
       <span>{shortCar(selected.car)} · {selected.car?.registrationNumber||'Без госномера'}</span></div>
     </div>}
     <div className="judging-roster" role="group" aria-label="Участники с допуском">
      {eligible.slice(0,18).map(r=><button className={'judging-roster-item'+(v.registrationId===r.id?' is-selected':'')}
       type="button" key={r.id} aria-pressed={v.registrationId===r.id}
       onClick={()=>setV((state:any)=>({...state,registrationId:r.id,registrationClassId:''}))}>
       <span className="judging-roster-number"><Hash size={14}/>{judgingNumbers(r).join('/')}</span>
       <span className="judging-roster-info"><strong>{participantName(r.participant)}</strong>
        <small>{shortCar(r.car)} · {r.car?.registrationNumber||'Без госномера'}</small></span>
       <span className="judging-roster-classes">{remainingJudgingClasses(r,results).length} свободных</span>
      </button>)}
     </div>
     {eligible.length>18&&<p className="judging-quick-help">Показаны первые 18. Уточните номер или ФИО, чтобы сузить поиск.</p>}
     {!eligible.length&&<p className="judging-quick-help">
      {term?'Участников с невнесёнными результатами по запросу нет.':'Нет допущенных участников с невнесёнными результатами.'}
     </p>}
    </fieldset>
    <fieldset className="judging-entry-step" hidden={judgingStep!==1} disabled={saving||!selected}>
     <legend><span className="judging-step-number">02</span>Класс регистрации</legend>
     <label>Доступный класс<select value={v.registrationClassId??''} required
      onChange={e=>setV({...v,registrationClassId:e.target.value})}>
      <option value="">Выберите класс</option>
      {available.map((c:any)=><option value={c.id} key={c.id}>
       {[c.class?.direction?.name,c.class?.name].filter(Boolean).join(' · ')} · {enumLabel(c.class?.unit)}
      </option>)}
     </select></label>
     {selected&&!available.length&&<p className="judging-class-warning">
      <XCircle size={17}/>Для всех классов этого участника результаты уже внесены.
      Исправление существующего результата доступно ADMIN из протокола.
     </p>}
    </fieldset>
   </>}
   <fieldset className="judging-entry-step" hidden={judgingStep!==2} disabled={saving||(!editable&&(!selected||!available.length))}>
    <legend><span className="judging-step-number">{editable?'01':'03'}</span>Результат и место</legend>
    <div className="judging-value-grid">
     <label>Значение результата<input type="number" step="0.001" min="0" inputMode="decimal"
      value={v.value??''} onChange={e=>setV({...v,value:e.target.value})} required/></label>
     <label>Место (необязательно)<input type="number" min="1" max="999" step="1"
      value={v.place??''} onChange={e=>setV({...v,place:e.target.value})}/></label>
    </div>
    <label>Комментарий к измерению<textarea rows={3} value={v.notes??''}
     onChange={e=>setV({...v,notes:e.target.value})}/></label>
   </fieldset>
   {judgingStep===2&&selected&&<div className="form-wizard-review judging-entry-review" role="status"><strong>Проверьте измерение</strong><p>№{judgingNumbers(selected).join(' / ')} · {participantName(selected.participant)} · {shortCar(selected.car)}</p><p>{available.find(c=>c.id===v.registrationClassId)?.class?.name??'Укажите класс'} · {v.value??'—'} {enumLabel(available.find(c=>c.id===v.registrationClassId)?.class?.unit??'DB')}</p></div>}
   <div className="judging-submit"><ActionError message={error}/><p>{judgingStep===2?'Измерение сохранится в протоколе этапа. Редактировать и удалять результаты может только ADMIN.':'Введённые данные сохраняются при переходе назад. Результат пока не отправлен.'}</p>
    {!editable&&judgingStep>0&&<button type="button" className="secondary-button" disabled={saving} onClick={()=>setJudgingStep((judgingStep-1) as 0|1)}>Назад</button>}
    {!editable&&judgingStep<2?<button className="primary-button" type="button" disabled={saving||!judgingReady[judgingStep]} onClick={nextJudgingStep}>Продолжить <ChevronRight size={16}/></button>:<button className="primary-button" type="button" data-judging-confirm="true" onClick={submitJudging} disabled={saving||!valid||(!editable&&(!selected||!available.some(c=>c.id===v.registrationClassId)))}>
     <Trophy size={16}/>{saving?'Сохраняем…':editable?'Сохранить исправление':'Подтвердить и сохранить измерение'}
     {!saving&&<ChevronRight size={16}/>}
    </button>}
   </div>
  </form>
 </section>;
}

export default ResultsPage;
