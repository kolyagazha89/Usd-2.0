import {ArrowUpRight,ClipboardCheck,Trophy,Users} from 'lucide-react';

type OperationsSection = 'registrations' | 'inspections' | 'results';

const sections = [
  {id:'registrations' as const,number:'01',title:'Регистрации',description:'Участники, автомобили и классы',icon:Users,path:'/admin/registrations'},
  {id:'inspections' as const,number:'02',title:'Инспекция въезда',description:'Проверка и список допущенных',icon:ClipboardCheck,path:'/admin/inspections'},
  {id:'results' as const,number:'03',title:'Судейство',description:'Измерения и протокол',icon:Trophy,path:'/admin/results'},
];

/**
 * Stage-specific workflow navigation shared by all three event-day desks.
 * This is navigation only: changing steps never changes registration or
 * inspection data. Stage ID stays in the route when switching desks.
 */
export function EventOperationsNavigation({current,stageId,stageName,go}:{
  current:OperationsSection;
  stageId:string;
  stageName?:string;
  go:(path:string)=>void;
}){
 return <nav className="event-ops-workflow" aria-label="Рабочие разделы этапа">
  <div className="event-ops-workflow-context">
   <span className="event-ops-workflow-kicker">USD · ДЕНЬ СОРЕВНОВАНИЙ</span>
   <strong>{stageId?(stageName||'Выбранный этап'):'Сначала выберите этап'}</strong>
   <small>Одна площадка · три связанных рабочих раздела</small>
  </div>
  <div className="event-ops-workflow-steps">
   {sections.map(step=>{
    const active=step.id===current;
    const Icon=step.icon;
    return <button key={step.id} type="button"
     className={'event-ops-workflow-step'+(active?' is-active':'')}
     aria-current={active?'page':undefined} aria-label={step.title}
     disabled={!stageId}
     onClick={()=>{if(!active&&stageId)go(step.path+'?stageId='+encodeURIComponent(stageId))}}>
     <span className="event-ops-workflow-number">{step.number}</span>
     <Icon size={19} aria-hidden="true"/>
     <span className="event-ops-workflow-copy"><strong>{step.title}</strong><small>{step.description}</small></span>
     {!active&&<ArrowUpRight size={16} className="event-ops-workflow-arrow" aria-hidden="true"/>}
    </button>;
   })}
  </div>
 </nav>;
}
