import {useEffect,useRef,useState} from 'react';
import {AlertTriangle,CheckCircle2,ChevronLeft,ChevronRight,ClipboardCheck,Hash,Pencil,Plus,RefreshCw,Search,ShieldAlert,Trash2,Trophy,Users,XCircle} from 'lucide-react';
import {apiGet,apiPatch,apiPost,listData,type User} from '../api';
import {useViewState,matchesSeason,seasonYears,stageYear} from './view-state';
import {EventOperationsNavigation} from './EventOperationsNavigation';
import {
 canJudgeRegistration,filterJudgeRegistrations,judgingInspectionStatus,judgingNumbers,
 judgingOverview,judgingResultLink,matchesJudgingResult,remainingJudgingClasses,
} from './results-operations-model';

type Go=(path:string)=>void;
type Common={go:Go;PageFrame:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>;EntityDetailModal:React.ComponentType<any>;enumLabel:(v:any)=>string;displayCarName:(car:any,fallback?:string)=>string;displayPersonName:(v:any)=>string;user:User;path:string};
const queryOf=(path:string)=>new URLSearchParams(path.split('?')[1]??'');
const participantName=(row:any)=>[row?.lastName,row?.firstName,row?.middleName].filter(Boolean).join(' ').trim()||'Участник не указан';
const shortCar=(row:any)=>[row?.brand,row?.model].filter(Boolean).join(' ')||'Автомобиль не указан';

function StagePicker({path,go,Empty,children}:{path:string;go:Go;Empty:React.ComponentType<any>;children:(stageId:string,stage:any)=>React.ReactNode}){
 const requested=queryOf(path).get('stageId')??'';
 const [stages,setStages]=useState<any[]>([]);
 const [stageId,setStageId]=useViewState('results:stage','');
 const [season,setSeason]=useViewState('results:season','ALL');
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let current=true;setLoading(true);setError('');
  void apiGet<any>('/stages').then(value=>{
   if(!current)return;
   const rows=listData<any>(value).filter(s=>s?.id);
   setStages(rows);
   const requestedStage=requested?rows.find(s=>s.id===requested):null;
   if(requested&&!requestedStage){setStageId('');setError('Этап по ссылке не найден. Выберите существующий этап.');return}
   const currentStage=requestedStage??rows.find(s=>s.id===stageId&&matchesSeason(s,season))??rows.find(s=>matchesSeason(s,season));
   setStageId(currentStage?.id??'');
   if(requestedStage&&!matchesSeason(requestedStage,season))setSeason(stageYear(requestedStage));
  }).catch(e=>{if(current)setError(e instanceof Error?e.message:'Не удалось загрузить календарь')})
   .finally(()=>{if(current)setLoading(false)});
  return()=>{current=false};
 },[requested]);
 const choose=(id:string)=>{setStageId(id);go(id?judgingResultLink(id):'/admin/results')};
 const current=stages.find(s=>s.id===stageId);
 return <>
  <div className="toolbar stage-picker judging-stage-picker">
   <label>Сезон<select aria-label="Сезон судейства" value={season} disabled={loading} onChange={e=>{
    const next=e.target.value;setSeason(next);
    const stage=stages.find(s=>matchesSeason(s,next));choose(stage?.id??'');
   }}><option value="ALL">Все сезоны</option>{seasonYears(stages).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
   <label>Этап<select aria-label="Этап судейства" value={stageId} disabled={loading} onChange={e=>choose(e.target.value)}>
    <option value="">{loading?'Загрузка этапов…':'Выберите этап'}</option>
    {stages.filter(s=>matchesSeason(s,season)).map(s=><option key={s.id} value={s.id}>№{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}
   </select></label>
  </div>
  {error&&<p className="judging-data-error" role="alert">{error}</p>}
  {stageId&&current?<>{children(stageId,current)}</>:<section className="panel"><Empty text="Выберите этап для судейства"/></section>}
 </>;
}

export function ResultsPage({path,go,user,PageFrame,ErrorPanel,LoadingPage,Empty,EntityDetailModal,enumLabel,displayCarName,displayPersonName}:Common){
 const requested=queryOf(path);
 const entryId=requested.get('entry')==='1'?requested.get('registrationId')??'':'';
 return <PageFrame className="event-ops-page judging-page" title="Судейство и результаты" subtitle="Третий этап рабочего процесса: допуск, измерения, места и протоколы">
  <StagePicker path={path} go={go} Empty={Empty}>
   {(stageId,stage)=><>
    <EventOperationsNavigation current="results" stageId={stageId} stageName={stage.name} go={go}/>
    <ResultsStage key={stageId} stageId={stageId} stage={stage} entryId={entryId} go={go}
     user={user} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} Empty={Empty}
     EntityDetailModal={EntityDetailModal} enumLabel={enumLabel}
     displayCarName={displayCarName} displayPersonName={displayPersonName}/>
   </>}
  </StagePicker>
 </PageFrame>;
}

function ResultsStage({stageId,stage,entryId,go,user,ErrorPanel,LoadingPage,Empty,EntityDetailModal,enumLabel,displayCarName,displayPersonName}:{
 stageId:string;stage:any;entryId:string;go:Go;user:User;ErrorPanel:React.ComponentType<any>;
 LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>;EntityDetailModal:React.ComponentType<any>;
 enumLabel:(v:any)=>string;displayCarName:(car:any,fallback?:string)=>string;displayPersonName:(v:any)=>string;
}){
 const [results,setResults]=useState<any[]>([]),[registrations,setRegistrations]=useState<any[]>([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [editor,setEditor]=useState<any|null>(null),[detail,setDetail]=useState<any|null>(null),[editorError,setEditorError]=useState('');
 const [saving,setSaving]=useState(false),[deleteTargetId,setDeleteTargetId]=useState(''),[deleteReason,setDeleteReason]=useState('');
 const [classFilter,setClassFilter]=useViewState('results:'+stageId+':class','ALL');
 const [search,setSearch]=useViewState('results:'+stageId+':search','');
 const handledEntry=useRef('');
 const load=async()=>{
  setLoading(true);setError('');
  try{
   const [saved,entries]=await Promise.all([
    apiGet<any>('/results/admin/stage/'+encodeURIComponent(stageId)),
    apiGet<any>('/registrations?stageId='+encodeURIComponent(stageId)+'&status=ACTIVE'),
   ]);
   setResults(listData(saved));setRegistrations(listData(entries));
  }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить судейство этапа')}
  finally{setLoading(false)}
 };
 useEffect(()=>{void load()},[stageId]);
 useEffect(()=>{
  if(loading||!entryId||handledEntry.current===entryId)return;
  handledEntry.current=entryId;
  const requested=registrations.find(r=>r.id===entryId);
  if(!requested){setError('Указанная регистрация не найдена на этом этапе');return}
  if(!canJudgeRegistration(requested)){setError('Результат доступен только после успешной инспекции. Проверьте допуск.');return}
  if(!remainingJudgingClasses(requested,results).length){setError('Для этой регистрации все классы уже получили результаты. Исправление доступно ADMIN.');return}
  setEditor({registrationId:entryId});setDetail(null);setEditorError('');
 },[entryId,loading,registrations,results]);
 const closeEditor=()=>{setEditor(null);setEditorError('');if(entryId)go(judgingResultLink(stageId))};
 const save=async(v:any)=>{
  if(saving)return;
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
 const classes=[...new Map(registrations.flatMap((r:any)=>(r.classes??[]).map((x:any)=>[x.class?.id,x.class]))).values()]
  .filter(Boolean).sort((a:any,b:any)=>
   (a.direction?.sortOrder??999)-(b.direction?.sortOrder??999)||
   (a.sortOrder??999)-(b.sortOrder??999)||String(a.name??'').localeCompare(String(b.name??''),'ru'));
 const filteredResults=results.filter(r=>
  (classFilter==='ALL'||r.registrationClass?.class?.id===classFilter)&&matchesJudgingResult(r,search));
 const selectedRegistration=registrations.find(r=>r.id===editor?.registrationId);
 const canCreate=registrations.some(r=>canJudgeRegistration(r)&&remainingJudgingClasses(r,results).length>0);
 return <>
  <section className="judging-summary" aria-label="Сводка судейства">
   {[
    {key:'registrations',name:'Регистрации',icon:Users,value:stats.registrations},
    {key:'admitted',name:'Допущены',icon:CheckCircle2,value:stats.admitted},
    {key:'remaining',name:'Классы без результатов',icon:ClipboardCheck,value:stats.remaining},
    {key:'entered',name:'Результаты',icon:Trophy,value:stats.entered},
   ].map(metric=><div key={metric.key} className="judging-summary-card"><metric.icon size={20}/><strong>{loading?'—':metric.value}</strong><span>{metric.name}</span></div>)}
  </section>
  <section className="judging-context" aria-label="Состояние этапа">
   <div><strong>{stage.name}</strong><p>{stats.awaiting} ожидают инспекцию · {stats.failed} не прошли · {stats.admitted} допущены</p></div>
   {stats.awaiting>0&&<button type="button" className="secondary-button compact" onClick={()=>go('/admin/inspections?stageId='+encodeURIComponent(stageId))}><ShieldAlert size={16}/>Завершить инспекции</button>}
  </section>
  {notice&&<div className="notice judging-notice" role="status"><CheckCircle2 size={16}/>{notice}</div>}
  {error&&<ErrorPanel message={error} retry={load}/>}
  {editor!==null?<ResultEditor value={editor} saving={saving} error={editorError}
    registrations={registrations} results={results} enumLabel={enumLabel}
    displayCarName={displayCarName} onClose={closeEditor} onSubmit={save}/>:
   detail?<EntityDetailModal inline title="Результат" item={detail}
    columns={[{key:'registrationClass.class.name',label:'Класс'},{key:'registrationClass.class.unit',label:'Единица'},
     {key:'registration.participant.lastName',label:'Фамилия'},{key:'registration.participant.firstName',label:'Имя'},
     {key:'registration.participantNumber',label:'Номер участника'},{key:'registration.car.brand',label:'Марка'},
     {key:'registration.car.model',label:'Модель'},{key:'value',label:'Результат'},
     {key:'place',label:'Место'},{key:'notes',label:'Комментарий'}]}
    onClose={()=>setDetail(null)}
    onEdit={user.role==='ADMIN'&&!detail.isHistorical?()=>{
     setDetail(null);setEditor({id:detail.id,value:Number(detail.value),place:detail.place??'',notes:detail.notes??''});
    }:undefined}/>:
   <>
    <div className="judging-toolbar" role="search" aria-label="Поиск результата">
     <label className="judging-search"><Search size={17} aria-hidden="true"/>
      <input aria-label="Поиск результата" type="search" value={search}
       onChange={e=>setSearch(e.target.value)} placeholder="№, ФИО, госномер, класс или команда"/>
     </label>
     <select className="filter-select" aria-label="Фильтр результатов по классу" value={classFilter}
      onChange={e=>setClassFilter(e.target.value)}>
      <option value="ALL">Все классы</option>
      {classes.map((c:any)=><option key={c.id} value={c.id}>{c.direction?.name?c.direction.name+' · ':''}{c.name}</option>)}
     </select>
     <button className="primary-button compact" type="button" disabled={loading||!canCreate} onClick={()=>{
      setEditor({});setEditorError('');setDetail(null);
     }}><Plus size={15}/>Внести результат</button>
     <button className="secondary-button compact" type="button" disabled={loading} onClick={()=>void load()}>
      <RefreshCw size={15}/>Обновить</button>
    </div>
    <p className="judging-quick-help" role="status" aria-live="polite">
     Показано {filteredResults.length} из {results.length} результатов.
     {!canCreate&&!loading?' Для нового измерения требуется допуск и класс без внесённого результата.':''}
    </p>
    <div className="panel table-wrap judging-results" aria-busy={loading}>
     {loading?<LoadingPage small/>:!filteredResults.length?
      <Empty text={results.length?'По запросу результаты не найдены':'Измерения пока не внесены'}/>:
      <table className="data-table judging-results-table" aria-label="Протокол результатов этапа">
       <thead><tr><th>Класс</th><th>Участник</th><th>Автомобиль</th><th>Результат</th><th>Место</th><th>Статус</th><th>Действия</th></tr></thead>
       <tbody>{Object.values(filteredResults.reduce((groups:Record<string,{name:string;sort:number;rows:any[]}>,r:any)=>{
        const direction=r.registrationClass?.class?.direction??{};
        const key=String(direction.id??'none');
        if(!groups[key])groups[key]={name:direction.name??'Без направления',sort:direction.sortOrder??999,rows:[]};
        groups[key].rows.push(r);return groups;
       },{})).sort((a:any,b:any)=>a.sort-b.sort||a.name.localeCompare(b.name,'ru')).flatMap((group:any)=>[
        <tr key={'direction-'+group.name} className="results-direction-row"><td colSpan={7}><strong>{group.name}</strong><span>{group.rows.length} результатов</span></td></tr>,
        ...group.rows.map((row:any)=><tr key={row.id} className="clickable-row" onClick={()=>setDetail(row)}>
         <td data-label="Класс">{row.registrationClass?.class?.name||'—'}</td>
         <td data-label="Участник"><strong>{participantName(row.registration?.participant)}</strong>
          <small className="table-sub">№{judgingNumbers(row.registration??{})[0]??row.registration?.participantNumber??'—'}</small></td>
         <td data-label="Авто">{displayCarName(row.registration?.car)||'—'}</td>
         <td data-label="Результат"><strong>{row.value}</strong>{row.registrationClass?.class?.unit&&
          <small className="table-sub">{enumLabel(row.registrationClass.class.unit)}</small>}</td>
         <td data-label="Место">{row.place??'—'}</td>
         <td data-label="Статус">{row.isHistorical?<span className="badge">Исторический</span>:
          <span className="badge good">Официальный</span>}</td>
         <td data-label="Действия" className="row-actions" onClick={e=>e.stopPropagation()}>
          {user.role==='ADMIN'&&!row.isHistorical&&<>
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
   </>}
 </>;
}

function ResultEditor({value,registrations,results,saving,error,onClose,onSubmit,displayCarName,enumLabel}:{
 value:any;registrations:any[];results:any[];saving:boolean;error:string;onClose:()=>void;
 onSubmit:(v:any)=>Promise<void>;displayCarName:(v:any,fallback?:string)=>string;enumLabel:(v:any)=>string;
}){
 const [v,setV]=useState<any>(value??{}),[term,setTerm]=useState('');
 const eligible=filterJudgeRegistrations(registrations,term,{passedOnly:true});
 const selected=registrations.find(r=>r.id===v.registrationId);
 const available=remainingJudgingClasses(selected,results).sort((a:any,b:any)=>
  (a.class?.direction?.sortOrder??999)-(b.class?.direction?.sortOrder??999)||
  (a.class?.sortOrder??999)-(b.class?.sortOrder??999)||
  String(a.class?.name??'').localeCompare(String(b.class?.name??''),'ru'));
 const valid=Number.isFinite(Number(v.value))&&v.value!==''&&v.value!==undefined&&
  Number(v.value)>=0&&(v.place===''||v.place===undefined||
  (Number.isInteger(Number(v.place))&&Number(v.place)>=1&&Number(v.place)<=999));
 const editable=!!v.id;
 return <section className="panel resource-editor-page judging-entry-wizard" aria-label="Редактор результата">
  <div className="resource-editor-heading"><div><span className="eyebrow">USD · СУДЕЙСТВО</span>
   <h2>{editable?'Исправление результата':'Новое измерение'}</h2>
   <p>{editable?'Изменить существующий результат может только ADMIN. Исправление фиксируется в аудите.':
    'Выберите допущенного участника по номеру, затем свободный класс и внесите значение.'}</p>
  </div><button type="button" className="secondary-button" onClick={onClose} disabled={saving}><ChevronLeft size={16}/>К протоколу</button></div>
  {error&&<div role="alert" className="form-error"><AlertTriangle size={16}/>{error}</div>}
  <form className="form judging-entry-form" onSubmit={e=>{e.preventDefault();void onSubmit(v)}}>
   {!editable&&<>
    <fieldset className="judging-entry-step" disabled={saving}>
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
      {term?'Допущенных участников по запросу нет.':'Нет зарегистрированных участников с успешной инспекцией.'}
     </p>}
    </fieldset>
    <fieldset className="judging-entry-step" disabled={saving||!selected}>
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
   <fieldset className="judging-entry-step" disabled={saving||(!editable&&(!selected||!available.length))}>
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
   <div className="judging-submit"><p>Измерение сохранится в протоколе этапа. Редактирование и удаление доступны только ADMIN.</p>
    <button className="primary-button" type="submit" disabled={saving||!valid||(!editable&&(!selected||!available.some(c=>c.id===v.registrationClassId)))}>
     <Trophy size={16}/>{saving?'Сохраняем…':editable?'Сохранить исправление':'Сохранить измерение'}
     {!saving&&<ChevronRight size={16}/>}
    </button>
   </div>
  </form>
 </section>;
}

export default ResultsPage;
