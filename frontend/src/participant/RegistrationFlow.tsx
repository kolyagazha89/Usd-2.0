import {canContinueVehicleRegistration} from './registration-classes';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,CalendarDays,Check,MapPin,ShieldCheck} from 'lucide-react';

type Props={
 stage:any;date:string;vehicle:ReactNode;classes:ReactNode;confirmation:ReactNode;
 vehicleReady:boolean;classesReady:boolean;busy:boolean;carName:string;configurationName:string;classNames:string[];
 carId:string;configurationId:string;repeatVehicle:boolean;onEditConfiguration:()=>void;
};
const steps=['Автомобиль','Классы','Подтверждение'];
export default function RegistrationFlow({stage,date,vehicle,classes,confirmation,vehicleReady,classesReady,busy,carName,configurationName,classNames,carId,configurationId,repeatVehicle,onEditConfiguration}:Props){
 const [step,setStep]=useState(0);
 const [configurationAnswer,setConfigurationAnswer]=useState<''|'unchanged'|'updated'>('');
 const [updatedReviewed,setUpdatedReviewed]=useState(false);
 const canContinueVehicle=canContinueVehicleRegistration(vehicleReady,repeatVehicle,configurationAnswer,updatedReviewed);
 useEffect(()=>{setConfigurationAnswer('');setUpdatedReviewed(false);setStep(0)},[stage?.id,carId,configurationId]);
 const title=useRef<HTMLHeadingElement>(null);
 const move=(next:number)=>{setStep(next);requestAnimationFrame(()=>{title.current?.focus();title.current?.scrollIntoView?.({block:'start',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})})};
 useEffect(()=>{if(step>0&&!canContinueVehicle)setStep(0);else if(step>1&&!classesReady)setStep(1)},[canContinueVehicle,classesReady,step]);
 return <div className="member-entry-flow">
  <nav className="entry-steps" aria-label="Шаги регистрации"><ol>{steps.map((label,index)=><li key={label} data-state={index===step?'current':index<step?'complete':'next'}><button type="button" disabled={busy||index>step} aria-current={index===step?'step':undefined} onClick={()=>move(index)}><span>{index<step?<Check size={15}/>:String(index+1).padStart(2,'0')}</span><strong>{label}</strong></button></li>)}</ol></nav>
  <div className="entry-workspace"><div className="entry-task"><div className="entry-task-title"><span className="eyebrow">ШАГ {step+1} ИЗ 3</span><h2 ref={title} tabIndex={-1}>{['На чём выступаете?','В каких классах участвуете?','Проверьте вашу заявку'][step]}</h2><p>{['Выберите автомобиль и состав системы для этого этапа.','Отметьте классы. Доступность зависит от оборудования автомобиля.','Проверьте данные и подтвердите согласия перед отправкой.'][step]}</p></div>
   {step===0?vehicle:step===1?classes:confirmation}
   {step===0&&repeatVehicle&&vehicleReady&&<fieldset className="entry-configuration-review">
    <legend>Вы меняли аудиосистему после предыдущего выступления?</legend>
    <p>Для новой заявки важно выбрать актуальную версию оборудования. Прошлые выступления сохраняют свои конфигурации.</p>
    <label><input type="radio" name="entry-config-changed" checked={configurationAnswer==='unchanged'} onChange={()=>{setConfigurationAnswer('unchanged');setUpdatedReviewed(false)}}/>Нет, состав системы не изменился</label>
    <label><input type="radio" name="entry-config-changed" checked={configurationAnswer==='updated'} onChange={()=>{setConfigurationAnswer('updated');setUpdatedReviewed(false)}}/>Да, я менял(а) оборудование</label>
    {configurationAnswer==='updated'&&<div className="entry-configuration-changed">
     <p role="status">Проверьте и при необходимости обновите оборудование автомобиля. Затем выберите актуальную версию конфигурации в заявке.</p>
     <button type="button" className="secondary-button" onClick={onEditConfiguration}>Открыть редактор конфигурации <ArrowRight size={16}/></button>
     <label><input type="checkbox" checked={updatedReviewed} onChange={event=>setUpdatedReviewed(event.target.checked)}/>Я проверил(а), что выбрана актуальная версия оборудования</label>
    </div>}
   </fieldset>}
   {step<2&&<div className="entry-navigation">{step>0&&<button className="secondary-button" type="button" onClick={()=>move(step-1)}><ArrowLeft size={16}/>Назад</button>}<button className="primary-button" type="button" disabled={busy||!(step===0?canContinueVehicle:classesReady)} onClick={()=>move(step+1)}>{step===0?'Перейти к классам':'Проверить заявку'}<ArrowRight size={16}/></button></div>}
   {step===2&&<button className="text-button entry-edit-back" type="button" disabled={busy} onClick={()=>move(1)}><ArrowLeft size={15}/>Изменить классы</button>}
  </div>
  <aside className="entry-event"><span className="eyebrow">ВАШ ЭТАП</span><h2>{stage.name}</h2><p><CalendarDays size={16}/>{date}</p><p><MapPin size={16}/>{[stage.city,stage.venue].filter(Boolean).join(' · ')||'Место уточняется'}</p><div className="entry-event-selection"><div><small>Автомобиль</small><strong>{carName||'Ещё не выбран'}</strong></div><div><small>Оборудование</small><strong>{configurationName||'Ещё не выбрано'}</strong></div>{classNames.length>0&&<div><small>Классы · {classNames.length}</small><strong>{classNames.join(' · ')}</strong></div>}</div><div className="entry-payment-note"><ShieldCheck size={20}/><div><strong>Онлайн-заявка бесплатная</strong><p>Оплата участия — на месте проведения соревнования.</p></div></div></aside>
  </div>
 </div>;
}
