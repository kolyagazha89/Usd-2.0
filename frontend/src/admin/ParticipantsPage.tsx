import {apiDelete,apiGet,apiPatch,apiPost,listData} from '../api';

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
  const registrations=Array.isArray(history?.registrations)?history.registrations:[];
  return <section className="participant-detail-cars participant-performance-history">
    <div className="eyebrow">ИСТОРИЯ ВЫСТУПЛЕНИЙ УЧАСТНИКА</div>
    <div className="participant-history-summary"><span><strong>{registrations.length}</strong> регистраций</span><span><strong>{history?.statistics?.recordsCount??0}</strong> записей рекордов</span></div>
    {!registrations.length?<div className="muted">История выступлений пока отсутствует.</div>:<div className="participant-history-list">
      {registrations.map((registration:any)=>{
        const stage=registration.stage??{},car=registration.car??{},snapshot=registration.configurationSnapshot;
        const results=Array.isArray(registration.results)?registration.results:[];
        const classes=Array.isArray(registration.classes)?registration.classes:[];
        const archived=Boolean(snapshot&&typeof snapshot==='object'&&Object.keys(snapshot).length>0);
        return <article className="participant-history-event" key={registration.id}>
          <div className="participant-history-event-heading">
            <div><span className="eyebrow">{textValue(stage.season?.year)} · ЭТАП №{textValue(stage.stageNumber)}</span><h4>{textValue(stage.name)}</h4><p>{[stage.city,stage.date?new Date(stage.date).toLocaleDateString('ru-RU'):null].filter(Boolean).join(' · ')}</p></div>
            <span className={'participant-history-snapshot-status '+(archived?'is-saved':'is-missing')}>{archived?'Снимок сохранён':'Нет снимка'}</span>
          </div>
          <div className="participant-history-event-meta">
            <div><span>Автомобиль</span><strong>{[car.brand,car.model].filter(Boolean).join(' ')||'Автомобиль не указан'}</strong><small>{[car.registrationCountry,car.registrationNumber,car.color].filter(Boolean).join(' · ')||'Данные автомобиля не указаны'}</small></div>
            <div><span>Статус регистрации</span><strong>{registration.status==='CANCELLED'?'Отменена':'Активна'}</strong><small>№ участника: {textValue(registration.participantNumber)}</small></div>
          </div>
          <div className="participant-history-classes"><h5>Заявленные классы</h5>{classes.length?<div className="participant-history-tags">{classes.map((entry:any,index:number)=><span key={entry.class?.id??index}>{entry.class?.direction?.name?entry.class.direction.name+' · ':''}{entry.class?.name??entry.class?.code??'Класс'}</span>)}</div>:<p className="muted">Классы не найдены в сохранённых данных.</p>}</div>
          {results.length>0&&<div className="participant-history-results"><h5>Результаты</h5><div className="participant-history-result-list">{results.map((result:any,index:number)=><div key={result.id??index}><span>{result.registrationClass?.class?.direction?.name?result.registrationClass.class.direction.name+' · ':''}{result.registrationClass?.class?.name??'Класс'}</span><strong>{textValue(result.value)} {result.unit==='DB'?'дБ':result.unit==='MPS'?'м/с':result.unit??''}</strong><small>{result.place?result.place+' место':''}{result.isBest?' · лучший результат':''}</small></div>)}</div></div>}
          {registration.inspection&&<div className="participant-history-inspection"><span>Техинспекция</span><strong>{registration.inspection.status==='PASSED'?'Пройдена':registration.inspection.status==='FAILED'?'Не пройдена':'—'}</strong>{registration.inspection.notes&&<p>{registration.inspection.notes}</p>}</div>}
          <details className="participant-history-details"><summary>Оборудование на момент выступления</summary><ConfigurationSnapshot snapshot={snapshot}/></details>
        </article>;
      })}
    </div>}
  </section>;
}

export function ParticipantsPage({ResourcePage,displayCarName}:{ResourcePage:React.ComponentType<any>;displayCarName:(car:any,fallback?:string)=>string}){
  return <ResourcePage title="Участники" subtitle="Профили, команды и история выступлений" path="/admin/participants" columns={[{key:'lastName',label:'Фамилия'},{key:'firstName',label:'Имя'},{key:'city',label:'Город'},{key:'team',label:'Команда'},{key:'phone',label:'Телефон'},{key:'isPublic',label:'Публичный'}]} fields={[{name:'lastName',label:'Фамилия',required:true},{name:'firstName',label:'Имя',required:true},{name:'middleName',label:'Отчество'},{name:'city',label:'Город'},{name:'team',label:'Команда',optionsPath:'/participants/teams',optionLabel:(x:any)=>x.name},{name:'phone',label:'Телефон'},{name:'birthDate',label:'Дата рождения',type:'date'},{name:'isPublic',label:'Показывать профиль публично',type:'checkbox'}]} create={(v:any)=>apiPost('/participants',v)} update={(id:string,v:any)=>apiPatch('/participants/'+id,v)} remove={(id:string)=>apiDelete('/participants/'+id)} searchPlaceholder="ФИО, город, команда" showStatusFilter={false}
    detailLoader={async(row:any)=>{const [carsResult,historyResult]=await Promise.allSettled([apiGet<any>('/participants/'+row.id+'/cars'),apiGet<any>('/history/participant/'+row.id)]);const cars=carsResult.status==='fulfilled'?listData(carsResult.value):[];const history=historyResult.status==='fulfilled'?historyResult.value:null;return {...row,cars,performanceHistory:history,performanceHistoryError:historyResult.status==='rejected'?(historyResult.reason instanceof Error?historyResult.reason.message:'Не удалось загрузить историю выступлений'):''}}}
    detailExtra={(item:any)=><>
      <div className="participant-detail-cars"><div className="eyebrow">АВТОМОБИЛИ УЧАСТНИКА</div>{item.cars?.length?<div className="participant-car-list">{item.cars.map((car:any)=><div className="participant-car-item" key={car.id}><div><strong>{displayCarName(car)}</strong><span>{[car.registrationCountry,car.registrationNumber,car.color].filter(Boolean).join(' · ')}</span></div><span className="badge">{car.configurations?.length??0} конф.</span></div>)}</div>:<span className="muted">Автомобилей нет</span>}</div>
      {item.performanceHistoryError?<div className="participant-detail-cars"><div className="eyebrow">ИСТОРИЯ ВЫСТУПЛЕНИЙ</div><p className="muted">Не удалось загрузить историю: {item.performanceHistoryError}</p></div>:<ParticipantPerformanceHistory history={item.performanceHistory}/>}
    </>}
  />;
}
export default ParticipantsPage;
