import {AdminEntityLink} from './AdminEntityLink';
import {useEffect,useId,useMemo,useRef,useState} from 'react';
import {apiGet,apiPost,listData} from '../api';

type Candidate={id:string;lastName:string;firstName:string;middleName?:string|null;birthDate?:string|null};
type Snapshot={id:string;name:string;linkedUserId:string|null;birthDate:string|null;cars:Array<{id:string}>;registrations:Array<{id:string}>};
type Conflict={code:string;description:string};
type Readiness={state:'READ_ONLY';canMergeNow:boolean;conflicts:Conflict[]};
type Preview={
 state:'DRY_RUN_ONLY';canMerge:false;source:Snapshot;target:Snapshot;
 conflicts:Conflict[];
 counts:{source:Record<string,number>;target:Record<string,number>};
 constraints:string[];
};
const fullName=(item:Candidate)=>[item.lastName,item.firstName,item.middleName].filter(Boolean).join(' ');
function PersonPicker({label,candidates,value,onChange,disabled=false}:{label:string;candidates:Candidate[];value:string;onChange:(id:string)=>void;disabled?:boolean}){
 const [query,setQuery]=useState(''),[active,setActive]=useState(false);
 const listId=useId();
 const selected=candidates.find(candidate=>candidate.id===value);
 const matches=useMemo(()=>{
  const term=query.trim().toLocaleLowerCase('ru');
  if(term.length<2)return [];
  return candidates.filter(item=>(fullName(item)+' '+item.id).toLocaleLowerCase('ru').includes(term)).slice(0,9);
 },[candidates,query]);
 return <div className="duplicate-choose-profile" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setActive(false)}}>
  <label>{label}
   <input type="search" value={active?query:selected?fullName(selected)+' · '+selected.id.slice(0,8):query}
    placeholder="Введите фамилию или имя…" autoComplete="off" disabled={disabled} role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-controls={listId} aria-expanded={active&&matches.length>0}
    onFocus={()=>{setActive(true);if(selected)setQuery('')}}
    onChange={e=>{setActive(true);setQuery(e.target.value);onChange('')}}/>
  </label>
  <ul id={listId} role="listbox" aria-label={label} hidden={!active||matches.length===0}>{matches.map(candidate=><li key={candidate.id} role="option" aria-selected={candidate.id===value}><button type="button"
   onPointerDown={event=>event.preventDefault()}
   onMouseDown={event=>event.preventDefault()}
   disabled={disabled} onClick={()=>{if(disabled)return;onChange(candidate.id);setQuery(fullName(candidate)+' · '+candidate.id.slice(0,8));setActive(false)}}>
   {fullName(candidate)} <small>· {candidate.id.slice(0,8)} · {candidate.birthDate?new Date(candidate.birthDate).toLocaleDateString('ru-RU'):''}</small>
   </button></li>)}</ul>
  {selected&&<small className="duplicate-selection">Выбран профиль {selected.id}</small>}
 </div>;
}
const countNames:Record<string,string>={cars:'Автомобили',configurations:'Конфигурации',configurationVersions:'Версии конфигураций',profilePhotos:'Фото профиля',carPhotos:'Фото машин',mediaUploads:'Завершённые загрузки фото',teamSnapshots:'Зафиксирована команда на инспекции',registrations:'Регистрации',classes:'Классы',results:'Результаты',registrationNumbers:'Номера',inspections:'Инспекции',records:'Рекорды',disqualifications:'Дисквалификации',pendingClaims:'Заявки на привязку'};
export default function DuplicateProfilesPreview(){
 const [people,setPeople]=useState<Candidate[]>([]),[sourceId,setSourceId]=useState(''),[targetId,setTargetId]=useState('');
 const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [confirmation,setConfirmation]=useState(''),[merging,setMerging]=useState(false);
 const [mergeDone,setMergeDone]=useState(''),[mergeBlockers,setMergeBlockers]=useState<Conflict[]>([]);
 const [readiness,setReadiness]=useState<Readiness|null>(null);
 const inspectionRequest=useRef(0);
 useEffect(()=>{let active=true;apiGet<any>('/admin/participants').then(data=>{if(active)setPeople(listData(data))}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить участников')});return()=>{active=false;inspectionRequest.current++}},[]);
 const changePair=(side:'source'|'target',id:string)=>{
  if(merging)return;
  inspectionRequest.current++;
  if(side==='source')setSourceId(id);else setTargetId(id);
  setPreview(null);setReadiness(null);setConfirmation('');setMergeDone('');setMergeBlockers([]);
  setBusy(false);setError('');
 };
 const inspect=async()=>{
  if(!sourceId||!targetId||sourceId===targetId||merging)return;
  const request=++inspectionRequest.current;
  const selectedSource=sourceId,selectedTarget=targetId;
  setBusy(true);setError('');setPreview(null);setReadiness(null);setConfirmation('');setMergeDone('');setMergeBlockers([]);
  try{
   const query='?sourceId='+encodeURIComponent(selectedSource)+'&targetId='+encodeURIComponent(selectedTarget);
   const [data,safety]=await Promise.all([
    apiGet<Preview>('/admin/profile-links/duplicates/preview'+query),
    apiGet<Readiness>('/admin/profile-links/duplicates/readiness'+query),
   ]);
   // Malformed or outdated server responses must not unlock an irreversible action.
   if(!data?.source||!data?.target||data.source.id!==selectedSource||data.target.id!==selectedTarget||
      !data.counts?.source||!data.counts?.target||!Array.isArray(data.conflicts)||!Array.isArray(data.constraints)||
      !safety||typeof safety.canMergeNow!=='boolean'||!Array.isArray(safety.conflicts))
    throw new Error('Некорректный ответ проверки. Объединение недоступно.');
   if(request===inspectionRequest.current){setPreview(data);setReadiness(safety)}
  }catch(e){
   if(request===inspectionRequest.current)setError(e instanceof Error?e.message:'Не удалось проверить дубли');
  }finally{if(request===inspectionRequest.current)setBusy(false)}
 };

 const merge=async()=>{
  if(!preview||!readiness?.canMergeNow||merging||preview.conflicts.length||confirmation!==preview.source.id.slice(0,8))return;
  setMerging(true);setError('');setMergeBlockers([]);setMergeDone('');
  try{
   const result=await apiPost<{success:boolean;sourceId:string;targetId:string}>('/admin/profile-links/duplicates/merge',{
    sourceId:preview.source.id,targetId:preview.target.id,confirmation,
   });
   setMergeDone('Профили успешно объединены. Старый USD ID и публичные ссылки сохранены. Основной профиль: '+result.targetId.slice(0,8)+'.');
   setPreview(null);setReadiness(null);setConfirmation('');setSourceId('');setTargetId('');
   // A failed list refresh must never turn a successful irreversible merge into a false failure.
   try{
    const peopleResponse=await apiGet<any>('/admin/participants');
    setPeople(listData(peopleResponse));
   }catch{setError('Профили объединены, но список не обновился. Обновите страницу.');}
  }catch(e){
   const error=e as Error & {responseBody?:{conflicts?:Conflict[]}};
   setMergeBlockers(Array.isArray(error.responseBody?.conflicts)?error.responseBody.conflicts:[]);
   setError(error instanceof Error?error.message:'Объединение не выполнено');
  }finally{setMerging(false)}
 };
 return <section className="duplicate-profile-preview" aria-labelledby="duplicate-preview-title">
  <h2 id="duplicate-preview-title">Проверка дублирующихся профилей</h2>
  <p>Безопасный предпросмотр различий перед объединением. Выберите, какой профиль потенциально переносится и какой должен остаться.</p>
  <div className="duplicate-choose-row">
   <PersonPicker label="Перенести из профиля" candidates={people} value={sourceId} disabled={merging} onChange={id=>changePair('source',id)}/>
   <PersonPicker label="Оставить основным" candidates={people} value={targetId} disabled={merging} onChange={id=>changePair('target',id)}/>
  </div>
  <button type="button" className="secondary-button" disabled={busy||merging||!sourceId||!targetId||sourceId===targetId} onClick={()=>void inspect()}>{busy?'Проверяем…':'Проверить конфликты и историю'}</button>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {mergeBlockers.length>0&&<ul className="duplicate-preview-warning" role="alert">{mergeBlockers.map(row=><li key={row.code}>{row.description}</li>)}</ul>}
  {mergeDone&&<p role="status" className="duplicate-selection">{mergeDone}</p>}
  {preview&&<div className="duplicate-preview-result">
   <p className="duplicate-preview-warning"><strong>Только предпросмотр.</strong> Никакие профили не объединены. Выполнение возможно только после явного подтверждения ADMIN и повторной серверной проверки истории.</p>
   <div className="duplicate-preview-metrics"><div><h3><AdminEntityLink kind="participant" id={preview.source.id}>{preview.source.name}</AdminEntityLink> <small>источник</small></h3>{Object.entries(preview.counts.source).map(([key,count])=><p key={key}><span>{countNames[key]||key}</span><strong>{count}</strong></p>)}</div>
   <div><h3><AdminEntityLink kind="participant" id={preview.target.id}>{preview.target.name}</AdminEntityLink> <small>основной</small></h3>{Object.entries(preview.counts.target).map(([key,count])=><p key={key}><span>{countNames[key]||key}</span><strong>{count}</strong></p>)}</div></div>
   <h3>Конфликты: {preview.conflicts.length}</h3>
   {preview.conflicts.length?<ul>{preview.conflicts.map(item=><li key={item.code}>{item.description}</li>)}</ul>:<p>В базовой истории конфликтов не обнаружено.</p>}
   {readiness&&!readiness.canMergeNow&&<div className="duplicate-preview-warning" role="alert"><strong>Объединение заблокировано дополнительной серверной проверкой:</strong><ul>{readiness.conflicts.map(item=><li key={item.code}>{item.description}</li>)}</ul></div>}
   {preview.constraints.map(note=><p key={note} className="duplicate-preview-note">{note}</p>)}
   {preview.conflicts.length===0&&readiness?.canMergeNow===true&&<div className="duplicate-merge-confirm">
    <h3>Подтверждение объединения ADMIN</h3>
    <p>Действие изменит принадлежность автомобилей, регистраций, инспекций и результатов. Исторические номера, результаты, снимки оборудования, исходный профиль и публичные ссылки останутся сохранены. Операция записывается в аудит; автоматической отмены нет.</p>
    <label>Введите первые 8 символов ID переносимого профиля: <strong>{preview.source.id.slice(0,8)}</strong>
     <input type="text" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={8} value={confirmation} onChange={e=>setConfirmation(e.target.value.trim().toLowerCase())} placeholder="Подтвердите ID" disabled={merging}/>
    </label>
    <button type="button" className="primary-button" disabled={merging||!readiness?.canMergeNow||confirmation!==preview.source.id.slice(0,8)} onClick={()=>void merge()}>{merging?'Объединяем профили…':'Подтвердить атомарное объединение'}</button>
   </div>}
  </div>}
 </section>;
}
