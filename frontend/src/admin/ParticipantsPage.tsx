import {useEffect,useState} from 'react';
import {UserRound} from 'lucide-react';
import {getPrivateMediaObjectUrl,releasePrivateMediaUrl} from '../api';
import './participant-workspace.css';
import {AdminEntityLink} from './AdminEntityLink';
import type {User} from '../api';
import {apiGet,apiPatch,apiPost,listData} from '../api';

function textValue(value:any){return value===null||value===undefined||value===''?'—':String(value)}
function equipmentLabel(item:any){return [item?.brand,item?.model].filter(Boolean).join(' ')||item?.name||'Оборудование не указано'}
function ConfigurationSnapshot({snapshot}:{snapshot:any}){
  if(!snapshot||typeof snapshot!=='object'||Object.keys(snapshot).length===0)return <div className="participant-history-missing">Конфигурация на момент выступления не сохранена в архивных данных. Текущая конфигурация вместо неё не подставляется.</div>;
  const groups=[
    {title:'Головные устройства',items:snapshot.headUnits,label:equipmentLabel},
    {title:'Акустические компоненты',items:snapshot.audioComponents,label:(x:any)=>[equipmentLabel(x),x.type,x.direction?'· '+x.direction:'',x.quantity? '× '+x.quantity:''].filter(Boolean).join(' ')},
    {title:'Усилители',items:snapshot.amplifiers,label:(x:any)=>[equipmentLabel(x),x.direction?'· '+x.direction:'',x.quantity?'× '+x.quantity:''].filter(Boolean).join(' ')},
    {title:'Аккумуляторы',items:snapshot.batteries,label:(x:any)=>equipmentLabel(x)+(x.quantity?' × '+x.quantity:'')},
    {title:'Генераторы',items:snapshot.generators,label:(x:any)=>equipmentLabel(x)+(x.quantity?' × '+x.quantity:'')},
  ];
  return <div className="participant-history-config">
    <div className="participant-history-config-meta"><span>Конфигурация: <strong>{textValue(snapshot.configurationName)}</strong></span><span>Версия: <strong>{textValue(snapshot.version)}</strong></span></div>
    {snapshot.vibrationIsolation&&<div className="participant-history-equipment-row"><span>Виброизоляция</span><strong>{snapshot.vibrationIsolation}</strong></div>}
    {groups.map(group=>Array.isArray(group.items)&&group.items.length>0?<div className="participant-history-equipment-group" key={group.title}><h5>{group.title} <span>{group.items.length}</span></h5><ul>{group.items.map((item:any,index:number)=><li key={item.id??index}>{group.label(item)}</li>)}</ul></div>:null)}
    {snapshot.additionalDescription&&<div className="participant-history-description"><span>Дополнительное описание</span><p>{snapshot.additionalDescription}</p></div>}
    {!groups.some(group=>Array.isArray(group.items)&&group.items.length>0)&&!snapshot.vibrationIsolation&&!snapshot.additionalDescription&&<div className="muted">В сохранённом снимке нет подробного перечня оборудования.</div>}
  </div>;
}
function ParticipantPerformanceHistory({history}:{history:any}){
  const [query,setQuery]=useState(''),[page,setPage]=useState(1);
  const registrations=Array.isArray(history?.registrations)?history.registrations:[];
  const filtered=registrations.filter((r:any)=>[r.stage?.name,r.stage?.city,r.stage?.season?.year,r.car?.brand,r.car?.model,r.participantNumber].join(' ').toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  const pages=Math.max(1,Math.ceil(filtered.length/5)),currentPage=Math.min(page,pages);
  return <section className="participant-detail-cars participant-performance-history">
    <div className="eyebrow">ИСТОРИЯ ВЫСТУПЛЕНИЙ УЧАСТНИКА</div>
    <div className="participant-history-summary"><span><strong>{registrations.length}</strong> регистраций</span><span><strong>{history?.statistics?.recordsCount??0}</strong> записей рекордов</span></div>
    <label className="participant-history-search">Найти выступление<input type="search" value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} placeholder="Этап, сезон, автомобиль или номер"/></label>
    {!filtered.length?<div className="muted">{query?'Выступления по запросу не найдены.':'История выступлений пока отсутствует.'}</div>:<div className="participant-history-list">
      {filtered.slice((currentPage-1)*5,currentPage*5).map((registration:any)=>{
        const stage=registration.stage??{},car=registration.car??{},snapshot=registration.configurationSnapshot;
        const results=Array.isArray(registration.results)?registration.results:[];
        const classes=Array.isArray(registration.classes)?registration.classes:[];
        const archived=Boolean(snapshot&&typeof snapshot==='object'&&Object.keys(snapshot).length>0);
        return <details className="participant-history-event" key={registration.id}>
          <summary className="participant-history-event-heading">
            <div><span className="eyebrow">{textValue(stage.season?.year)} · ЭТАП №{textValue(stage.stageNumber)}</span><h4><AdminEntityLink kind="stage" id={stage.id??registration.stageId}>{textValue(stage.name)}</AdminEntityLink></h4><p>{[stage.city,stage.date?new Date(stage.date).toLocaleDateString('ru-RU'):null].filter(Boolean).join(' · ')}</p></div>
            <span className={'participant-history-snapshot-status '+(archived?'is-saved':'is-missing')}>{archived?'Снимок сохранён':'Нет снимка'}</span>
          </summary>
          <div className="participant-history-event-meta">
            <div><span>Автомобиль</span><strong><AdminEntityLink kind="car" id={car.id??registration.carId}>{[car.brand,car.model].filter(Boolean).join(' ')||'Автомобиль не указан'}</AdminEntityLink></strong><small>{[car.registrationCountry,car.registrationNumber,car.color].filter(Boolean).join(' · ')||'Данные автомобиля не указаны'}</small></div>
            <div><span>Статус регистрации</span><strong>{registration.status==='CANCELLED'?'Отменена':'Активна'}</strong><small>№ участника: {textValue(registration.participantNumber)}</small></div>
          </div>
          <div className="participant-history-classes"><h5>Заявленные классы</h5>{classes.length?<div className="participant-history-tags">{classes.map((entry:any,index:number)=><span key={entry.class?.id??index}>{entry.class?.direction?.name?entry.class.direction.name+' · ':''}{entry.class?.name??entry.class?.code??'Класс'}</span>)}</div>:<p className="muted">Классы не найдены в сохранённых данных.</p>}</div>
          {results.length>0&&<div className="participant-history-results"><h5>Результаты</h5><div className="participant-history-result-list">{results.map((result:any,index:number)=><div key={result.id??index}><span>{result.registrationClass?.class?.direction?.name?result.registrationClass.class.direction.name+' · ':''}{result.registrationClass?.class?.name??'Класс'}</span><strong>{textValue(result.value)} {result.unit==='DB'?'дБ':result.unit==='MPS'?'м/с':result.unit??''}</strong><small>{result.place?result.place+' место':''}{result.isBest?' · лучший результат':''}</small></div>)}</div></div>}
          {registration.inspection&&<div className="participant-history-inspection"><span>Техинспекция</span><strong>{registration.inspection.status==='PASSED'?'Пройдена':registration.inspection.status==='FAILED'?'Не пройдена':'—'}</strong>{registration.inspection.notes&&<p>{registration.inspection.notes}</p>}</div>}
          <details className="participant-history-details"><summary>Оборудование на момент выступления</summary><ConfigurationSnapshot snapshot={snapshot}/></details>
        </details>;
      })}
    </div>}
    {pages>1&&<nav className="list-pagination" aria-label="Страницы выступлений"><span>Страница {currentPage} из {pages} · {filtered.length} регистраций</span><button type="button" className="secondary-button compact" disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Назад</button><button type="button" className="secondary-button compact" disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Дальше</button></nav>}
  </section>;
}

export function ParticipantsPage({ResourcePage,displayCarName,user,go}:{user:User;ResourcePage:React.ComponentType<any>;displayCarName:(car:any,fallback?:string)=>string;go:(path:string)=>void}){
  return <ResourcePage title="Участники" subtitle="Профили, команды и история выступлений" path="/admin/participants" columns={[{key:'lastName',label:'Фамилия'},{key:'firstName',label:'Имя'},{key:'city',label:'Город'},{key:'team',label:'Команда'},{key:'email',label:'Email'},{key:'phone',label:'Телефон'},{key:'isPublic',label:'Публичный'}]} fields={[{name:'lastName',label:'Фамилия',required:true},{name:'firstName',label:'Имя',required:true},{name:'middleName',label:'Отчество'},{name:'city',label:'Город'},{name:'team',label:'Команда',optionsPath:'/participants/teams',optionLabel:(x:any)=>x.name},{name:'phone',label:'Телефон'},{name:'birthDate',label:'Дата рождения',type:'date'},{name:'isPublic',label:'Показывать профиль публично',type:'checkbox'}]} create={(v:any)=>apiPost('/participants',v)} update={(id:string,v:any)=>apiPatch('/participants/'+id,v)} permanentDeleteKind={user.role==='ADMIN'?'participant':undefined} searchPlaceholder="ФИО, город, команда" showStatusFilter={false}
    detailLoader={async(row:any)=>{const [carsResult,historyResult]=await Promise.allSettled([apiGet<any>('/participants/'+row.id+'/cars'),apiGet<any>('/history/participant/'+row.id)]);const cars=carsResult.status==='fulfilled'?listData(carsResult.value):[];const history=historyResult.status==='fulfilled'?historyResult.value:null;return {...row,cars,carsError:carsResult.status==='rejected'?'Не удалось загрузить автомобили. Нажмите «Обновить».':'',performanceHistory:history,performanceHistoryError:historyResult.status==='rejected'?(historyResult.reason instanceof Error?historyResult.reason.message:'Не удалось загрузить историю выступлений'):''}}}
    detailContent={(item:any)=><ParticipantWorkspace key={item.id} item={item} displayCarName={displayCarName} go={go}/>}
  />;
}
export default ParticipantsPage;

export function AdminProfilePhoto({item,car=false}:{item:any;car?:boolean}){
 const [url,setUrl]=useState(''),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  setUrl('');setFailed(false);
  if(!item.photoUrl)return;
  let active=true,current='';
  getPrivateMediaObjectUrl(car?'CAR_PHOTO':'PARTICIPANT_PHOTO',item.id).then(value=>{
   if(!active){releasePrivateMediaUrl(value);return}current=value;setUrl(value);
  }).catch(()=>{if(active)setFailed(true)});
  return()=>{active=false;if(current)releasePrivateMediaUrl(current)};
 },[item.id,item.photoUrl,car,attempt]);
 return <div className={'admin-profile-photo '+(car?'is-car':'')}>
  {url&&!failed?<img src={url} alt={car?'Фото автомобиля':'Фото участника'} onError={()=>setFailed(true)}/>:<><UserRound size={28} aria-hidden="true"/><span>{failed?'Фото не загрузилось':item.photoUrl?'Загрузка фото…':'Фото не добавлено'}</span>{failed&&<button type="button" className="text-button" onClick={()=>setAttempt(x=>x+1)}>Повторить</button>}</>}
 </div>;
}

export function ParticipantWorkspace({item,displayCarName,go}:{item:any;displayCarName:(car:any)=>string;go:(path:string)=>void}){
 const [tab,setTab]=useState('profile');
 const cars=Array.isArray(item.cars)?item.cars:[];
 const tabs=[{id:'profile',label:'Профиль'},{id:'cars',label:'Автомобили · '+(item._count?.cars??cars.length)},{id:'history',label:'Выступления · '+(item.performanceHistory?.registrations?.length??item._count?.registrations??0)}];
 const fields=[['Город',item.city],['Команда',item.team],['Телефон',item.phone],['Дата рождения',item.birthDate?new Date(item.birthDate).toLocaleDateString('ru-RU'):null],['Email',item.email],['Публичный профиль',item.isPublic?'Да':'Нет']];
 return <div className="participant-workspace">
  <header className="participant-workspace-heading"><AdminProfilePhoto item={item}/><div><h3>{[item.lastName,item.firstName,item.middleName].filter(Boolean).join(' ')}</h3><p>{[item.city,item.team].filter(Boolean).join(' · ')||'Профиль участника USD'}</p></div></header>
  <nav className="participant-workspace-tabs" aria-label="Разделы участника">{tabs.map(t=><button key={t.id} type="button" className={'secondary-button compact '+(tab===t.id?'active':'')} aria-pressed={tab===t.id} aria-controls={'participant-section-'+item.id} onClick={()=>setTab(t.id)}>{t.label}</button>)}</nav>
  <div id={'participant-section-'+item.id}>
   {tab==='profile'&&<><div className="detail-grid">{fields.map(([label,value])=><div key={label}><span>{label}</span><strong>{textValue(value)}</strong></div>)}</div>{item.emailSource&&<p className="muted">{item.emailSource==='ACCOUNT'?'Email привязанного аккаунта':'Архивный email: не подтверждён новым аккаунтом'}</p>}</>}
   {tab==='cars'&&<section><h3>Автомобили участника</h3>{item.carsError?<p role="alert">{item.carsError}</p>:!Array.isArray(item.cars)?<p role="status">Загрузка автомобилей…</p>:cars.length?<div className="participant-car-list">{cars.map((car:any)=><article className="participant-car-item" key={car.id}><AdminProfilePhoto item={car} car/><div><AdminEntityLink kind="car" id={car.id}>{displayCarName(car)}</AdminEntityLink><span>{[car.registrationCountry,car.registrationNumber,car.color].filter(Boolean).join(' · ')}</span>{car.isActive===false&&<span>Скрытый автомобиль</span>}</div><button type="button" className="secondary-button compact" onClick={()=>go('/admin/cars/configurations?carId='+encodeURIComponent(car.id))}>Конфигурации · {car.configurations?.length??0}</button></article>)}</div>:<p className="muted">Автомобилей нет</p>}</section>}
   {tab==='history'&&(item.performanceHistoryError?<p role="alert">Не удалось загрузить историю: {item.performanceHistoryError}</p>:!item.performanceHistory?<p role="status">Загрузка истории…</p>:<ParticipantPerformanceHistory history={item.performanceHistory}/>)}
  </div>
 </div>;
}
