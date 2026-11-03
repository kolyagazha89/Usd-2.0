import {readViewState,useViewState,useListScroll,seasonYears,matchesSeason,stageYear} from './view-state';
import {canOpenWalkInRegistration,filterInspections,summarizeInspections} from './event-ops-model';
import {EventOperationsNavigation} from './EventOperationsNavigation';
import {useEffect,useRef,useState} from 'react';
import jsQR from 'jsqr';
import {parseInspectionQr} from '../participant/usd-id';
import {AlertTriangle,Check,ChevronLeft,ChevronRight,ClipboardCheck,Info,Loader2,Plus,RefreshCw,ScanQrCode,Search,Users,ShieldAlert,Trophy,UserRound,CarFront,CalendarDays,Flag,X} from 'lucide-react';
import {apiGet,apiPatch,apiPost,listData,type User} from '../api';

function isPastStageCalendar(s:any){if(!s)return false;if(s.status==='COMPLETED'||s.status==='CANCELLED')return true;if(!s.date)return false;const d=new Date(s.date),today=new Date();d.setHours(0,0,0,0);today.setHours(0,0,0,0);return d.getTime()<today.getTime()}

function inspectionClassGroups(registration:any){
 const groups=new Map<number,Map<string,any[]>>();
 const entries=(registration?.classes??[]).slice().sort((a:any,b:any)=>{
  const na=Number(a.number?.number??registration.participantNumber??0),nb=Number(b.number?.number??registration.participantNumber??0);
  if(na!==nb)return na-nb;
  const da=a.class?.direction??{},db=b.class?.direction??{};
  const directionOrder=Number(da.sortOrder??0)-Number(db.sortOrder??0);
  if(directionOrder)return directionOrder;
  const nameA=String(a.class?.name??a.name??''),nameB=String(b.class?.name??b.name??'');
  const bass=/bass\s*[-_]?\s*race/i.test(String(da.name??'')+' '+nameA)&&/bass\s*[-_]?\s*race/i.test(String(db.name??'')+' '+nameB);
  if(bass){const n=(v:string)=>Number(v.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',','.'))||Number.MAX_SAFE_INTEGER;return n(nameA)-n(nameB)||nameA.localeCompare(nameB,'ru',{numeric:true});}
  return Number(a.class?.sortOrder??0)-Number(b.class?.sortOrder??0)||nameA.localeCompare(nameB,'ru',{numeric:true});
 });
 for(const item of entries){
  const number=Number(item.number?.number??registration.participantNumber??0);
  const direction=String(item.class?.direction?.name??'Без направления');
  if(!groups.has(number))groups.set(number,new Map());
  const directions=groups.get(number)!;
  if(!directions.has(direction))directions.set(direction,[]);
  directions.get(direction)!.push(item);
 }
 return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([number,directions])=>({number,directions:[...directions.entries()].map(([name,items])=>({name,items}))}));
}
function InspectionClassGroups({groups,compact=false}:{groups:any[];compact?:boolean}){
 if(!groups.length)return <span>—</span>;
 return <div className={'inspection-number-class-groups'+(compact?' is-compact':'')}>{groups.map(group=><section className="inspection-number-class-group" key={group.number}><strong className="inspection-number-title">№ {String(group.number||0).padStart(3,'0')}</strong>{group.directions.map((direction:any)=><div className="inspection-class-direction" key={direction.name}><span>{direction.name}</span><b>{direction.items.map((item:any)=>item.class?.name||item.name).join(', ')}</b></div>)}</section>)}</div>;
}
function InspectionRow({registration:r,onOpen,readOnly,displayCarName}:{registration:any;onOpen:()=>void;readOnly:boolean;displayCarName:(car:any,fallback?:string)=>string}){
 const classGroups=inspectionClassGroups(r);
 const inspection=r.inspection??r.stageInspection,status=inspection?.status;
 const numbers=(r.numbers??[]).map((x:any)=>x.number).filter((x:any)=>x!==null&&x!==undefined).join(', ');
 return <tr className="clickable-row" onClick={onOpen} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onOpen()}}} tabIndex={0} aria-label={"Открыть инспекцию: "+[r.participant?.lastName,r.participant?.firstName].filter(Boolean).join(" ")}><td data-label="№"><strong>{numbers||r.participantNumber||'—'}</strong></td><td data-label="Участник"><strong>{[r.participant?.lastName,r.participant?.firstName].filter(Boolean).join(' ')}</strong>{r.participant?.team&&<small className="table-sub">{r.participant.team}</small>}</td><td data-label="Автомобиль"><strong>{displayCarName(r.car)}</strong>{r.configurationSnapshot?.configurationPending===true&&!r.configurationSnapshot?.postStageCompletion?.versionId&&<small className="table-sub">Конфигурация ожидает заполнения</small>}{r.car?.registrationNumber&&<small className="table-sub">{r.car.registrationNumber}</small>}{r.cars?.length>1&&<small className="table-sub">+ ещё {r.cars.length-1} авто</small>}</td><td data-label="Классы"><InspectionClassGroups groups={classGroups} compact/></td><td data-label="Инспекция">{status==='PASSED'?<span className="badge good"><Check size={11}/>Прошёл</span>:status==='FAILED'?<span className="badge bad"><X size={11}/>Не прошёл</span>:<span className="badge">Ожидает</span>}</td><td data-label="Действие" className="row-actions" onClick={e=>e.stopPropagation()}><button type="button" className="secondary-button compact event-ops-open" onClick={onOpen}>{readOnly?'Подробнее':'Открыть'}<ChevronRight size={14}/></button></td></tr>;
}
function InspectionDetailPage({registration:r,user,readOnly,onBack,onSaved,displayCarName}:{registration:any;user:User;readOnly:boolean;onBack:()=>void;onSaved:()=>Promise<void>;displayCarName:(car:any,fallback?:string)=>string}){
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[noteOpen,setNoteOpen]=useState(false),[notes,setNotes]=useState(r.inspection?.notes??'');
 const[confirmChoices,setConfirmChoices]=useState<Array<{id:string;label:string}>>([]),[chosenConfiguration,setChosenConfiguration]=useState(''),[confirmLoading,setConfirmLoading]=useState(false),[confirmBusy,setConfirmBusy]=useState(false);
 const[editClasses,setEditClasses]=useState(false),[stageClasses,setStageClasses]=useState<any[]>([]),[selectedClassIds,setSelectedClassIds]=useState<string[]>([]),[classSelections,setClassSelections]=useState<Record<string,string[]>>({}),[classesLoading,setClassesLoading]=useState(false);
 const canDocumentEquipment=!readOnly||user.role==='ADMIN';
 const inspection=r.inspection??r.stageInspection,status=inspection?.status,canEdit=!readOnly&&(!inspection||(user.role==='ADMIN'||inspection.checkedByUserId===user.id||inspection.createdByUserId===user.id));
 const classes=inspectionClassGroups(r);
 const directionGroups=stageClasses.reduce((groups:Record<string,{id:string;name:string;sortOrder:number;items:any[]}>,item:any)=>{const direction=item.class?.direction??item.direction??{};const key=String(direction.id??direction.name??'Без направления');if(!groups[key])groups[key]={id:key,name:String(direction.name??'Без направления'),sortOrder:Number(direction.sortOrder??0),items:[]};groups[key].items.push(item);return groups;},{});
 const sortedDirectionGroups=Object.values(directionGroups).map(group=>({...group,items:group.items.slice().sort((a:any,b:any)=>Number(a.sortOrder??a.class?.sortOrder??0)-Number(b.sortOrder??b.class?.sortOrder??0)||String(a.customName||a.class?.name||a.name||'').localeCompare(String(b.customName||b.class?.name||b.name||''),'ru',{numeric:true}))})).sort((a,b)=>a.sortOrder-b.sortOrder||a.name.localeCompare(b.name,'ru',{numeric:true}));
 const registrationId=String(r.registrationId??r.id),stageId=String(r.stageId??r.stage?.id??'');
 useEffect(()=>{
   if(!canDocumentEquipment||r.configurationSnapshot?.configurationPending!==true||r.configurationSnapshot?.postStageCompletion?.versionId||!r.car?.id)return;
   let current=true;setConfirmLoading(true);setConfirmChoices([]);
   apiGet<any>('/cars/'+encodeURIComponent(r.car.id)+'/configurations').then(response=>{
     if(!current)return;
     const options=listData(response).flatMap((cfg:any)=>(cfg.versions??[]).filter((v:any)=>v.additionalDescription!=='USD_ON_SITE_DRAFT_PENDING').map((v:any)=>({
       id:v.id,label:(cfg.name||'Конфигурация')+' · версия '+v.version,
     })));
     setConfirmChoices(options);setChosenConfiguration('');
   }).catch(e=>{if(current)setError(e instanceof Error?e.message:'Не удалось загрузить конфигурации автомобиля')})
     .finally(()=>{if(current)setConfirmLoading(false)});
   return()=>{current=false};
 },[canDocumentEquipment,r.car?.id,r.configurationSnapshot?.configurationPending,r.configurationSnapshot?.postStageCompletion?.versionId]);
 const confirmConfiguration=async()=>{
   if(!chosenConfiguration||confirmBusy)return;
   setConfirmBusy(true);setError('');
   try{
     await apiPatch('/registrations/'+encodeURIComponent(registrationId)+'/configuration',{configurationVersionId:chosenConfiguration});
     await onSaved();
   }catch(e){setError(e instanceof Error?e.message:'Не удалось подтвердить конфигурацию')}finally{setConfirmBusy(false)}
 };
 useEffect(()=>{setSelectedClassIds((r.classes??[]).map((item:any)=>String(item.classId??item.class?.id??'')).filter(Boolean))},[r.classes]);
 useEffect(()=>{if(!editClasses||!stageClasses.length)return;const current=(r.classes??[]).reduce((map:Record<string,string[]>,item:any)=>{const direction=item.class?.direction??item.direction??{};const key=String(direction.id??item.class?.directionId??item.directionId??direction.name??'Без направления');const id=String(item.classId??item.class?.id??'');if(id)(map[key]??=[]).push(id);return map;},{});const next:Record<string,string[]>={};for(const group of sortedDirectionGroups){const key=group.id;const selected=(current[key]??[]).filter((id:string)=>group.items.some((item:any)=>String(item.classId??item.class?.id??'')===id));const bass=group.name.toLowerCase().replace(/[\s_-]/g,'').includes('bassrace')||group.items.some((item:any)=>String(item.customName||item.class?.name||item.name||'').toLowerCase().replace(/[\s_-]/g,'').startsWith('bassrace'));next[key]=selected.length?selected:(bass?[]:['']);}setClassSelections(next)},[editClasses,stageClasses]);
 useEffect(()=>{if(!editClasses||!stageId)return;let active=true;setClassesLoading(true);apiGet('/stages/'+encodeURIComponent(stageId)+'/classes').then(result=>{if(active)setStageClasses(listData(result))}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить классы этапа')}).finally(()=>{if(active)setClassesLoading(false)});return()=>{active=false}},[editClasses,stageId]);
 const saveClasses=async()=>{const classIds=[...new Set(Object.values(classSelections).flat().filter(Boolean))];if(!classIds.length){setError('У регистрации должен остаться хотя бы один класс');return}if(classIds.length>5){setError('Можно выбрать не более 5 классов на регистрацию');return}setBusy(true);setError('');try{await apiPatch('/inspections/registration/'+encodeURIComponent(registrationId)+'/classes',{classIds});setSelectedClassIds(classIds);setEditClasses(false);await onSaved()}catch(e){setError(e instanceof Error?e.message:'Не удалось изменить классы')}finally{setBusy(false)}};
 const updateDirectionSelection=(directionId:string,index:number,classId:string)=>{const rows=[...(classSelections[directionId]??[])];rows[index]=classId;const next={...classSelections,[directionId]:rows};setClassSelections(next);setSelectedClassIds([...new Set(Object.values(next).flat().filter(Boolean))])};

 const assignedNumbers=(r.numbers??[]).map((item:any)=>item.number).filter((value:any)=>value!==null&&value!==undefined).sort((a:number,b:number)=>a-b);
 const save=async(nextStatus:'PASSED'|'FAILED')=>{if(nextStatus==='FAILED'&&!notes.trim()){setNoteOpen(true);setError('Для статуса «Не прошёл» укажите причину');return}setBusy(true);setError('');try{if(r.isClassInspection){if(inspection){await apiPatch('/inspections/class/'+inspection.id,{status:nextStatus,notes:notes.trim()||null})}else{await apiPost('/inspections/class',{registrationClassId:r.registrationClassId,status:nextStatus,notes:notes.trim()||undefined})}}else if(inspection){await apiPatch('/inspections/'+inspection.id,{status:nextStatus,notes:notes.trim()||null})}else{await apiPost('/inspections',{registrationId:r.registrationId??r.id,status:nextStatus,notes:notes.trim()||undefined})}await onSaved()}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить инспекцию')}finally{setBusy(false)}};
 return <section className="panel resource-editor-page"><div className="resource-editor-heading"><div><span className="eyebrow">ИНСПЕКЦИЯ АВТОМОБИЛЯ · №{assignedNumbers.length?assignedNumbers.map((number:number)=>String(number).padStart(3,'0')).join(' / '):String(r.participantNumber??'—')}</span><h2>{[r.participant?.lastName,r.participant?.firstName,r.participant?.middleName].filter(Boolean).join(' ')||'Участник не указан'}</h2><p>{(r.cars?.length?r.cars:[r.car].filter(Boolean)).map((car:any)=>displayCarName(car,'Не указано')+(car.registrationNumber?' · '+car.registrationNumber:'')).join('; ')}</p></div><button type="button" className="secondary-button" onClick={onBack}><ChevronLeft size={16}/>Назад к списку</button></div>{r.configurationSnapshot?.configurationPending===true&&!r.configurationSnapshot?.postStageCompletion?.versionId&&<section className="event-ops-pending-config" aria-labelledby="pending-config-title"><div className="notice" role="status"><Info size={16}/><span id="pending-config-title">Заявка создана без списка оборудования. Конфигурацию можно заполнить после этапа и подтвердить здесь или в личном кабинете. Протокол и результат останутся неизменными.</span></div>{canDocumentEquipment&&<div className="event-ops-confirm-config"><label>Подтверждение оборудования<select value={chosenConfiguration} onChange={e=>setChosenConfiguration(e.target.value)} disabled={confirmLoading||confirmBusy}><option value="">{confirmLoading?'Загрузка версий…':'Выберите заполненную конфигурацию'}</option>{confirmChoices.map(choice=><option key={choice.id} value={choice.id}>{choice.label}</option>)}</select></label><button type="button" className="primary-button compact" disabled={!chosenConfiguration||confirmLoading||confirmBusy} onClick={()=>void confirmConfiguration()}>{confirmBusy?'Проверяем…':'Подтвердить конфигурацию'}</button>{!confirmChoices.length&&!confirmLoading&&<p className="field-help">Заполненных конфигураций пока нет. Сначала внесите оборудование в профиль автомобиля.</p>}</div>}</section>}<div className="detail-hero"><div><span className="eyebrow">РЕЗУЛЬТАТ ПРОВЕРКИ</span><h2>{status==='PASSED'?'Автомобиль допущен':status==='FAILED'?'Допуск не пройден':'Инспекция ожидает проверки'}</h2></div><span className={'badge '+(status==='PASSED'?'good':status==='FAILED'?'bad':'')}>{status==='PASSED'?'Прошёл':status==='FAILED'?'Не прошёл':'Ожидает'}</span></div><div className="detail-grid"><div><span>Номер участника</span><strong>{r.participantNumber??'—'}</strong></div><div><span>Команда</span><strong>{typeof r.participant?.team==='string'?r.participant.team:r.participant?.team?.name||'—'}</strong></div><div><span>Автомобиль</span><strong>{displayCarName(r.car)||'—'}</strong></div><div><span>Госномер</span><strong>{[r.car?.registrationCountry,r.car?.registrationNumber].filter(Boolean).join(' · ')||'—'}</strong></div><div><span>Номера на этом автомобиле</span><strong>{assignedNumbers.length?assignedNumbers.map((number:number)=>String(number).padStart(3,'0')).join(', '):r.participantNumber??'—'}</strong></div><div className="inspection-detail-classes"><span>Классы и направления</span>{canEdit&&editClasses? <div className="inspection-class-editor-panel"><p>Выбирай класс через список в нужном направлении. В BassRace можно добавить несколько классов кнопкой. Статус инспекции сохраняется; изменения записываются в историю. Всего не более 5 классов на регистрацию.</p>{classesLoading?<span>Загружаем классы этапа…</span>:sortedDirectionGroups.length?sortedDirectionGroups.map(group=>{const bass=group.name.toLowerCase().replace(/[\s_-]/g,'').includes('bassrace')||group.items.some((item:any)=>String(item.customName||item.class?.name||item.name||'').toLowerCase().replace(/[\s_-]/g,'').startsWith('bassrace'));const available=group.items.filter((item:any)=>item.isActive!==false&&item.class?.isActive!==false);const rows=classSelections[group.id]??(bass?[]:['']);const effectiveRows=rows.length?rows:(bass?[]:['']);const selectedInOtherDirections=new Set(Object.entries(classSelections).filter(([key])=>key!==group.id).flatMap(([,ids])=>ids).filter(Boolean));return <section className="inspection-direction-editor" key={group.id}><div className="inspection-direction-editor-heading"><strong>{group.name}</strong>{bass&&<button type="button" className="secondary-button compact" disabled={busy||!available.length||new Set(Object.values(classSelections).flat().filter(Boolean)).size>=5} onClick={()=>setClassSelections(current=>({...current,[group.id]:[...(current[group.id]??[]),'']}))}><Plus size={14}/>Добавить BassRace</button>}</div>{effectiveRows.map((selectedId,index)=><div className="inspection-class-select-row" key={group.id+'-'+index}><select aria-label={'Класс направления '+group.name} value={selectedId} disabled={busy} onChange={e=>updateDirectionSelection(group.id,index,e.target.value)}><option value="">Выберите класс</option>{group.items.map((item:any)=>{const id=String(item.classId??item.class?.id??'');if(!id)return null;const active=item.isActive!==false&&item.class?.isActive!==false;const name=item.customName||item.class?.name||item.name||'Класс';const alreadyUsed=selectedInOtherDirections.has(id)||effectiveRows.some((otherId:string,otherIndex:number)=>otherIndex!==index&&otherId===id);return <option key={id} value={id} disabled={(!active&&!selectedId)||alreadyUsed}>{name}{!active?' · недоступен':alreadyUsed?' · уже выбран':''}</option>})}</select>{bass&&rows.length>1&&<button type="button" className="secondary-button compact" disabled={busy} onClick={()=>setClassSelections(current=>({...current,[group.id]:(current[group.id]??[]).filter((_,rowIndex)=>rowIndex!==index)}))}>Убрать</button>}</div>)}{!bass&&<small className="inspection-direction-hint">Выбери один класс в этом направлении.</small>}</section>}):<span>Для этапа нет доступных классов.</span>}<div className="detail-actions"><button type="button" className="secondary-button compact" disabled={busy} onClick={()=>{setEditClasses(false);setSelectedClassIds((r.classes??[]).map((item:any)=>String(item.classId??item.class?.id??'')).filter(Boolean));setError('')}}>Отмена</button><button type="button" className="primary-button compact" disabled={busy||classesLoading||!Object.values(classSelections).flat().some(Boolean)||new Set(Object.values(classSelections).flat().filter(Boolean)).size>5} onClick={()=>void saveClasses()}>{busy?'Сохраняем…':'Сохранить классы'}</button></div></div>:<><InspectionClassGroups groups={classes}/>{canEdit&&<div className="inspection-class-editor"><button type="button" className="secondary-button compact" disabled={busy} onClick={()=>{setError('');setEditClasses(true)}}>Изменить классы и направления</button></div>}</>}</div><div><span>Причина / комментарий</span><strong>{inspection?.notes||'—'}</strong></div></div>{error&&<div className="form-error"><AlertTriangle size={16}/><span>{error}</span></div>}{canEdit&&<div className="detail-actions"><button className="primary-button" disabled={busy} onClick={()=>void save('PASSED')}><Check size={16}/>{busy?'Сохраняем…':'Подтвердить: прошёл'}</button><button className="danger-button" disabled={busy} onClick={()=>setNoteOpen(true)}><X size={16}/>Не прошёл</button></div>}{noteOpen&&canEdit&&<div className="inspection-confirm-box"><label>Причина непрохождения<textarea rows={4} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Укажите, что именно не соответствует требованиям" autoFocus/></label><div className="detail-actions"><button className="secondary-button" disabled={busy} onClick={()=>setNoteOpen(false)}>Отмена</button><button className="danger-button" disabled={busy||!notes.trim()} onClick={()=>void save('FAILED')}>{busy?'Сохраняем…':'Подтвердить: не прошёл'}</button></div></div>}{readOnly&&<div className="notice"><ClipboardCheck size={16}/><span>Этап завершён. Изменение инспекции отключено.</span></div>}</section>;
}
export function InspectionsPage({user,go,PageFrame,Empty,LoadingPage,SearchableSelect,displayCarName,enumLabel}:{user:User;go:(path:string)=>void;PageFrame:React.ComponentType<any>;Empty:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;SearchableSelect:React.ComponentType<any>;displayCarName:(car:any,fallback?:string)=>string;enumLabel:(v:any)=>string}){
 const[scanOpen,setScanOpen]=useState(()=>new URLSearchParams(location.search).has('usdId'));
 const initialStageId=(()=>{try{return new URLSearchParams(location.search).get('stageId')??readViewState('inspections:stage','')}catch{return ''}})();
 const[stageId,setStageId]=useViewState('inspections:stage',initialStageId),[stages,setStages]=useState<any[]>([]),[loadingStages,setLoadingStages]=useState(true);
 const isPastStage=isPastStageCalendar;
 const[period,setPeriod]=useViewState<'UPCOMING'|'PAST'>('inspections:period','UPCOMING');
 const[season,setSeason]=useViewState('inspections:season','ALL');
 const visibleStages=stages.filter(s=>matchesSeason(s,season)&&(period==='PAST'?isPastStage(s):!isPastStage(s)));
 useEffect(()=>{apiGet('/stages').then(r=>{const s=listData(r);setStages(s);const requested=s.find((x:any)=>x.id===initialStageId);const requestedPeriod=requested?(isPastStage(requested)?'PAST':'UPCOMING'):period;setPeriod(requestedPeriod);if(requested&&!matchesSeason(requested,season))setSeason(stageYear(requested));const visible=s.filter((x:any)=>matchesSeason(x,season)&&(requestedPeriod==='PAST'?isPastStage(x):!isPastStage(x)));setStageId(requested?.id??visible[0]?.id??'')}).catch(()=>{}).finally(()=>setLoadingStages(false))},[]);
 useEffect(()=>{if(loadingStages)return;const params=new URLSearchParams(location.search);if(stageId)params.set('stageId',stageId);else params.delete('stageId');history.replaceState({},'',location.pathname+'?'+params.toString())},[stageId,loadingStages]);
 return <PageFrame className="event-ops-page" title="Инспекция въезда" subtitle="Проверка зарегистрированных участников перед допуском на этап" action={!scanOpen?<button className="secondary-button compact" onClick={()=>setScanOpen(true)}><ScanQrCode size={15}/>Сканировать QR</button>:undefined}>
  {scanOpen ? <InspectionQrScanner stageId={new URLSearchParams(location.search).has('usdId')?'':stageId} initialUsdId={new URLSearchParams(location.search).get('usdId')??''} onClose={()=>setScanOpen(false)} onScan={(nextStageId,registrationId)=>{setScanOpen(false);go('/admin/inspections?stageId='+encodeURIComponent(nextStageId)+'&registrationId='+encodeURIComponent(registrationId))}}/> : <>
  <div className="toolbar stage-picker">
   <label>Сезон<select aria-label="Сезон инспекций" value={season} onChange={e=>{const next=e.target.value;setSeason(next);const candidates=stages.filter(s=>matchesSeason(s,next)&&(period==='PAST'?isPastStage(s):!isPastStage(s)));setStageId(candidates[0]?.id??'')}}><option value="ALL">Все сезоны</option>{seasonYears(stages).map(year=><option key={year} value={year}>{year}</option>)}</select></label><label>Период<select value={period} onChange={e=>{const next=e.target.value as 'UPCOMING'|'PAST';setPeriod(next);const nextStages=stages.filter(s=>matchesSeason(s,season)&&(next==='PAST'?isPastStage(s):!isPastStage(s)));setStageId(nextStages[0]?.id??'')}}><option value="UPCOMING">Будущие этапы</option><option value="PAST">Прошедшие этапы</option></select></label>
   <label>Этап<select value={stageId} onChange={e=>setStageId(e.target.value)} disabled={loadingStages}><option value="">Выберите этап</option>{visibleStages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}</select></label>
  </div>
  <EventOperationsNavigation current="inspections" stageId={stageId} stageName={stages.find(s=>s.id===stageId)?.name} go={go}/>
  {loadingStages?<LoadingPage small/>:stageId?<EntryInspection key={stageId} stageId={stageId} go={go} user={user} readOnly={period==='PAST'} Empty={Empty} LoadingPage={LoadingPage} SearchableSelect={SearchableSelect} displayCarName={displayCarName} enumLabel={enumLabel}/>:<div className="panel"><Empty text="Выберите этап"/></div>}
  </>}
 </PageFrame>
}
function InspectionQrScanner({onClose,onScan,stageId,initialUsdId}:{onClose:()=>void;onScan:(stageId:string,registrationId:string)=>void;stageId:string;initialUsdId:string}){
 const videoRef=useRef<HTMLVideoElement|null>(null),busyRef=useRef(false);
 const [error,setError]=useState(''),[manual,setManual]=useState(''),[scannerMode,setScannerMode]=useState('');
 const [choices,setChoices]=useState<any[]>([]),[resolving,setResolving]=useState(false);
 const parse=async(raw:string):Promise<boolean>=>{
  if(busyRef.current)return false;
  busyRef.current=true;setResolving(true);
  try{
   const qr=parseInspectionQr(raw,window.location.origin);
   if(qr.kind==='registration'){setError('');onScan(qr.stageId,qr.registrationId);return true}
   const suffix=stageId?'?stageId='+encodeURIComponent(stageId):'';
   const response=await apiGet<any>('/inspections/usd-id/'+encodeURIComponent(qr.token)+suffix);
   const registrations=Array.isArray(response?.registrations)?response.registrations:[];
   if(!registrations.length)throw new Error(stageId?'У участника нет активной регистрации на выбранный этап. Выберите другой этап или зарегистрируйте участника.':'У участника нет активных регистраций.');
   setError('');
   if(registrations.length===1){onScan(registrations[0].stageId,registrations[0].id);return true}
   setChoices(registrations);return true;
  }catch(e){setError(e instanceof Error?e.message:'Не удалось прочитать QR-код');return false}
  finally{busyRef.current=false;setResolving(false)}
 };
 useEffect(()=>{if(initialUsdId)void parse(window.location.origin+'/usd-id/'+initialUsdId)},[initialUsdId]);
 useEffect(()=>{let active=true,stream:MediaStream|null=null,frame=0,timeout=0;const start=async()=>{
  if(!navigator.mediaDevices?.getUserMedia){setError('Камера недоступна. Откройте страницу по HTTPS или вставьте ссылку из QR-кода ниже.');return}
  try{
   stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
   if(!active){stream.getTracks().forEach(track=>track.stop());return}
   const video=videoRef.current;if(!video)return;video.srcObject=stream;await video.play();
   const Detector=(window as any).BarcodeDetector;let detector:any=null;
   if(typeof Detector==='function'){try{detector=new Detector({formats:['qr_code']})}catch{detector=null}}
   setScannerMode(detector?'Встроенное распознавание QR':'Совместимое распознавание QR для этого браузера');
   const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true});
   if(!context){setError('Не удалось подготовить распознавание QR. Вставьте ссылку ниже.');return}
   let scan:()=>Promise<void>=async()=>{};
   const schedule=()=>{if(!active)return;if(detector)frame=requestAnimationFrame(()=>void scan());else timeout=window.setTimeout(()=>void scan(),180)};
   scan=async()=>{if(!active)return;if(video.readyState>=2){
    let raw='';
    if(detector){try{const found=await detector.detect(video);raw=found?.[0]?.rawValue||''}catch{detector=null;setScannerMode('Совместимое распознавание QR для этого браузера')}}
    if(!detector&&!raw){const width=Math.min(video.videoWidth||0,1280),height=width&&video.videoWidth?Math.max(1,Math.round(width*video.videoHeight/video.videoWidth)):0;if(width&&height){canvas.width=width;canvas.height=height;context.drawImage(video,0,0,width,height);try{raw=jsQR(context.getImageData(0,0,width,height).data,width,height,{inversionAttempts:'attemptBoth'})?.data||''}catch{raw=''}}}
    if(raw&&await parse(raw))return;
   }schedule()};
   void scan();
  }catch{setError('Не удалось включить камеру. Проверьте разрешение браузера или вставьте ссылку вручную.')}
 };void start();return()=>{active=false;if(frame)cancelAnimationFrame(frame);if(timeout)window.clearTimeout(timeout);stream?.getTracks().forEach(track=>track.stop())}},[stageId]);
 return <section className="panel resource-editor-page qr-scanner-page"><div className="resource-editor-heading"><div><span className="eyebrow">ИНСПЕКЦИЯ · QR</span><h2>USD ID или QR регистрации</h2></div><button type="button" className="secondary-button" onClick={onClose}><ChevronLeft size={16}/>Назад к инспекциям</button></div><div className="qr-scanner-modal">
  {error&&<div className="notice" role="alert"><AlertTriangle size={16}/><span>{error}</span></div>}
  {choices.length>0?<div className="panel"><h3>Выберите регистрацию</h3><p>Участник зарегистрирован на нескольких автомобилях или этапах.</p>{choices.map((row:any)=><button key={row.id} type="button" className="secondary-button" style={{display:'flex',width:'100%',justifyContent:'space-between',marginBottom:8}} onClick={()=>onScan(row.stageId,row.id)}><span>{row.stage?.name||'Этап USD'} · {[row.car?.brand,row.car?.model].filter(Boolean).join(' ')}</span><strong>№ {row.participantNumber} · {(row.stageInspection??row.inspection)?.status==='PASSED'?'Допущен':(row.stageInspection??row.inspection)?.status==='FAILED'?'Не допущен':'Ожидает инспекции'}</strong></button>)}</div>:<><div className="qr-camera-viewport"><video ref={videoRef} muted playsInline autoPlay aria-label="Камера для сканирования QR-кода"/><div className="qr-camera-overlay" aria-hidden="true"><div className="qr-camera-target"><span/><span/><span/><span/></div><small>Поместите QR-код внутрь рамки</small></div></div>{scannerMode&&<small className="field-help">{scannerMode}</small>}<p>Постоянный USD ID найдёт регистрацию на выбранный этап. Старый QR регистрации продолжает работать без изменений.</p><form className="form" onSubmit={e=>{e.preventDefault();void parse(manual)}}><label>Или вставьте ссылку из QR-кода<input value={manual} onChange={e=>setManual(e.target.value)} placeholder="https://app.usd-russia.ru/usd-id/…" /></label><button className="primary-button" disabled={!manual.trim()||resolving}>{resolving?'Ищем регистрацию…':'Открыть регистрацию'}</button></form></>}
 </div></section>;
}
function EntryInspection({stageId,go,user,readOnly,Empty,LoadingPage,SearchableSelect,displayCarName,enumLabel}:{stageId:string;go:(path:string)=>void;user:User;readOnly:boolean;Empty:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;SearchableSelect:React.ComponentType<any>;displayCarName:(car:any,fallback?:string)=>string;enumLabel:(v:any)=>string}){
 const initialRegistrationId=(()=>{try{return new URLSearchParams(location.search).get('registrationId')??''}catch{return ''}})();
 const[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useViewState('inspections:'+stageId+':search',''),[filter,setFilter]=useViewState<'ALL'|'PASSED'|'FAILED'|'PENDING'|'NOT_PASSED'>('inspections:'+stageId+':status','ALL'),[registerOpen,setRegisterOpen]=useState(()=>!initialRegistrationId&&canOpenWalkInRegistration(location.search,readOnly)),[selectedRegistrationId,setSelectedRegistrationId]=useState(initialRegistrationId),[initialSelectionHandled,setInitialSelectionHandled]=useState(false),[confirmPassAll,setConfirmPassAll]=useState(false),[confirmFailAll,setConfirmFailAll]=useState(false),[failAllReason,setFailAllReason]=useState('');
  const expandInspectionRows=(items:any[])=>items.map((registration:any)=>({
    ...registration,
    id:registration.id,
    registrationId:registration.id,
    registrations:[registration],
    classes:[...(registration.classes??[])],
    numbers:[...(registration.numbers??[])].sort((a:any,b:any)=>Number(a.number)-Number(b.number)),
    cars:registration.car?[registration.car]:[],
    inspection:registration.inspection??registration.stageInspection??null,
    isClassInspection:false,
  }));
  const load=()=>{if(!rows.length)setLoading(true);setError('');return apiGet('/registrations?stageId='+encodeURIComponent(stageId)+'&status=ACTIVE').then(r=>{const items=listData(r);const expanded=expandInspectionRows(items);setRows(expanded);if(initialRegistrationId&&!initialSelectionHandled){const match=expanded.find((x:any)=>x.id===initialRegistrationId||x.registrationId===initialRegistrationId||x.registrations?.some((reg:any)=>reg.id===initialRegistrationId));if(match){setSelectedRegistrationId(match.id);setInitialSelectionHandled(true)}}return expanded}).catch(e=>{setError(e instanceof Error?e.message:'Ошибка загрузки регистраций');return []}).finally(()=>setLoading(false))};
 useEffect(()=>{void load()},[stageId]);
 const {passed,failed,pending}=summarizeInspections(rows);const inspectedCount=passed+failed;
 const selectedFilter=filter==='NOT_PASSED'?'FAILED':filter;
 const filtered=filterInspections(rows,selectedFilter,search);

 const passAll=async()=>{if(!pending)return;setLoading(true);setError('');try{await apiPost('/inspections/stage/'+encodeURIComponent(stageId)+'/pass-pending',{});setConfirmPassAll(false);await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось массово завершить инспекции')}finally{setLoading(false)}};const failAll=async()=>{if(!pending||!failAllReason.trim()){setError('Укажите причину для массового отказа');return}setLoading(true);setError('');try{await apiPost('/inspections/stage/'+encodeURIComponent(stageId)+'/fail-pending',{notes:failAllReason.trim()});setConfirmFailAll(false);setFailAllReason('');await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось массово завершить инспекции')}finally{setLoading(false)}};
 const selectedRegistration=rows.find(r=>r.id===selectedRegistrationId);const backToInspectionList=()=>{setSelectedRegistrationId('');const params=new URLSearchParams(location.search);params.delete('registrationId');history.replaceState({},'',location.pathname+(params.toString()?'?'+params.toString():''))};
 const closeWalkInRegistration=()=>{setRegisterOpen(false);const params=new URLSearchParams(location.search);if(params.has('register')){params.delete('register');history.replaceState({},'',location.pathname+(params.toString()?'?'+params.toString():''))}};
 useListScroll('inspections:'+stageId,!registerOpen&&!selectedRegistration,!loading);
 return registerOpen&&!readOnly ? <InspectionRegistrationModal stageId={stageId} onClose={closeWalkInRegistration} onSaved={async(registrationId:string)=>{closeWalkInRegistration();const updated=await load();if(registrationId&&updated.some((item:any)=>item.id===registrationId)){setSelectedRegistrationId(registrationId);const params=new URLSearchParams(location.search);params.set('registrationId',registrationId);history.replaceState({},'',location.pathname+'?'+params.toString())}}} SearchableSelect={SearchableSelect} displayCarName={displayCarName} LoadingPage={LoadingPage} enumLabel={enumLabel}/> : selectedRegistration ? <InspectionDetailPage registration={selectedRegistration} user={user} readOnly={readOnly} onBack={backToInspectionList} onSaved={async()=>{await load();backToInspectionList()}} displayCarName={displayCarName}/> : <>
  <section className="event-ops-overview" aria-label="Сводка инспекций"><div className="event-ops-intro"><span className="eyebrow">КОНТРОЛЬ ДОПУСКА · USD</span><h2>Инспекция участников</h2><p>Проверка автомобилей, управление допуском и регистрация на месте в одном рабочем пространстве.</p></div></section><div className="inspection-summary event-ops-inspection-metrics" role="group" aria-label="Фильтр инспекций по статусу">
   <button className="inspection-stat" aria-pressed={selectedFilter==='ALL'} onClick={()=>setFilter('ALL')}><strong>{rows.length}</strong><span>зарегистрировано</span></button>
   <button className="inspection-stat good" aria-pressed={selectedFilter==='PASSED'} onClick={()=>setFilter('PASSED')}><strong>{passed}</strong><span>прошли</span></button>
   <button className="inspection-stat bad" aria-pressed={selectedFilter==='FAILED'} onClick={()=>setFilter('FAILED')}><strong>{failed}</strong><span>не прошли</span></button>
   <button className="inspection-stat pending" aria-pressed={selectedFilter==='PENDING'} onClick={()=>setFilter('PENDING')}><strong>{pending}</strong><span>ожидают</span></button>
  </div>
  <div className="event-ops-inspection-progress" aria-label="Готовность допуска"><div><strong>Проверено {inspectedCount} из {rows.length}</strong><span>{pending>0?`Осталось проверить: ${pending}. Итоговый список доступен после завершения инспекции.`:passed>0?"Проверка завершена. Итоговый список допущенных готов к просмотру.":"Ожидаем участников или результаты инспекции."}</span></div><progress value={inspectedCount} max={Math.max(1,rows.length)} aria-label="Доля проверенных участников"/></div>
  <div className="inspection-toolbar event-ops-toolbar"><button type="button" className="secondary-button compact" onClick={()=>go('/admin/registrations?stageId='+encodeURIComponent(stageId))}><Users size={15}/>Регистрации этапа</button>
   <div className="search-box" role="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} aria-label="Поиск участников инспекции" type="search" placeholder="Поиск по №, участнику, автомобилю, госномеру или классу"/>{search&&<button className="event-ops-clear" type="button" onClick={()=>setSearch("")} aria-label="Очистить поиск">Очистить</button>}</div>
   <select className="filter-select" aria-label="Фильтр статуса инспекций" value={selectedFilter} onChange={e=>setFilter(e.target.value as any)}><option value="ALL">Все</option><option value="PENDING">Ожидают</option><option value="PASSED">Прошли</option><option value="FAILED">Не прошли</option></select>
   <button className="secondary-button compact" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/>Обновить</button><button className="secondary-button compact event-ops-export" disabled={loading||pending>0||passed===0} title={pending>0?"Сначала завершите инспекции всех ожидающих участников":passed===0?"Нет участников с допуском":"Показать итоговый список допущенных на экране"} onClick={()=>setFilter("PASSED")}><ClipboardCheck size={15}/>Итоговый список допущенных ({passed})</button>
   {!readOnly&&pending>0&&(confirmPassAll?<span className="inline-confirm-actions"><span>Отметить все ожидающие как прошедшие?</span><button className="primary-button compact" disabled={loading} onClick={()=>void passAll()}>Подтвердить</button><button className="secondary-button compact" disabled={loading} onClick={()=>setConfirmPassAll(false)}>Отмена</button></span>:<button className="primary-button compact" onClick={()=>{setConfirmFailAll(false);setFailAllReason('');setConfirmPassAll(true)}}><Check size={14}/>Прошли все ({pending})</button>)}
   {!readOnly&&<button className="primary-button compact" onClick={()=>setRegisterOpen(true)}><Plus size={14}/>Зарегистрировать участника</button>}
   {!readOnly&&pending>0&&(confirmFailAll?<div className="inspection-bulk-fail"><label>Причина для всех ожидающих инспекций<textarea rows={2} value={failAllReason} onChange={e=>setFailAllReason(e.target.value)} placeholder="Общая причина отказа" required/></label><button className="danger-button compact" disabled={loading||!failAllReason.trim()} onClick={()=>void failAll()}>Подтвердить отказ</button><button className="secondary-button compact" disabled={loading} onClick={()=>{setConfirmFailAll(false);setFailAllReason("")}}>Отмена</button></div>:<button className="danger-button compact" onClick={()=>{setConfirmPassAll(false);setConfirmFailAll(true)}}><X size={14}/>Не прошли все ({pending})</button>)}
   <span className="row-count" role="status" aria-live="polite">{filtered.length} из {rows.length}</span>
  </div>
  {readOnly&&<div className="notice"><ClipboardCheck size={16}/><span>Этап завершён. Инспекции доступны только для просмотра — изменения отключены.</span></div>}
  {error&&<div className="notice"><AlertTriangle size={18}/><span>{error}</span></div>}
  <div className="panel table-wrap event-ops-results" aria-busy={loading}>
   {loading?<LoadingPage small/>:filtered.length?<table className="data-table" aria-label="Очередь инспекции выбранного этапа"><thead><tr><th>№</th><th>Участник</th><th>Автомобиль</th><th>Классы</th><th>Инспекция</th><th>Действие</th></tr></thead><tbody>{filtered.map(r=><InspectionRow key={r.id} registration={r} readOnly={readOnly} displayCarName={displayCarName} onOpen={()=>setSelectedRegistrationId(r.id)}/>)}</tbody></table>:<Empty text={rows.length?'В выбранной очереди ничего не найдено. Измените фильтр или поиск':'На выбранный этап нет активных регистраций'}/>}
  </div>
 </>;
}

function InspectionRegistrationModal({stageId,onClose,onSaved,SearchableSelect,displayCarName,LoadingPage,enumLabel}:{stageId:string;onClose:()=>void;onSaved:(registrationId:string)=>Promise<void>;SearchableSelect:React.ComponentType<any>;displayCarName:(car:any,fallback?:string)=>string;LoadingPage:React.ComponentType<any>;enumLabel:(v:any)=>string}){
 const[participants,setParticipants]=useState<any[]>([]),[cars,setCars]=useState<any[]>([]),[stageClasses,setStageClasses]=useState<any[]>([]);
 const[profileQuery,setProfileQuery]=useState(''),[showAllProfiles,setShowAllProfiles]=useState(false);
 const[showNewProfile,setShowNewProfile]=useState(false),[creatingProfile,setCreatingProfile]=useState(false),[showNewCar,setShowNewCar]=useState(false),[creatingCar,setCreatingCar]=useState(false);
 const[newLastName,setNewLastName]=useState(''),[newFirstName,setNewFirstName]=useState(''),[newMiddleName,setNewMiddleName]=useState('');
 const[newBrand,setNewBrand]=useState(''),[newModel,setNewModel]=useState(''),[newCountry,setNewCountry]=useState('RU'),[newPlate,setNewPlate]=useState('');
 const pendingCreatedCarId=useRef('');
 const[participantId,setParticipantId]=useState(''),[carId,setCarId]=useState(''),[configurationVersionId,setConfigurationVersionId]=useState(''),[classIds,setClassIds]=useState<string[]>([]);
 const[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');const[legalReady,setLegalReady]=useState(false),[legalVersion,setLegalVersion]=useState<string|null>(null),[rulesAccepted,setRulesAccepted]=useState(false),[privacyConsent,setPrivacyConsent]=useState(false),[termsAccepted,setTermsAccepted]=useState(false);
 useEffect(()=>{apiGet<any>('/site-settings/public').then(r=>{const legal=r?.settings?.legal??{};const ready=legal.legalApproved===true&&Boolean(String(legal.legalVersion??'').trim())&&Boolean(String(legal.ipName??'').trim())&&Boolean(String(legal.privacyText??'').trim())&&Boolean(String(legal.consentText??'').trim())&&Boolean(String(legal.termsText??'').trim());setLegalReady(ready);setLegalVersion(ready?String(legal.legalVersion??''):null)}).catch(()=>setLegalReady(false))},[]);
 useEffect(()=>{let cancelled=false;(async()=>{setLoading(true);setError('');try{const[p,sc]=await Promise.all([apiGet<any>('/participants/lookup'),apiGet<any>('/stages/'+encodeURIComponent(stageId)+'/classes')]);if(cancelled)return;setParticipants(listData(p));setStageClasses(listData(sc))}catch(e){if(!cancelled)setError(e instanceof Error?e.message:'Не удалось загрузить справочники')}finally{if(!cancelled)setLoading(false)}})();return()=>{cancelled=true}},[stageId]);
 const normalizedProfileQuery=profileQuery.trim().toLocaleLowerCase('ru');
 const matchingProfiles=participants.filter(p=>[p.lastName,p.firstName,p.middleName,p.team,p.city,p.phone].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(normalizedProfileQuery));
 const visibleProfiles=normalizedProfileQuery||showAllProfiles?matchingProfiles:matchingProfiles.slice(0,6);
 const selectedParticipant=participants.find(p=>p.id===participantId);
 const selectParticipant=(id:string)=>{setParticipantId(id);setClassIds([]);setShowNewProfile(false);setShowNewCar(false)};
 const createNewProfile=async()=>{
  if(creatingProfile)return;
  if(!legalReady||!privacyConsent||!termsAccepted){setError('Перед созданием профиля подтвердите согласия участника и проверьте юридические документы ниже');return}
  if(!newLastName.trim()||!newFirstName.trim()||!newBrand.trim()||!newModel.trim()||!newPlate.trim()){setError('Введите фамилию, имя, марку, модель и госномер автомобиля');return}
  setCreatingProfile(true);setError('');
  try{
   const created=await apiPost<{participantId:string;carId:string}>('/registrations/on-site/profile',{
    lastName:newLastName.trim(),firstName:newFirstName.trim(),middleName:newMiddleName.trim(),
    brand:newBrand.trim(),model:newModel.trim(),registrationCountry:newCountry,registrationNumber:newPlate.trim(),
    privacyConsent,termsAccepted,
   });
   const participant={id:created.participantId,lastName:newLastName.trim(),firstName:newFirstName.trim(),middleName:newMiddleName.trim()};
   pendingCreatedCarId.current=created.carId;
   setParticipants(items=>[...items,participant]);setProfileQuery([participant.lastName,participant.firstName].join(' '));
   selectParticipant(created.participantId);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось создать профиль на въезде')}
  finally{setCreatingProfile(false)}
 };
 const createNewCar=async()=>{
  if(creatingCar||!participantId)return;
  if(!legalReady||!privacyConsent||!termsAccepted){setError('Подтвердите согласия участника перед добавлением автомобиля');return}
  if(!newBrand.trim()||!newModel.trim()||!newPlate.trim()){setError('Введите марку, модель и госномер');return}
  setCreatingCar(true);setError('');
  try{
   const created=await apiPost<{participantId:string;carId:string}>('/registrations/on-site/car',{
    participantId,brand:newBrand.trim(),model:newModel.trim(),
    registrationCountry:newCountry,registrationNumber:newPlate.trim(),privacyConsent,termsAccepted,
   });
   // Persisted successfully: show the car immediately even if the follow-up
   // lookup is temporarily unavailable. Never suggest creating it again.
   const createdCar={id:created.carId,brand:newBrand.trim(),model:newModel.trim(),registrationNumber:newPlate.trim(),configurations:[]};
   setCars(items=>[...items.filter((item:any)=>item.id!==created.carId),createdCar]);
   setCarId(created.carId);setShowNewCar(false);
   try{
    const data=await apiGet<any>('/participants/'+encodeURIComponent(participantId)+'/cars');
    const items=listData(data);if(items.some((item:any)=>item.id===created.carId))setCars(items);
   }catch{setError('Автомобиль сохранён. Повторный запрос списка недоступен — продолжайте регистрацию с выбранной машиной.')}

  }catch(e){setError(e instanceof Error?e.message:'Не удалось добавить автомобиль')}
  finally{setCreatingCar(false)}
 };
 const selectedCar=cars.find(c=>c.id===carId);
 const configurations=(selectedCar?.configurations??[]).flatMap((cfg:any)=>(cfg.versions??[]).filter((v:any)=>v.additionalDescription!=='USD_ON_SITE_DRAFT_PENDING').map((v:any)=>({id:v.id,label:cfg.name+' · v'+v.version,version:v.version,configurationId:cfg.id})));
 useEffect(()=>{if(!participantId){setCars([]);setCarId('');setConfigurationVersionId('');return}let cancelled=false;setCars([]);setCarId('');setConfigurationVersionId('');apiGet<any>('/participants/'+encodeURIComponent(participantId)+'/cars').then(r=>{if(!cancelled){const items=listData(r);setCars(items);if(pendingCreatedCarId.current){const id=pendingCreatedCarId.current;pendingCreatedCarId.current='';if(items.some((car:any)=>car.id===id))setCarId(id)}}}).catch(e=>{if(!cancelled){if(pendingCreatedCarId.current){
  const id=pendingCreatedCarId.current;pendingCreatedCarId.current='';
  setCars([{id,brand:newBrand.trim(),model:newModel.trim(),registrationNumber:newPlate.trim(),configurations:[]}]);setCarId(id);
  setError('Профиль и автомобиль сохранены, но список автомобилей недоступен. Продолжайте регистрацию с выбранным автомобилем.');
 }else setError(e instanceof Error?e.message:'Не удалось загрузить автомобили участника')}});return()=>{cancelled=true}},[participantId]);
 useEffect(()=>{if(!carId){setConfigurationVersionId('');return}const first=(cars.find(c=>c.id===carId)?.configurations??[])[0]?.versions?.[0]?.id??'';setConfigurationVersionId(first)},[carId,cars]);
 const isBassRace=(item:any)=>String(item?.class?.name??item?.name??'').trim().toLowerCase().replace(/[\s_-]/g,'').startsWith('bassrace')||String(item?.class?.direction?.name??item?.direction?.name??'').toLowerCase().replace(/[\s_-]/g,'').includes('bassrace');
 const classDirectionId=(item:any)=>item?.class?.direction?.id??item?.class?.directionId??item?.directionId;
 const selectedDirections=new Set(classIds.map(id=>stageClasses.find((x:any)=>(x.classId??x.class?.id)===id)).filter((item:any)=>item&&!isBassRace(item)).map((item:any)=>classDirectionId(item)));
 const classGroups=Object.values(stageClasses.filter((x:any)=>x.isActive!==false).reduce((acc:Record<string,{name:string;items:any[]}>,item:any)=>{const name=item.class?.direction?.name||'Без направления';if(!acc[name])acc[name]={name,items:[]};acc[name].items.push(item);return acc},{}));
 const toggleClass=(id:string)=>{if(!classIds.includes(id)&&classIds.length>=5){setError('Можно выбрать не более 5 классов на регистрацию');return}setError('');setClassIds(xs=>xs.includes(id)?xs.filter(x=>x!==id):[...xs,id])};
 const submit=async()=>{if(!participantId||!carId||!classIds.length){setError('Выберите участника, автомобиль и классы');return}if(classIds.length>5){setError('Можно выбрать не более 5 классов на регистрацию');return}if(!legalReady){setError('Регистрация временно недоступна: юридические документы не утверждены организатором');return}if(!rulesAccepted||!privacyConsent||!termsAccepted){setError('Подтвердите все обязательные согласия участника');return}setSaving(true);setError('');try{const created=await apiPost<{id:string}>('/registrations',{stageId,participantId,carId,...(configurationVersionId?{configurationVersionId}:{}),classIds,source:'ON_SITE',rulesAccepted,privacyConsent,termsAccepted});await onSaved(typeof created?.id==='string'?created.id:'')}catch(e){setError(e instanceof Error?e.message:'Не удалось зарегистрировать участника')}finally{setSaving(false)}};
 return <section className="panel resource-editor-page"><div className="resource-editor-heading"><div><span className="eyebrow">ВЪЕЗДНАЯ ИНСПЕКЦИЯ · РЕГИСТРАЦИЯ</span><h2>Регистрация участника на этап</h2><p>Найдите участника или создайте профиль прямо на въезде. Конфигурацию оборудования можно дополнить позже.</p></div><button type="button" className="secondary-button" onClick={onClose}><ChevronLeft size={16}/>Назад к инспекциям</button></div>
  {error&&<div className="form-error"><AlertTriangle size={16}/><span>{error}</span></div>}
  {loading?<LoadingPage small/>:<div className="form modal-form">
   <section className="registration-profile-picker" aria-labelledby="registration-profile-title">
    <div className="registration-profile-picker-heading"><div><h3 id="registration-profile-title">Найти участника</h3><p>Проверьте существующий профиль перед регистрацией, чтобы не создавать дубликаты.</p></div><span>{participants.length} в базе</span></div>
    <label className="registration-profile-search">Поиск по ФИО, команде или телефону<input type="search" autoComplete="off" value={profileQuery} onChange={e=>{setProfileQuery(e.target.value);setShowAllProfiles(false)}} placeholder="Начните вводить фамилию или имя…"/></label>
    {selectedParticipant&&<div className="registration-profile-selected" role="status"><Check size={18}/><span>Выбран: <strong>{[selectedParticipant.lastName,selectedParticipant.firstName,selectedParticipant.middleName].filter(Boolean).join(' ')}</strong></span><button type="button" className="secondary-button compact" onClick={()=>selectParticipant('')}>Изменить</button></div>}
    <div className="registration-profile-results" role="group" aria-label="Найденные профили">
     {visibleProfiles.map(p=><button type="button" key={p.id} className={'registration-profile-choice'+(participantId===p.id?' is-selected':'')} aria-pressed={participantId===p.id} onClick={()=>selectParticipant(p.id)}><span className="registration-profile-avatar" aria-hidden="true">{String(p.lastName||p.firstName||'У').slice(0,1).toLocaleUpperCase('ru')}</span><span className="registration-profile-identity"><strong>{[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' ')||'Участник USD'}</strong><small>{[p.city,p.team].filter(Boolean).join(' · ')||'Профиль участника'}</small></span><span className="registration-profile-choice-status">{participantId===p.id?'Выбран':'Выбрать'}</span></button>)}
     {!matchingProfiles.length&&<p className="registration-profile-empty">Совпадений нет. Проверьте написание ФИО или создайте профиль через раздел «Участники».</p>}
    </div>
    {!normalizedProfileQuery&&matchingProfiles.length>6&&<button type="button" className="secondary-button compact registration-profile-more" onClick={()=>setShowAllProfiles(v=>!v)}>{showAllProfiles?'Свернуть список':'Показать все профили ('+matchingProfiles.length+')'}</button>}
    {!selectedParticipant&&<div className="event-ops-newcomer"><p>Участника нет в базе? Создайте профиль и автомобиль, не покидая регистрацию.</p><button type="button" className="secondary-button compact" onClick={()=>{setShowNewProfile(v=>!v);setError('')}} aria-expanded={showNewProfile}><Plus size={16}/>{showNewProfile?'Скрыть форму новичка':'Новый участник на въезде'}</button></div>}
    {showNewProfile&&!selectedParticipant&&<section className="event-ops-newcomer-form" aria-label="Создание нового участника на въезде">
     <div className="event-ops-newcomer-fields">
      <label>Фамилия<input autoComplete="family-name" value={newLastName} onChange={e=>setNewLastName(e.target.value)} maxLength={120} required/></label>
      <label>Имя<input autoComplete="given-name" value={newFirstName} onChange={e=>setNewFirstName(e.target.value)} maxLength={120} required/></label>
      <label>Отчество (необязательно)<input value={newMiddleName} onChange={e=>setNewMiddleName(e.target.value)} maxLength={120}/></label>
      <label>Марка автомобиля<input value={newBrand} onChange={e=>setNewBrand(e.target.value)} maxLength={80} required/></label>
      <label>Модель автомобиля<input value={newModel} onChange={e=>setNewModel(e.target.value)} maxLength={120} required/></label>
      <label>Страна регистрации<select value={newCountry} onChange={e=>setNewCountry(e.target.value)}><option value="RU">Россия</option><option value="BY">Беларусь</option><option value="KZ">Казахстан</option><option value="UA">Украина</option><option value="GE">Грузия</option><option value="OTHER" disabled>Другие страны — добавьте авто через профиль</option></select></label>
      <label>Госномер<input value={newPlate} onChange={e=>setNewPlate(e.target.value)} placeholder="А001УР01" maxLength={32} required/></label>
     </div>
     <p className="field-help">Перед созданием проверьте результаты поиска и подтвердите согласия участника в нижнем блоке. Совпадающий профиль или автомобиль нельзя создавать повторно; заявка и номер оформляются следующим шагом.</p>
     <button type="button" className="primary-button" disabled={creatingProfile||!legalReady||!privacyConsent||!termsAccepted||!newLastName.trim()||!newFirstName.trim()||!newBrand.trim()||!newModel.trim()||!newPlate.trim()} onClick={()=>void createNewProfile()}>{creatingProfile?'Сохраняем профиль…':'Создать профиль и автомобиль'}</button>
    </section>}
   </section>
   <label>Автомобиль<SearchableSelect value={carId} options={cars.map(c=>({id:c.id,label:[c.brand,c.model,c.registrationNumber].filter(Boolean).join(' · ')}))} onChange={(v:string)=>setCarId(v)} required/></label>
   {selectedParticipant&&<div className="event-ops-newcomer"><p>Автомобиля нет в списке? Можно добавить новую машину существующему участнику, не создавая второй профиль.</p><button type="button" className="secondary-button compact" onClick={()=>{setShowNewCar(v=>!v);setError('')}} aria-expanded={showNewCar}><Plus size={16}/>{showNewCar?'Скрыть добавление автомобиля':'Добавить автомобиль на въезде'}</button></div>}
   {showNewCar&&selectedParticipant&&<section className="event-ops-newcomer-form" aria-label="Новый автомобиль существующего участника"><div className="event-ops-newcomer-fields">
    <label>Марка<input value={newBrand} onChange={e=>setNewBrand(e.target.value)} maxLength={80} required/></label>
    <label>Модель<input value={newModel} onChange={e=>setNewModel(e.target.value)} maxLength={120} required/></label>
    <label>Страна<select value={newCountry} onChange={e=>setNewCountry(e.target.value)}><option value="RU">Россия</option><option value="BY">Беларусь</option><option value="KZ">Казахстан</option><option value="UA">Украина</option><option value="GE">Грузия</option></select></label>
    <label>Госномер<input value={newPlate} onChange={e=>setNewPlate(e.target.value)} placeholder="А001УР01" maxLength={32} required/></label>
   </div><p className="field-help">Убедитесь, что выбрали правильный исторический или существующий профиль. Согласия участника подтверждаются ниже.</p><button type="button" className="primary-button" disabled={creatingCar||!legalReady||!privacyConsent||!termsAccepted||!newBrand.trim()||!newModel.trim()||!newPlate.trim()} onClick={()=>void createNewCar()}>{creatingCar?'Сохраняем автомобиль…':'Добавить автомобиль и продолжить'}</button></section>}
   <label>Конфигурация оборудования (можно заполнить позже)<select value={configurationVersionId} onChange={e=>setConfigurationVersionId(e.target.value)} disabled={!carId}><option value="">Пока не заполнена — создать черновик на этапе</option>{configurations.map((cfg:any)=><option key={cfg.id} value={cfg.id}>{cfg.label}</option>)}</select></label>
   {!configurationVersionId&&carId&&<div className="notice" role="status"><Info size={16}/><span>Участник получит номер и попадёт на инспекцию. Точные характеристики аудиосистемы пока не подтверждены, их нужно заполнить позже.</span></div>}
   <div className="config-section"><div className="config-section-head"><div className="config-section-title"><div><strong>Классы этапа</strong><small>Один класс в каждом направлении; в BassRace можно выбрать несколько</small></div></div></div><p className="field-help" role="status">Выбрано классов: {classIds.length} из 5. Для BassRace можно выбрать несколько классов в пределах общего лимита.</p><div className="stage-class-modal-list">{classGroups.map((group:any)=><section key={group.name} className="registration-admin-class-group"><strong>{group.name}</strong>{group.items.map((x:any)=>{const id=x.classId??x.class?.id;const checked=classIds.includes(id);const directionId=x.class?.direction?.id??x.class?.directionId??x.directionId;const disabled=!checked&&(classIds.length>=5||(!isBassRace(x)&&selectedDirections.has(directionId)));return <label key={id} className="checkbox-row"><input type="checkbox" checked={checked} disabled={disabled} onChange={()=>toggleClass(id)}/><span><b>{x.class?.name||x.name}</b><small>{enumLabel(x.class?.unit||x.unit||'DB')}</small></span></label>})}</section>)}</div></div>
   {!legalReady&&<div className="form-error"><AlertTriangle size={16}/>Юридические документы не утверждены. Регистрация на месте временно недоступна.</div>}{legalReady&&<div className="consent-stack"><strong>Подтверждение участника</strong><label className="consent-option"><input type="checkbox" checked={privacyConsent} onChange={e=>setPrivacyConsent(e.target.checked)} required/><span>Подтверждаю, что участник дал согласие на обработку персональных данных и ознакомлен с <a href="/privacy" target="_blank" rel="noreferrer">политикой</a> и <a href="/consent" target="_blank" rel="noreferrer">текстом согласия</a>.</span></label><label className="consent-option"><input type="checkbox" checked={termsAccepted} onChange={e=>setTermsAccepted(e.target.checked)} required/><span>Подтверждаю, что участник принял <a href="/terms" target="_blank" rel="noreferrer">пользовательское соглашение</a>.</span></label><label className="consent-option"><input type="checkbox" checked={rulesAccepted} onChange={e=>setRulesAccepted(e.target.checked)} required/><span>Подтверждаю, что участник ознакомлен с <a href="/rules" target="_blank" rel="noreferrer">регламентом USD</a> и правилами выбранных классов.</span></label><small className="muted">Версия юридических документов: {legalVersion}</small></div>}
   <button type="button" className="primary-button save-button" disabled={saving||loading||!legalReady||!rulesAccepted||!privacyConsent||!termsAccepted} onClick={()=>void submit()}>{saving?<><Loader2 className="spin" size={16}/>Регистрируем…</>:<><Check size={16}/>Зарегистрировать</>}</button>
  </div>}
 </section>
}

export default InspectionsPage;
