import {useEffect,useMemo,useState} from 'react';
import {apiGet,listData} from '../api';

type Candidate={id:string;lastName:string;firstName:string;middleName?:string|null;birthDate?:string|null};
type Snapshot={id:string;name:string;linkedUserId:string|null;birthDate:string|null;cars:Array<{id:string}>;registrations:Array<{id:string}>};
type Conflict={code:string;description:string};
type Preview={
 state:'DRY_RUN_ONLY';canMerge:false;source:Snapshot;target:Snapshot;
 conflicts:Conflict[];
 counts:{source:Record<string,number>;target:Record<string,number>};
 constraints:string[];
};
const fullName=(item:Candidate)=>[item.lastName,item.firstName,item.middleName].filter(Boolean).join(' ');
function PersonPicker({label,candidates,value,onChange}:{label:string;candidates:Candidate[];value:string;onChange:(id:string)=>void}){
 const [query,setQuery]=useState(''),[active,setActive]=useState(false);
 const selected=candidates.find(candidate=>candidate.id===value);
 const matches=useMemo(()=>{
  const term=query.trim().toLocaleLowerCase('ru');
  if(term.length<2)return [];
  return candidates.filter(item=>(fullName(item)+' '+item.id).toLocaleLowerCase('ru').includes(term)).slice(0,9);
 },[candidates,query]);
 return <div className="duplicate-choose-profile">
  <label>{label}
   <input type="search" value={active?query:selected?fullName(selected)+' · '+selected.id.slice(0,8):query}
    placeholder="Введите фамилию или имя…" autoComplete="off"
    onFocus={()=>{setActive(true);if(selected)setQuery('')}}
    onChange={e=>{setActive(true);setQuery(e.target.value);onChange('')}}
    onBlur={()=>setActive(false)}/>
  </label>
  {active&&matches.length>0&&<ul role="listbox" aria-label={label}>{matches.map(candidate=><li key={candidate.id} role="option" aria-selected={candidate.id===value}><button type="button"
   onPointerDown={event=>event.preventDefault()}
   onMouseDown={event=>event.preventDefault()}
   onClick={()=>{onChange(candidate.id);setQuery(fullName(candidate)+' · '+candidate.id.slice(0,8));setActive(false)}}>
   {fullName(candidate)} <small>· {candidate.id.slice(0,8)} · {candidate.birthDate?new Date(candidate.birthDate).toLocaleDateString('ru-RU'):''}</small>
   </button></li>)}</ul>}
  {selected&&<small className="duplicate-selection">Выбран профиль {selected.id}</small>}
 </div>;
}
const countNames:Record<string,string>={cars:'Автомобили',configurations:'Конфигурации',registrations:'Регистрации',classes:'Классы',results:'Результаты',registrationNumbers:'Номера',inspections:'Инспекции',records:'Рекорды',disqualifications:'Дисквалификации',pendingClaims:'Заявки на привязку'};
export default function DuplicateProfilesPreview(){
 const [people,setPeople]=useState<Candidate[]>([]),[sourceId,setSourceId]=useState(''),[targetId,setTargetId]=useState('');
 const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let active=true;apiGet<any>('/admin/participants').then(data=>{if(active)setPeople(listData(data))}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Не удалось загрузить участников')});return()=>{active=false}},[]);
 const inspect=async()=>{if(!sourceId||!targetId||sourceId===targetId)return;setBusy(true);setError('');setPreview(null);
  try{const data=await apiGet<Preview>('/admin/profile-links/duplicates/preview?sourceId='+encodeURIComponent(sourceId)+'&targetId='+encodeURIComponent(targetId));setPreview(data)}
  catch(e){setError(e instanceof Error?e.message:'Не удалось проверить дубли')}finally{setBusy(false)}
 };
 return <section className="duplicate-profile-preview" aria-labelledby="duplicate-preview-title">
  <h2 id="duplicate-preview-title">Проверка дублирующихся профилей</h2>
  <p>Безопасный предпросмотр различий перед объединением. Выберите, какой профиль потенциально переносится и какой должен остаться.</p>
  <div className="duplicate-choose-row">
   <PersonPicker label="Перенести из профиля" candidates={people} value={sourceId} onChange={id=>{setSourceId(id);setPreview(null)}}/>
   <PersonPicker label="Оставить основным" candidates={people} value={targetId} onChange={id=>{setTargetId(id);setPreview(null)}}/>
  </div>
  <button type="button" className="secondary-button" disabled={busy||!sourceId||!targetId||sourceId===targetId} onClick={()=>void inspect()}>{busy?'Проверяем…':'Проверить конфликты и историю'}</button>
  {error&&<p role="alert" className="form-error">{error}</p>}
  {preview&&<div className="duplicate-preview-result">
   <p className="duplicate-preview-warning"><strong>Только предпросмотр.</strong> Никакие профили не объединены. Автоматическое слияние отключено до подтверждения всех требований безопасности и сохранения истории.</p>
   <div className="duplicate-preview-metrics"><div><h3>{preview.source.name} <small>источник</small></h3>{Object.entries(preview.counts.source).map(([key,count])=><p key={key}><span>{countNames[key]||key}</span><strong>{count}</strong></p>)}</div>
   <div><h3>{preview.target.name} <small>основной</small></h3>{Object.entries(preview.counts.target).map(([key,count])=><p key={key}><span>{countNames[key]||key}</span><strong>{count}</strong></p>)}</div></div>
   <h3>Конфликты: {preview.conflicts.length}</h3>
   {preview.conflicts.length?<ul>{preview.conflicts.map(item=><li key={item.code}>{item.description}</li>)}</ul>:<p>Явных конфликтов не обнаружено. Это не является разрешением на объединение.</p>}
   {preview.constraints.map(note=><p key={note} className="duplicate-preview-note">{note}</p>)}
  </div>}
 </section>;
}
