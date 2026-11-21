import {AdminEntityLink} from './AdminEntityLink';
import {eventOperationsPath,type OperationsSection} from './event-operations-path';
import {jumpToEventOpsRecords} from './event-ops-scroll';

const sections = [
 {id:'registrations',title:'Регистрации'},
 {id:'inspections',title:'Инспекция',label:'Инспекция въезда'},
 {id:'results',title:'Судейство'},
] as const;

export function EventOperationsNavigation({current,stageId,stageName,registrationId,participantNumber,showListJump=true,go}:{
 current:OperationsSection;
 stageId:string;
 stageName?:string;
 registrationId?:string;
 participantNumber?:number|string;
 showListJump?:boolean;
 go:(path:string)=>void;
}){
 return <nav className="event-ops-workflow" aria-label="Рабочие разделы этапа">
  <div className="event-ops-workflow-context">
   <strong><AdminEntityLink kind="stage" id={stageId}>{stageId?(stageName||'Выбранный этап'):'Сначала выберите этап'}</AdminEntityLink></strong>
   {participantNumber!=null&&<span className="event-ops-workflow-number-label">Участник № {participantNumber}</span>}
   {stageId&&<div className="event-ops-workflow-context-actions">
    {showListJump&&<button type="button" className="secondary-button compact event-ops-list-jump" onClick={()=>jumpToEventOpsRecords()}>К списку</button>}
    <button type="button" className="secondary-button compact" onClick={()=>go('/admin/event-day?stageId='+encodeURIComponent(stageId))} aria-label="Все участники и допуски">Участники и допуски</button>
   </div>}
  </div>
  <div className="event-ops-workflow-steps">
   {sections.map(step=>{
    const active=step.id===current;
    return <button key={step.id} type="button"
     className={'event-ops-workflow-step'+(active?' is-active':'')}
     aria-current={active?'page':undefined} aria-label={'label' in step?step.label:step.title} disabled={!stageId}
     onClick={()=>{if(!active&&stageId)go(eventOperationsPath(step.id,stageId,registrationId))}}>
     {step.title}
    </button>;
   })}
  </div>
 </nav>;
}
