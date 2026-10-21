import {ArrowUpRight,CarFront,CheckCircle2,ClipboardCheck,Volume2} from 'lucide-react';
export default function ParticipantJourney({cars,registrations,go}:{cars:any[];registrations:any[];go:(path:string)=>void}){
 const car=cars.find(c=>c.isActive!==false);
 const configured=Boolean(car?.configurations?.length);
 const registered=registrations.some(r=>r.status!=='CANCELLED'&&(r.stage?.registrationOpen||new Date(r.stage?.date??0).getTime()>=Date.now()));
 const steps=[
  {title:'Автомобиль',description:car?[car.brand,car.model].filter(Boolean).join(' '):'Укажите марку, модель и госномер.',done:Boolean(car),label:car?'Мои автомобили':'Добавить автомобиль',path:car?'/participant?tab=cars':'/participant/car/new',Icon:CarFront},
  {title:'Оборудование',description:configured?'Конфигурация сохранена. Проверьте её перед заявкой.':'Сохраните состав баса, фронта или тыла.',done:configured,label:configured?'Проверить оборудование':'Настроить оборудование',path:car?'/participant/configurations?carId='+encodeURIComponent(car.id):'/participant/car/new',Icon:Volume2},
  {title:'Заявка на этап',description:registered?'Номер участника и QR-код — в регистрации.':'Выберите этап и классы. Оплата — на месте.',done:registered,label:registered?'Открыть мои регистрации':'Выбрать этап',path:registered?'/participant?tab=registrations':'/stages',Icon:ClipboardCheck},
 ];
 return <section className="participant-journey" aria-label="Подготовка к участию"><div className="participant-journey-heading"><h2>Подготовка к участию</h2><p>Автомобиль → оборудование → заявка на этап.</p></div><ol>{steps.map(({title,description,done,label,path,Icon},i)=><li key={title} data-complete={done}><div className="participant-journey-step"><span>{done?<CheckCircle2 size={19} aria-label="Готово"/>:String(i+1).padStart(2,'0')}</span><Icon size={18} aria-hidden="true"/></div><h3>{title}</h3><p>{description}</p><button type="button" className="secondary-button" onClick={()=>go(path)}>{label}<ArrowUpRight size={15}/></button></li>)}</ol></section>;
}
