import './stage-report.css';
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,CalendarDays,CheckCircle2,ClipboardCheck,FileText,Printer,RefreshCw,ShieldAlert,Trophy,Users,CarFront} from 'lucide-react';
import {apiGet,listData} from '../api';
import {buildStageReport,stageReportStatusLabel,type StageReportSource} from './stage-report-model';

const formatDate=(value:unknown)=>{if(!value)return 'Дата не указана';const time=new Date(String(value));return Number.isNaN(time.getTime())?'Дата не указана':new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(time)};
const number=(value:number)=>new Intl.NumberFormat('ru-RU').format(value);
function currentStageId(path:string){try{return new URLSearchParams(path.split('?')[1]??'').get('stageId')??''}catch{return''}}
const statusText=(value:string)=>({COMPLETED:'Завершён',PUBLISHED:'Опубликован',DRAFT:'Черновик',CANCELLED:'Отменён'} as Record<string,string>)[value]??value;
type PageProps={path:string;go:(path:string)=>void;PageFrame:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;Empty:React.ComponentType<any>};

export default function StageReportPage({path,go,PageFrame,LoadingPage,ErrorPanel,Empty}:PageProps){
 const stageId=currentStageId(path);
 const [stages,setStages]=useState<any[]>([]);
 const [source,setSource]=useState<StageReportSource|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const [refresh,setRefresh]=useState(0),request=useRef(0);
 useEffect(()=>{
  let active=true;
  void apiGet<any>('/stages').then(response=>{
   if(!active)return;
   const all=listData<any>(response).filter(x=>x?.id);
   const sorted=all.slice().sort((a,b)=>new Date(b.date??0).getTime()-new Date(a.date??0).getTime());
   setStages(sorted);
   if(!stageId&&sorted.length){
    const selected=sorted.find(x=>x.status==='COMPLETED')??sorted[0];
    go('/admin/stage-report?stageId='+encodeURIComponent(selected.id));
   }
  }).catch(e=>{if(active&&!stageId)setError(e instanceof Error?e.message:'Не удалось загрузить этапы')});
  return()=>{active=false};
 },[stageId]);
 useEffect(()=>{
  const seq=++request.current;
  setSource(null);setError('');
  if(!stageId){setLoading(false);return}
  setLoading(true);
  void apiGet<StageReportSource>('/statistics/stages/'+encodeURIComponent(stageId)).then(data=>{
   if(seq===request.current)setSource(data);
  }).catch(e=>{if(seq===request.current)setError(e instanceof Error?e.message:'Не удалось сформировать отчёт')})
   .finally(()=>{if(seq===request.current)setLoading(false)});
  return()=>{request.current++};
 },[stageId,refresh]);
 const report=source?.stage&&source?.stats?buildStageReport(source):null;
 const openStage=(id:string)=>{if(id!==stageId)go('/admin/stage-report'+(id?'?stageId='+encodeURIComponent(id):''))};
 return <PageFrame className="usd-stage-report-page" title="Отчёты по этапам" subtitle="Внутренняя сводка по заявкам, инспекции, классам и спортивным результатам" action={<div className="usd-report-actions">
  <button type="button" className="secondary-button compact" onClick={()=>go('/admin/statistics')}><ArrowLeft size={15}/>Статистика</button>
  <button type="button" className="secondary-button compact" onClick={()=>setRefresh(x=>x+1)} disabled={!stageId||loading}><RefreshCw size={15}/>Обновить</button>
  <button type="button" className="primary-button compact" disabled={!report||loading} onClick={()=>window.print()}><Printer size={16}/>Печать / PDF</button>
 </div>}>
  <section className="usd-report-picker panel" aria-label="Выбор этапа для отчёта">
   <label htmlFor="usd-report-stage-select">Этап соревнований</label>
   <select id="usd-report-stage-select" value={stageId} onChange={e=>openStage(e.target.value)} disabled={loading&&stages.length===0}>
    <option value="">Выберите этап</option>
    {stages.map(stage=><option key={stage.id} value={stage.id}>№{stage.stageNumber} · {stage.name} · {statusText(stage.status)}</option>)}
    {stageId&&!stages.some(s=>s.id===stageId)&&<option value={stageId}>Этап {stageId.slice(0,8)}</option>}
   </select>
   <small>Отчёт формируется из актуальных данных сервера. Печать не публикует результаты и ничего не изменяет в базе.</small>
  </section>
  {error&&<ErrorPanel message={error} retry={()=>setRefresh(v=>v+1)}/>}
  {loading?<LoadingPage/>:!stageId?<Empty text="Выберите этап, чтобы посмотреть отчёт"/>:!report&&!error?<Empty text="Данные отчёта пока недоступны"/>:report&&<article className="usd-report-document" aria-label="Сводка этапа USD">
   <header className="usd-report-hero">
    <div><span className="usd-report-kicker">ULTIMATE SOUND DESTRUCTION / EVENT REPORT</span>
     <h2>Этап №{report.stage.stageNumber} · {report.stage.name}</h2>
     <p><CalendarDays size={16}/>{formatDate(report.stage.date)}{report.stage.city?' · '+report.stage.city:''}{report.stage.season?.year?' · сезон '+report.stage.season.year:''}</p>
    </div>
    <div className="usd-report-hero-status"><span className={'usd-report-status '+(report.status==='PUBLISHED'?'is-published':'is-internal')}>{stageReportStatusLabel(report.status)}</span><small>Сформировано {formatDate(report.generatedAt)}</small></div>
   </header>
   {report.warnings.length>0&&<section className="usd-report-warnings" aria-label="Ограничения отчёта"><strong><ShieldAlert size={17}/>Контроль готовности</strong>{report.warnings.map((warning,index)=><p key={index}>{warning}</p>)}</section>}
   <section className="usd-report-metrics" aria-label="Сводные показатели">
    {[
     {label:'Регистрации',value:report.registrations,icon:ClipboardCheck},
     {label:'Участники',value:report.participants,icon:Users},
     {label:'Автомобили',value:report.cars,icon:CarFront},
     {label:'Выступления',value:report.appearances,icon:Trophy},
    ].map(metric=><div className="usd-report-metric" key={metric.label}><metric.icon size={20}/><strong>{number(metric.value)}</strong><span>{metric.label}</span></div>)}
   </section>
   <div className="usd-report-columns">
    <section className="usd-report-section">
     <div className="usd-report-heading"><h3>Инспекция и допуск</h3><span>{report.inspections.percent}% проверено</span></div>
     <progress value={report.inspections.completed} max={Math.max(1,report.registrations)} aria-label="Доля проведённых инспекций"/>
     <div className="usd-report-inspections">
      <div><CheckCircle2 size={18}/><strong>{number(report.inspections.passed)}</strong><span>прошли</span></div>
      <div><ShieldAlert size={18}/><strong>{number(report.inspections.failed)}</strong><span>не прошли</span></div>
      <div><ClipboardCheck size={18}/><strong>{number(report.inspections.pending)}</strong><span>ожидают</span></div>
     </div>
    </section>
    <section className="usd-report-section">
     <div className="usd-report-heading"><h3>Регистрации по направлениям</h3><span>По выбранным классам</span></div>
     {report.directions.length?<div className="usd-report-direction-bars">{report.directions.map(row=><div className="usd-report-direction" key={row.direction}>
      <div><strong>{row.direction}</strong><span>{row.classes} кл. · {number(row.registrations)} записей</span></div>
      <div className="usd-report-bar"><i style={{width:(row.registrations/Math.max(1,...report.directions.map(r=>r.registrations))*100)+'%'}}/></div>
     </div>)}</div>:<p className="usd-report-empty">Классы ещё не назначены.</p>}
    </section>
   </div>
   <section className="usd-report-section">
    <div className="usd-report-heading"><h3>Классы и участие</h3><span>{report.classes.length} классов</span></div>
    {report.classes.length?<div className="usd-report-table-wrap"><table className="usd-report-table"><thead><tr><th>Направление</th><th>Класс</th><th>Регистрации</th><th>Люди</th><th>Автомобили</th></tr></thead><tbody>
     {report.classes.map(c=><tr key={c.id||c.direction+c.name}><td data-label="Направление">{c.direction}</td><td data-label="Класс"><strong>{c.name}</strong></td><td data-label="Регистрации">{number(c.registrations)}</td><td data-label="Люди">{number(c.participants)}</td><td data-label="Автомобили">{number(c.cars)}</td></tr>)}
    </tbody></table></div>:<p className="usd-report-empty">Регистрации по классам отсутствуют.</p>}
   </section>
   <section className="usd-report-section">
    <div className="usd-report-heading"><h3>Спортивные результаты · подиумы</h3><span>{report.podiums.length} записей</span></div>
    <p className="usd-report-help">Только допущенные результаты из внутренней статистики USD. До публикации этапа эти данные не являются официальным протоколом.</p>
    {report.podiums.length?<div className="usd-report-table-wrap"><table className="usd-report-table usd-report-podium-table"><thead><tr><th>Направление / класс</th><th>Место</th><th>№</th><th>Участник</th><th>Результат</th></tr></thead><tbody>
     {report.podiums.map(p=><tr key={p.id}><td data-label="Направление / класс"><strong>{p.direction}</strong><small>{p.className}</small></td><td data-label="Место"><span className={'usd-report-place p'+p.place}>{p.place}</span></td><td data-label="№">{p.number||'—'}</td><td data-label="Участник">{p.participant}<small>{p.car}</small></td><td data-label="Результат"><strong>{p.value} {p.unit}</strong></td></tr>)}
    </tbody></table></div>:<p className="usd-report-empty">Подиумы пока не сформированы.</p>}
   </section>
   <section className="usd-report-section">
    <div className="usd-report-heading"><h3>Медали команд по зафиксированному составу</h3><span>Неофициальная сводка</span></div>
    <p className="usd-report-help">Учитываются только команды, сохранённые в момент инспекции. Это не командный зачёт: баллы и места команд не рассчитываются.</p>
    {report.teams.length?<div className="usd-report-team-list">{report.teams.map(team=><div className="usd-report-team" key={team.name}><strong>{team.name}</strong><span>🥇 {team.gold} · 🥈 {team.silver} · 🥉 {team.bronze}</span></div>)}</div>:<p className="usd-report-empty">Команды на подиуме не зафиксированы или исторические сведения отсутствуют.</p>}
   </section>
   {(report.pendingRegistrations.length>0||report.inspectionProblems.length>0||report.pendingConfigurations.length>0)&&<section className="usd-report-section usd-report-followups">
    <div className="usd-report-heading"><h3>Задачи после этапа</h3><span>Требуют внимания</span></div>
    {report.pendingRegistrations.length>0&&<div className="usd-report-followup"><h4>Ожидают инспекции ({report.pendingRegistrations.length})</h4><p>{report.pendingRegistrations.map(p=>'№'+p.number+' · '+p.participant).join('; ')}</p></div>}
    {report.inspectionProblems.length>0&&<div className="usd-report-followup"><h4>Не прошли инспекцию ({report.inspectionProblems.length})</h4><p>{report.inspectionProblems.map(p=>'№'+p.number+' · '+p.participant+' — '+p.reason).join('; ')}</p></div>}
    {report.pendingConfigurations.length>0&&<div className="usd-report-followup"><h4>Оборудование ещё не оформлено ({report.pendingConfigurations.length})</h4><p>{report.pendingConfigurations.map(p=>'№'+p.number+' · '+p.participant+' · '+p.car).join('; ')}</p></div>}
   </section>}
   <footer className="usd-report-footer"><span>USD · ВНУТРЕННИЙ ОТЧЁТ АДМИНИСТРАТОРА</span><small>Данные актуальны на момент формирования. Публикация результатов осуществляется отдельно.</small></footer>
  </article>}
 </PageFrame>;
}
