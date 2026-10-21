import {ArrowUpRight,CarFront,ClipboardCheck,Gauge,Plus,ShieldCheck} from 'lucide-react';

type Props={
 cars:any[];
 registrations:any[];
 stages:any[];
 onGo:(path:string)=>void;
 onAddCar:()=>void;
 onRegistration:()=>void;
};
const directions=[
 {code:'SUB',name:'Бас',event:'SPL · BassRace · Storm Wall'},
 {code:'FRONT',name:'Фронт',event:'BFSPL'},
 {code:'REAR',name:'Тыл',event:'BDW SPL'}
] as const;

export default function MemberDashboard({cars,registrations,stages,onGo,onAddCar,onRegistration}:Props){
 const car=cars[0];
 const configs=car?.configurations??[];
 const current=configs[0];
 const version=current?.versions?.find((v:any)=>v.version===current.currentVersion)??current?.versions?.[0];
 const components=version?.audioComponents;
 const enrolled=registrations.filter(r=>r.status!=='CANCELLED').length;
 const openStages=stages.filter(s=>s.registrationOpen).length;
 const filled=(code:string)=>Array.isArray(components)?components.filter((c:any)=>c.direction===code&&c.brand&&c.model&&(code!=='SUB'||c.type==='SUBWOOFER')).length:0;
 return <section className="member-release-dashboard" aria-label="Быстрый доступ к системе и соревнованиям">
  <div className="member-release-heading"><div><span className="eyebrow">USD / МОЯ СИСТЕМА</span><h2>Подготовься к следующему этапу</h2><p>Автомобиль, оборудование и регистрации — в одном месте.</p></div>
   <span className="member-release-edition">PARTICIPANT EXPERIENCE</span></div>
  <div className="member-release-grid">
   <article className="member-release-car">
    <div className="member-release-car-copy"><span className="eyebrow">МОЙ ГАРАЖ</span><h3>{car?[car.brand,car.model].filter(Boolean).join(' '):'Начни со своего автомобиля'}</h3>
     <p>{car?.registrationNumber||'Добавьте автомобиль, чтобы сохранять конфигурации и участвовать в этапах USD.'}</p>
     {car&&<div className="member-release-car-data"><span>{configs.length} конфигураций</span><span>{components?.length??'—'} компонентов</span></div>}
     <div className="member-release-car-actions">
      <button type="button" className="primary-button" onClick={()=>car?onGo('/participant/car?carId='+encodeURIComponent(car.id)):onAddCar()}>
       {car?<><Gauge size={16}/>Открыть конфигуратор</>:<><Plus size={16}/>Добавить автомобиль</>}
       <ArrowUpRight size={15}/></button>
      <button className="secondary-button" type="button" onClick={()=>onGo('/participant?tab=cars')}>Мой гараж</button>
     </div>
    </div>
    <div className="member-release-car-art">{car?.photoUrl?<img src={car.photoUrl} alt={[car.brand,car.model].filter(Boolean).join(' ')}/>:<CarFront size={132} strokeWidth={.75} aria-hidden="true"/>}</div>
   </article>
   <article className="member-release-status">
    <div className="member-release-status-head"><span className="eyebrow">ГОТОВНОСТЬ СИСТЕМЫ</span><ShieldCheck size={19}/></div>
    <h3>{Array.isArray(components)?directions.filter(d=>filled(d.code)>0).length+' из 3 направлений':'Конфигурация оборудования'}</h3>
    <p>{Array.isArray(components)?'Проверка заполнения основных направлений':'Выберите автомобиль и заполните систему для допуска к соревнованиям.'}</p>
    <div className="member-release-progress" aria-hidden="true"><span style={{width:Array.isArray(components)?directions.filter(d=>filled(d.code)>0).length/3*100+'%':'0%'}}/></div>
    <div className="member-release-directions">{directions.map(d=><div key={d.code}><span className={'member-release-status-dot '+(filled(d.code)?'ready':'')}/><div><strong>{d.code} <small>{d.name}</small></strong><span>{d.event}</span></div><span className={filled(d.code)?'ready-label':'pending-label'}>{filled(d.code)?'Заполнено': 'Не указано'}</span></div>)}</div>
    <div className="member-release-stage-actions"><button type="button" onClick={onRegistration}><ClipboardCheck size={16}/> Мои регистрации ({enrolled}) <ArrowUpRight size={16}/></button><small>{openStages?openStages+' открытых этапов':'Нет открытых регистраций'}</small></div>
   </article>
  </div>
 </section>;
}
