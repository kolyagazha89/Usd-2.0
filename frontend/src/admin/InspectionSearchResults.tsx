import {ChevronRight} from 'lucide-react';
import './inspection-search.css';

/** A single compact, keyboard-accessible action per matching registration. */
export function InspectionSearchResults({rows,loading,onOpen,onReset,displayCarName}:{rows:any[];loading:boolean;onOpen:(id:string)=>void;onReset:()=>void;displayCarName:(car:any)=>string}){
 return <section className="inspection-quick-results" aria-label="Результаты поиска инспекций" aria-busy={loading}>
  <p className="inspection-search-count" role="status">{loading?'Загружаем инспекции…':`Найдено: ${rows.length}`}</p>
  {!loading&&(rows.length?<ul>{rows.map(row=>{
   const numbers=[...new Set([row.participantNumber,...(row.numbers??[]).map((n:any)=>n.number),...(row.classes??[]).map((c:any)=>c.number?.number)].filter(n=>n!==null&&n!==undefined))];
   const name=[row.participant?.lastName,row.participant?.firstName,row.participant?.middleName].filter(Boolean).join(' ')||'Участник';
   const status=(row.inspection??row.stageInspection)?.status;
   return <li key={row.id}><button type="button" className="inspection-quick-result" onClick={()=>onOpen(row.id)} aria-label={'Открыть инспекцию: '+numbers.map(n=>'№'+n).join(', ')+' · '+name}>
    <strong className="inspection-quick-number">{numbers.map(n=>'№'+String(n).padStart(3,'0')).join(', ')||'Без номера'}</strong>
    <span className="inspection-quick-person"><strong>{name}</strong><small>{[displayCarName(row.car),row.car?.registrationNumber].filter(Boolean).join(' · ')}</small></span>
    <span className={'badge '+(status==='PASSED'?'good':status==='FAILED'?'bad':'')}>{status==='PASSED'?'Прошёл':status==='FAILED'?'Не прошёл':'Ожидает'}</span><ChevronRight size={16} aria-hidden="true"/>
   </button></li>;
  })}</ul>:<div className="inspection-search-empty"><p>Нет совпадений в выбранной очереди. Проверьте номер или сбросьте фильтры.</p><button type="button" className="secondary-button compact" onClick={onReset}>Сбросить поиск и фильтры</button></div>)}
 </section>;
}
