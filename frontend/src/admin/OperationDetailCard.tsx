import type {ReactNode} from 'react';
import {ChevronLeft,Pencil,ClipboardCheck} from 'lucide-react';
import {AdminEntityLink} from './AdminEntityLink';

const personName=(r:any)=>[r?.participant?.lastName,r?.participant?.firstName,r?.participant?.middleName].filter(Boolean).join(' ')||'Участник не указан';
const numberLabel=(value:unknown)=>value==null?'—':/^\d+$/.test(String(value))?String(value).padStart(3,'0'):String(value);
export function OperationDetailHeader({title,registration:r,status,onBack,displayCarName}:{title:string;registration:any;status:ReactNode;onBack:()=>void;displayCarName:(car:any,fallback?:string)=>string}){
 const numbers=[...new Set([r.participantNumber,...(r.numbers??[]).map((n:any)=>n.number),...(r.classes??[]).map((c:any)=>c.number?.number)].filter(n=>n!==null&&n!==undefined&&n!==''))].sort((a:any,b:any)=>Number(a)-Number(b));
 return <header className="resource-editor-heading operation-detail-heading">
  <div className="operation-detail-topline"><h2>{title}</h2><button type="button" className="secondary-button compact" onClick={onBack}><ChevronLeft size={16}/>Назад к списку</button></div>
  <div className="operation-detail-identity"><strong><AdminEntityLink kind="participant" id={r.participant?.id??r.participantId}>{personName(r)}</AdminEntityLink></strong>{status}</div>
  {(r.cars?.length?r.cars:[r.car??{}]).map((car:any,index:number)=><p className="operation-detail-car" key={car.id??index}><AdminEntityLink kind="car" id={car.id??r.carId}>{displayCarName(car,'Автомобиль не указан')}</AdminEntityLink>{car.registrationNumber&&<small>{car.registrationNumber}</small>}</p>)}
  <div className="operation-detail-numbers" aria-label="Номера участника">{numbers.map(number=><span key={String(number)}>№ {numberLabel(number)}</span>)}</div>
 </header>;
}

export function OperationFacts({items}:{items:Array<{label:string;value:ReactNode}>}){
 return <dl className="operation-detail-facts">{items.map(item=><div key={item.label}><dt>{item.label}</dt><dd>{item.value??'—'}</dd></div>)}</dl>;
}

export function OperationDetailCard({registration:r,result,onBack,onEdit,go,displayCarName,enumLabel}:{registration:any;result?:any;onBack:()=>void;onEdit?:()=>void;go:(path:string)=>void;displayCarName:(car:any,fallback?:string)=>string;enumLabel:(value:any)=>string}){
 const stageId=r.stageId??r.stage?.id,team=typeof r.participant?.team==='string'?r.participant.team:r.participant?.team?.name;
 const historic=Boolean(result?.isHistorical),inspection=r.stageInspection??r.inspection;
 const status=result?(historic?'Исторический':'Официальный'):r.status==='ACTIVE'?'Активна':r.status==='CANCELLED'?'Отменена':enumLabel(r.status);
 return <section className="panel resource-editor-page operation-detail-card">
  <OperationDetailHeader title={result?'Результат':'Регистрация'} registration={r} status={<span className={'badge '+(!historic&&(!result?r.status==='ACTIVE':true)?'good':'')}>{status}</span>} onBack={onBack} displayCarName={displayCarName}/>
  {result&&<section className="operation-detail-section" aria-label="Результат измерения"><div className="operation-result-values"><div><span>Результат</span><strong>{result.value??'—'}</strong>{result.registrationClass?.class?.unit&&<small>{enumLabel(result.registrationClass.class.unit)}</small>}</div><div><span>Место</span><strong>{result.place??'—'}</strong></div></div></section>}
  {onEdit&&<div className="operation-detail-primary"><button type="button" className="primary-button" onClick={onEdit}><Pencil size={16}/>Исправить результат</button></div>}
  <OperationFacts items={[
   {label:'Этап',value:stageId?<AdminEntityLink kind="stage" id={stageId}>{r.stage?.name||'Выбранный этап'}</AdminEntityLink>:null},
   {label:'Команда',value:team||'Без команды'},
   ...(!result?[{label:'Инспекция',value:inspection?.status==='PASSED'?'Прошёл':inspection?.status==='FAILED'?'Не прошёл':'Ожидает проверки'}]:[]),
  ]}/>
  <section className="operation-detail-section"><h3>{result?'Класс и номер':'Классы и номера'}</h3><ul className="operation-detail-classes">{(result?[result.registrationClass]:r.classes??[]).filter(Boolean).map((entry:any,index:number)=><li key={entry.id??index}><span>№ {numberLabel(entry.number?.number??r.participantNumber)}</span><div><small>{entry.class?.direction?.name||'Без направления'}</small><strong>{entry.class?.name||'Класс не указан'}</strong></div></li>)}</ul>{!result&&!r.classes?.length&&<p>Классы не назначены</p>}</section>
  {result?.notes&&<OperationFacts items={[{label:'Комментарий',value:result.notes}]}/>}
  {!result&&stageId&&<div className="operation-detail-primary"><button type="button" className="primary-button" onClick={()=>go('/admin/inspections?stageId='+encodeURIComponent(stageId)+'&registrationId='+encodeURIComponent(r.id))}><ClipboardCheck size={16}/>Открыть инспекцию</button></div>}
 </section>;
}
