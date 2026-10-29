import {ArrowUpRight,CarFront,CheckCircle2,ClipboardCheck,Volume2} from 'lucide-react';
import {currentCarAudioComponents,isCarIdentityComplete,isCarRegisteredForStage,isDirectionConfigured,requiredDirectionsForRegistration} from './member-readiness';

export default function ParticipantJourney({car,stage,registrations,go}:{car?:any;stage?:any;registrations:any[];go:(path:string)=>void}){
 const components=currentCarAudioComponents(car);
 const carReady=isCarIdentityComplete(car);
 const registration=car?.id&&stage?.id?registrations.find(r=>r?.status!=='CANCELLED'&&(r?.carId??r?.car?.id)===car.id&&(r?.stageId??r?.stage?.id)===stage.id):undefined;
 const required=requiredDirectionsForRegistration(registration);
 const missing=required.filter(direction=>!isDirectionConfigured(components,direction));
 const hasEquipment=(['SUB','FRONT','REAR'] as const).some(direction=>isDirectionConfigured(components,direction));
 const configured=hasEquipment&&missing.length===0;
 const equipmentDescription=missing.length
  ?'Для выбранных классов заполните: '+missing.map(direction=>({SUB:'бас',FRONT:'фронт',REAR:'тыл'}[direction])).join(', ')+'.'
  :configured?'Конфигурация сохранена. Проверьте её перед заявкой.':'Сохраните состав баса, фронта или тыла.';
 const registered=isCarRegisteredForStage(registrations,car?.id,stage?.id);
 const steps=[
  {title:'Автомобиль',description:carReady?[car.brand,car.model].join(' '):car?'Уточните марку и модель автомобиля.':'Укажите марку и модель автомобиля.',done:carReady,label:car?'Мои автомобили':'Добавить автомобиль',path:car?'/participant?tab=cars':'/participant/car/new',Icon:CarFront},
  {title:'Оборудование',description:equipmentDescription,done:configured,label:configured?'Проверить оборудование':'Настроить оборудование',path:car?'/participant/configurations?carId='+encodeURIComponent(car.id):'/participant/car/new',Icon:Volume2},
  {title:'Заявка на этап',description:registered?'Номер участника и QR-код — в регистрации.':stage?'Выберите классы для '+stage.name+'. Оплата — на месте.':'Выберите этап и классы. Оплата — на месте.',done:registered,label:registered?'Открыть мои регистрации':'Выбрать этап',path:registered?'/participant?tab=registrations':'/stages',Icon:ClipboardCheck},
 ];
 return <section className="participant-journey" aria-label="Подготовка к участию"><div className="participant-journey-heading"><h2>Подготовка к участию</h2><p>Автомобиль → оборудование → заявка на этап.</p></div><ol>{steps.map(({title,description,done,label,path,Icon},i)=><li key={title} data-complete={done}><div className="participant-journey-step"><span>{done?<CheckCircle2 size={19} aria-label="Готово"/>:String(i+1).padStart(2,'0')}</span><Icon size={18} aria-hidden="true"/></div><h3>{title}</h3><p>{description}</p><button type="button" className="secondary-button" onClick={()=>go(path)}>{label}<ArrowUpRight size={15}/></button></li>)}</ol></section>;
}
