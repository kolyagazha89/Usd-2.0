import {useEffect,useState} from 'react';
import {AlertTriangle,Check,ChevronLeft,Info,Loader2,Pencil,RefreshCw} from 'lucide-react';
import {apiGet,apiPatch,getSiteSettings,updateSiteSettings,listData,type User} from '../api';

function RecordsPage({user,PageFrame,ErrorPanel,LoadingPage,Empty,EntityDetailModal,displayCarName,formatDate}: {user:User;PageFrame:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>;EntityDetailModal:React.ComponentType<any>;displayCarName:(car:any,fallback?:string)=>string;formatDate:(value:string)=>string}){
 const[data,setData]=useState<any[]>([]);
 const[classes,setClasses]=useState<any[]>([]);
 const[settings,setSettings]=useState<any|null>(null);
 const[visibilitySaving,setVisibilitySaving]=useState('');
 const[visibilityError,setVisibilityError]=useState('');
 const[loading,setLoading]=useState(true);
 const[error,setError]=useState('');
 const[detail,setDetail]=useState<any|null>(null);
 const[editRecord,setEditRecord]=useState<any|null>(null);
 const[candidates,setCandidates]=useState<any[]>([]);
 const[selectedResultId,setSelectedResultId]=useState('');
 const[editNotes,setEditNotes]=useState('');
 const[editLoading,setEditLoading]=useState(false);
 const[saving,setSaving]=useState(false);
 const[editError,setEditError]=useState('');
 const load=()=>{setLoading(true);setError('');return Promise.allSettled([apiGet<any>('/records/admin/current'),apiGet<any>('/classes'),getSiteSettings()]).then(([recordsResult,classesResult,settingsResult])=>{if(recordsResult.status!=='fulfilled')throw recordsResult.reason;setData(listData(recordsResult.value).filter((x:any)=>!isExcludedRecordClass(x.class)));if(classesResult.status==='fulfilled')setClasses(listData(classesResult.value));if(settingsResult.status==='fulfilled')setSettings(settingsResult.value?.settings??settingsResult.value??null);else setVisibilityError('Не удалось загрузить настройки показа рекордов.');}).catch(e=>setError(e instanceof Error?e.message:'Ошибка загрузки рекордов')).finally(()=>setLoading(false))};
 useEffect(()=>{void load()},[]);
 const beginEdit=async(record:any)=>{
  setEditRecord(record);setCandidates([]);setSelectedResultId(record.resultId??record.result?.id??'');setEditNotes(record.notes??'');setEditError('');setEditLoading(true);
  try{const rows=listData(await apiGet<any>('/records/admin/candidates?classId='+encodeURIComponent(record.classId??record.class?.id)));setCandidates(rows);if(!rows.some((x:any)=>x.id===(record.resultId??record.result?.id))&&rows[0])setSelectedResultId(rows[0].id);if(!rows.length)setEditError('В этом классе нет подтверждённых результатов, подходящих для рекорда.')}
  catch(e){setEditError(e instanceof Error?e.message:'Не удалось загрузить результаты класса')}
  finally{setEditLoading(false)}
 };
 const saveRecord=async(e:React.FormEvent)=>{
  e.preventDefault();if(!editRecord||!selectedResultId)return;setSaving(true);setEditError('');
  try{await apiPatch('/records/admin/'+encodeURIComponent(editRecord.id)+'/assign',{resultId:selectedResultId,notes:editNotes});setEditRecord(null);setDetail(null);await load()}
  catch(e){setEditError(e instanceof Error?e.message:'Не удалось сохранить рекорд')}
  finally{setSaving(false)}
 };
 const isExcludedRecordClass=(cls:any)=>{const value=[cls?.direction?.name,cls?.code,cls?.name].filter(Boolean).join(' ').toLocaleUpperCase('ru-RU').replace(/\s/g,'').replace(/[_-]/g,'');return value.includes('BASSRACE')};
 const isRecordVisible=(cls:any)=>!isExcludedRecordClass(cls)&&(typeof settings?.catalogs?.recordVisibility?.[cls.id]==='boolean'?settings.catalogs.recordVisibility[cls.id]:true);
 const toggleRecordVisibility=async(cls:any)=>{if(!settings||isExcludedRecordClass(cls))return;const nextVisibility={...(settings.catalogs?.recordVisibility??{}),[cls.id]:!isRecordVisible(cls)};setVisibilitySaving(cls.id);setVisibilityError('');try{const nextSettings=await updateSiteSettings({...settings,catalogs:{...(settings.catalogs??{}),recordVisibility:nextVisibility}});setSettings(nextSettings?.settings??{...settings,catalogs:{...(settings.catalogs??{}),recordVisibility:nextVisibility}});}catch(e){setVisibilityError(e instanceof Error?e.message:'Не удалось сохранить настройки рекордов')}finally{setVisibilitySaving('')}};
 const candidateLabel=(x:any)=>{const p=x.registration?.participant;const stage=x.registration?.stage;const car=x.registration?.car;const carLabel=displayCarName(car);return `${[p?.lastName,p?.firstName,p?.middleName].filter(Boolean).join(' ')||'Участник без имени'} · ${stage?.name??'Этап без названия'} ${stage?.season?.year??''} · ${x.value??'—'} ${x.unit??''}${carLabel?' · '+carLabel:''}`};
 return <PageFrame title="Рекорды" subtitle="Текущие действующие рекорды чемпионата" action={editRecord===null&&!detail?<button className="secondary-button compact" onClick={()=>void load()}><RefreshCw size={14}/>Обновить</button>:undefined}>
  {editRecord ? <section className="panel resource-editor-page"><div className="resource-editor-heading"><div><span className="eyebrow">РЕКОРДЫ · РУЧНАЯ КОРРЕКТИРОВКА</span><h2>Изменить рекорд · {editRecord.class?.name??'Класс'}</h2><p>Назначение рекорда требует выбора фактического результата именно в этом классе. Все изменения сохраняются в журнале.</p></div><button type="button" className="secondary-button" onClick={()=>{if(!saving)setEditRecord(null)}} disabled={saving}><ChevronLeft size={16}/>К списку</button></div><form className="form" onSubmit={saveRecord}>
    <div className="form-intro"><Info size={17}/><span>Выбери фактический результат именно в классе <b>{editRecord.class?.name??'—'}</b>. Результат из 2×2 нельзя назначить рекордом 1×2. Исторические результаты должны быть подтверждены.</span></div>
    {editLoading?<LoadingPage small/>:<label><span className="field-label">Результат, который будет официальным рекордом *</span><select value={selectedResultId} onChange={e=>setSelectedResultId(e.target.value)} required disabled={!candidates.length}><option value="">Выберите результат</option>{candidates.map((x:any)=><option key={x.id} value={x.id}>{candidateLabel(x)}</option>)}</select><small className="field-help">В списке только результаты этого класса, с этапом, участником и фактическим значением.</small></label>}
    <label><span className="field-label">Комментарий к корректировке</span><textarea rows={3} value={editNotes} onChange={e=>setEditNotes(e.target.value)} placeholder="Например: рекорд подтверждён на финале, первое место в классе 1×2"/></label>
    {editError&&<div className="form-error"><AlertTriangle size={16}/>{editError}</div>}
    <div className="resolution-footer"><button type="button" className="secondary-button" onClick={()=>setEditRecord(null)} disabled={saving}>Отмена</button><button className="primary-button" disabled={saving||editLoading||!selectedResultId}>{saving?<><Loader2 className="spin" size={15}/>Сохраняем…</>:<><Check size={15}/>Сохранить рекорд</>}</button></div>
   </form></section> : detail ? <EntityDetailModal inline title="Рекорд" item={detail} columns={[{key:'class.name',label:'Класс'},{key:'class.direction.name',label:'Направление'},{key:'result.registration.participant.lastName',label:'Фамилия'},{key:'result.registration.participant.firstName',label:'Имя'},{key:'result.registration.car.brand',label:'Марка'},{key:'result.registration.car.model',label:'Модель'},{key:'value',label:'Результат'},{key:'unit',label:'Единица'},{key:'stage.name',label:'Этап'},{key:'achievedAt',label:'Дата'}]} onClose={()=>setDetail(null)} extra={user.role==='ADMIN'?<button className="secondary-button" onClick={()=>{setDetail(null);void beginEdit(detail)}}><Pencil size={15}/>Изменить официальный результат</button>:undefined}/> : <>
  {error&&<ErrorPanel message={error} retry={load}/>}
  {user.role==='ADMIN'&&<section className="panel record-visibility-panel"><div className="resource-editor-heading"><div><span className="eyebrow">ПУБЛИЧНАЯ ЧАСТЬ</span><h2>Показывать рекорды по классам</h2><p>Отметь классы, рекорды которых доступны посетителям. Для BassRace официальные рекорды не ведутся.</p></div></div>{visibilityError&&<div className="form-error" role="alert">{visibilityError}</div>}<div className="record-visibility-grid">{classes.filter((cls:any)=>cls.isActive!==false).map((cls:any)=><label key={cls.id} className={'record-visibility-option'+(isExcludedRecordClass(cls)?' is-disabled':'')}><input type="checkbox" checked={isRecordVisible(cls)} disabled={isExcludedRecordClass(cls)||visibilitySaving===cls.id||!settings} onChange={()=>void toggleRecordVisibility(cls)}/><span><strong>{cls.name}</strong><small>{cls.direction?.name||'Направление не указано'}{isExcludedRecordClass(cls)?' · рекорды не ведутся':''}</small></span>{visibilitySaving===cls.id&&<span className="record-visibility-saving">Сохраняем…</span>}</label>)}</div></section>}
  <div className="panel table-wrap">
   {loading?<LoadingPage small/>:data.length?<table className="data-table"><thead><tr><th>Класс</th><th>Участник</th><th>Автомобиль</th><th>Результат</th><th>Ед.</th><th>Этап</th><th>Дата</th>{user.role==='ADMIN'&&<th>Действие</th>}</tr></thead><tbody>
    {data.map((r:any)=>{const p=r.result?.registration?.participant;const car=r.result?.registration?.car;const st=r.stage;const cls=r.class;return <tr key={r.id} className="clickable-row" onClick={()=>setDetail(r)}>
      <td data-label="Класс"><strong>{cls?.name??'—'}</strong>{cls?.direction?.name&&<small className="table-sub">{cls.direction.name}</small>}{r.isManualOverride&&<small className="table-sub">Назначен вручную</small>}</td>
      <td data-label="Участник"><strong>{[p?.lastName,p?.firstName,p?.middleName].filter(Boolean).join(' ')||'—'}</strong>{p?.team&&<small className="table-sub">{p.team}</small>}</td>
      <td data-label="Автомобиль">{displayCarName(car)||'—'}</td>
      <td data-label="Результат"><strong>{r.value??r.result?.value??'—'}</strong></td>
      <td data-label="Ед.">{r.unit??r.result?.unit??'—'}</td>
      <td data-label="Этап">{st?<><strong>№{st.stageNumber} · {st.name}</strong>{st.city&&<small className="table-sub">{st.city}</small>}</>:'—'}</td>
      <td data-label="Дата">{formatDate(r.achievedAt)}</td>
      {user.role==='ADMIN'&&<td data-label="Действие"><button className="secondary-button compact" onClick={e=>{e.stopPropagation();void beginEdit(r)}}><Pencil size={14}/>Изменить</button></td>}
    </tr>})}
   </tbody></table>:<Empty text="Рекордов пока нет"/>}
  </div>
  </>}
 </PageFrame>
}

export default RecordsPage;
