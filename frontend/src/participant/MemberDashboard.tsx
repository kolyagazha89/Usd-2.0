import {useState} from 'react';
import {ArrowRight,ArrowUpRight,CalendarDays,CarFront,CheckCircle2,ClipboardCheck,MapPin,Plus,Trophy,Volume2} from 'lucide-react';
import ParticipantJourney from './ParticipantJourney';
import {currentCarAudioComponents,isDirectionConfigured} from './member-readiness';
import {Photo,type PhotoPlaceholders} from '../public/PremiumUI';

type Props={participant:any;cars:any[];registrations:any[];stages:any[];onGo:(path:string)=>void;onAddCar:()=>void;onRegistration:()=>void;onStageRegistration:(stage:any)=>void;placeholders?:PhotoPlaceholders};
const name=(car:any)=>[car?.brand,car?.model].filter(Boolean).join(' ');
const date=(value:any)=>value?new Date(value).toLocaleDateString('ru-RU',{day:'numeric',month:'long'}):'Дата уточняется';
export default function MemberDashboard({participant,cars,registrations,stages,onGo,onAddCar,onRegistration,onStageRegistration,placeholders}:Props){
 const [selectedCarId,setSelectedCarId]=useState('');
 const active=cars.filter(c=>c.isActive!==false),car=active.find(c=>c.id===selectedCarId)??active[0];
 const components=currentCarAudioComponents(car);
 const upcoming=stages.filter(s=>s.registrationOpen||new Date(s.date??0).getTime()>=Date.now()).sort((a,b)=>new Date(a.date).getTime()-new Date(b.date).getTime());
 const stage=upcoming[0];
 const entryFor=(s:any,carId:string)=>registrations.find(r=>r.status!=='CANCELLED'&&(r.stageId??r.stage?.id)===s.id&&(r.carId??r.car?.id)===carId);
 const allCarsRegistered=(s:any)=>active.length>0&&active.every(c=>registrations.some(r=>r.status!=='CANCELLED'&&(r.stageId??r.stage?.id)===s.id&&(r.carId??r.car?.id)===c.id));
 const entry=stage&&car?entryFor(stage,car.id):undefined;
 const allRegistered=stage&&allCarsRegistered(stage);
 const results=registrations.flatMap(r=>(r.results??[]).map((result:any)=>({...result,stage:r.stage,className:(r.classes??[]).find((c:any)=>c.id===result.registrationClassId)?.class?.name}))).sort((a,b)=>new Date(b.stage?.date??0).getTime()-new Date(a.stage?.date??0).getTime());
 const directions=[['SUB','Бас'],['FRONT','Фронт'],['REAR','Тыл']] as const;
 const filled=(code:'SUB'|'FRONT'|'REAR')=>isDirectionConfigured(components,code);
 const hasUsableEquipment=(['SUB','FRONT','REAR'] as const).some(filled);
 const equipmentDescription=!car?.configurations?.length?'Сохраните конфигурацию':!Array.isArray(components)?'Проверьте сохранённую конфигурацию':hasUsableEquipment?'Оборудование указано':'Добавьте акустику или сабвуфер';
 const participantNumber=entry?.numbers?.[0]?.number??entry?.participantNumber;
 const inspectionStatus=(entry?.stageInspection??entry?.inspection)?.status;
 // The checklist is a navigation aid, not a substitute for server-side admission checks.
 const readinessSteps=[
  {id:'car',label:'Автомобиль',description:car?name(car):'Добавьте автомобиль',done:Boolean(car),onClick:()=>car?onGo('/participant?tab=cars'):onAddCar()},
  {id:'config',label:'Оборудование',description:equipmentDescription,done:hasUsableEquipment,onClick:()=>car?onGo('/participant/configurations?carId='+encodeURIComponent(car.id)):onAddCar()},
  ...(stage?[
   {id:'registration',label:'Заявка',description:entry?'Заявка подана':stage.registrationOpen?'Регистрация открыта':'Регистрация закрыта',done:Boolean(entry),onClick:()=>entry?onGo('/participant/registration?registrationId='+encodeURIComponent(entry.id)):stage.registrationOpen?onStageRegistration(stage):onGo('/stages')},
   {id:'inspection',label:'Инспекция',description:inspectionStatus==='PASSED'?'Допуск подтверждён':inspectionStatus==='FAILED'?'Не пройдена':entry?'Ожидает проверки':'После регистрации',done:inspectionStatus==='PASSED',onClick:()=>entry?onGo('/participant/registration?registrationId='+encodeURIComponent(entry.id)):onGo('/stages')}
  ]:[])
 ];
 const readyCount=readinessSteps.filter(step=>step.done).length;
 return <div className="member-home">
  <div className="member-home-lead">
   <article className="member-race-card"><div className="member-card-top"><span className="eyebrow">{entry?'ВАШ БЛИЖАЙШИЙ СТАРТ':'СЛЕДУЮЩИЙ ЭТАП'}</span><span className={'member-state '+(entry?'is-positive':'')}>{entry?'Заявка подана':stage?.registrationOpen?'Регистрация открыта':'Календарь USD'}</span></div>
    <h2>{stage?.name||'Новый старт впереди'}</h2><div className="member-race-meta"><span><CalendarDays size={16}/>{stage?date(stage.date):'Следите за календарём'}</span><span><MapPin size={16}/>{[stage?.city,stage?.venue].filter(Boolean).join(' · ')||'Место уточняется'}</span></div>
    {entry?<div className="member-race-ticket"><div><small>НОМЕР УЧАСТНИКА</small><strong>{participantNumber==null?'—':String(participantNumber).padStart(3,'0')}</strong></div><p>{(entry.stageInspection??entry.inspection)?.status==='PASSED'?'Инспекция пройдена. Удачного выступления!':'На этапе откройте заявку и покажите QR-код судье для инспекции.'}</p></div>:<p className="member-race-copy">{stage?.registrationOpen?'Выберите автомобиль и классы. Заявка займёт три простых шага.':'Здесь появится ваш следующий этап, номер участника и быстрый доступ к инспекции.'}</p>}
    <button className="primary-button" onClick={()=>entry?onGo('/participant/registration?registrationId='+encodeURIComponent(entry.id)):stage?.registrationOpen?onStageRegistration(stage):onGo('/stages')}>{entry?'Открыть заявку и QR-код':stage?.registrationOpen?'Подать заявку':'Смотреть этапы'}<ArrowRight size={17}/></button>
    {entry&&stage?.registrationOpen&&!allRegistered&&<button className="text-button member-race-add" onClick={()=>onStageRegistration(stage)}>Заявить ещё автомобиль<ArrowUpRight size={15}/></button>}
    {allRegistered&&<small className="member-race-footnote">Все ваши автомобили уже заявлены на этот этап.</small>}
   </article>
   <article className="member-pass-card"><div className="member-card-top"><span className="eyebrow">ПРОФИЛЬ УЧАСТНИКА</span><button type="button" className="text-button" onClick={()=>onGo('/participant?tab=profile')} aria-label="Открыть профиль"><ArrowUpRight size={18}/></button></div><div className="member-pass-identity"><Photo src={participant?.photoUrl} placeholderSrc={placeholders?.participant} alt="Фото профиля" className="member-pass-portrait" fallback={<span>{String(participant?.firstName||'U').slice(0,1)}</span>}/><div><h2>{[participant?.firstName,participant?.lastName].filter(Boolean).join(' ')||'Участник USD'}</h2><p>{[participant?.city,participant?.team].filter(Boolean).join(' · ')||'Добро пожаловать в USD'}</p></div></div><dl className="member-pass-stats"><div><dt>Автомобили</dt><dd>{active.length}</dd></div><div><dt>Участие в этапах</dt><dd>{new Set(registrations.filter(r=>r.status!=='CANCELLED').map(r=>r.stageId??r.stage?.id)).size}</dd></div><div><dt>Результаты</dt><dd>{results.length}</dd></div></dl><button className="secondary-button" type="button" onClick={onRegistration}><ClipboardCheck size={16}/>Мои регистрации<ArrowRight size={16}/></button></article>
  </div>
  <section className="member-readiness" aria-label="Готовность к соревнованиям">
   <div className="member-readiness-heading"><div><span className="eyebrow">ПОДГОТОВКА</span><h2>{stage?'Готовность к этапу':'Готовность автомобиля'}</h2><p>{stage?stage.name:'Подготовьте автомобиль к следующему старту'}</p></div><strong className="member-readiness-count" aria-label={readyCount+' из '+readinessSteps.length+' шагов'}>{readyCount}<span> / {readinessSteps.length}</span></strong></div>
   <ol>{readinessSteps.map(step=><li key={step.id} data-complete={step.done}><button type="button" onClick={step.onClick}><span className="member-readiness-status">{step.done?<CheckCircle2 size={19} aria-hidden="true"/>:<span aria-hidden="true"/>}</span><span className="member-readiness-copy"><strong>{step.label}</strong><small>{step.description}</small></span><ArrowUpRight size={16} aria-hidden="true"/></button></li>)}</ol>
   <p className="member-readiness-footnote">Итоговый допуск к замерам подтверждает судья после инспекции.</p>
  </section>
  {(!car||!hasUsableEquipment)&&<ParticipantJourney car={car} stage={stage} registrations={registrations} go={onGo}/>}
  <div className="member-home-secondary">
   <section className="member-garage-panel"><div className="member-section-title"><div><span className="eyebrow">ГАРАЖ USD</span><h2>Моя система</h2></div><button className="text-button" onClick={()=>onGo('/participant?tab=cars')}>Все автомобили<ArrowUpRight size={15}/></button></div>{active.length>1&&<div className="member-vehicle-selector" role="group" aria-label="Выберите автомобиль">{active.map(item=><button key={item.id} type="button" aria-pressed={item.id===car?.id} onClick={()=>setSelectedCarId(item.id)}>{name(item)||'Автомобиль'}</button>)}</div>}<div className="member-vehicle-surface"><div className="member-vehicle-copy"><span className="member-state">{car?'Текущий автомобиль':'Начните здесь'}</span><h3>{car?name(car):'Добавьте автомобиль'}</h3><p>{car?.registrationNumber||'Ваш автомобиль и оборудование для участия в USD'}</p></div><div className="member-vehicle-image"><Photo src={car?.photoUrl} placeholderSrc={placeholders?.car} alt={car?name(car):'Автомобиль USD'} className="member-garage-cover" fallback={<CarFront size={96} strokeWidth={1} aria-hidden="true"/>}/></div></div><div className="member-system-directions">{directions.map(([code,label])=><div key={code}><span>{code}<small>{label}</small></span><strong data-ready={filled(code)}>{!components?'Не проверено':filled(code)?<><CheckCircle2 size={14}/>Заполнено</>:'Не указано'}</strong></div>)}</div><div className="member-panel-actions"><button className="secondary-button" onClick={()=>car?onGo('/participant/configurations?carId='+encodeURIComponent(car.id)):onAddCar()}>{car?<Volume2 size={16}/>:<Plus size={16}/>} {car?'Настроить оборудование':'Добавить автомобиль'}<ArrowRight size={16}/></button></div></section>
   <section className="member-results-panel"><div className="member-section-title"><div><span className="eyebrow">ВАША ИСТОРИЯ</span><h2>Последние результаты</h2></div><Trophy size={20}/></div>{results.length?<div className="member-result-feed">{results.slice(0,3).map((r:any)=><article key={r.id}><div><small>{r.stage?.name||'Этап USD'}</small><h3>{r.className||'Результат'}</h3><p>{r.place!=null?String(r.place)+' место · ':''}{date(r.stage?.date)}</p></div><strong>{r.value}<small>{r.unit||''}</small></strong></article>)}</div>:<div className="member-results-empty"><Trophy size={32} strokeWidth={1}/><h3>Первый результат ещё впереди</h3><p>После публикации результатов этапа здесь появятся ваши замеры и места.</p></div>}<button className="text-button member-history-link" onClick={onRegistration}>Открыть историю участия<ArrowUpRight size={15}/></button></section>
  </div>
  {upcoming.length>1&&<section className="member-more-stages"><div className="member-section-title"><h2>Ещё в календаре</h2><button className="text-button" onClick={()=>onGo('/stages')}>Все этапы<ArrowUpRight size={15}/></button></div>{upcoming.slice(1,4).map(s=>{const existing=car?entryFor(s,car.id):undefined,canEnter=s.registrationOpen&&!allCarsRegistered(s);return <article key={s.id}><span>{date(s.date)}</span><div><strong>{s.name}</strong><small>{s.city||'Место уточняется'}</small></div><button className="secondary-button" onClick={()=>canEnter?onStageRegistration(s):existing?onGo('/participant/registration?registrationId='+encodeURIComponent(existing.id)):onGo('/stages/'+s.id)}>{canEnter?'Подать заявку':existing?'Открыть заявку':'Подробнее'}<ArrowRight size={15}/></button></article>})}</section>}
 </div>;
}
