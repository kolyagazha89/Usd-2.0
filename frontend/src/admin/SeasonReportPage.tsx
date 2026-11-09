import './season-report.css';
import {useEffect,useState} from 'react';
import {Printer} from 'lucide-react';
import {apiGet,listData} from '../api';
import {compareSeasonClasses} from './season-comparison';

type Totals={stages:number;registered:number;registrations:number;classEntries:number;actualParticipants:number;results:number;teams:number;podiums:number;records:number};
type SeasonReport={
 season:{id:string;name:string;year:number};generatedAt:string;totals:Totals;
 stages:Array<{id:string;name:string;stageNumber:number;registered:number;actual:number}>;
 directions:Array<{id:string;name:string;athletes:number;classEntries:number;actualAthletes:number;results:number;classes:Array<{id:string;name:string;athletes:number;classEntries:number;actualAthletes:number;results:number}>}>;
 notes:string[];
};
type Comparison={baseline:SeasonReport;current:SeasonReport;changes:Record<keyof Totals,{difference:number;percent:number|null}>};
const labels:Record<keyof Totals,string>={
 stages:'Проведено этапов',registered:'Уникальных спортсменов с заявкой',registrations:'Активных регистраций',
 classEntries:'Заявок в классы',actualParticipants:'Спортсменов с результатами',results:'Результатов',
 teams:'Команд',podiums:'Подиумов',records:'Рекордов (без BassRace)',
};
const formatChange=(change:{difference:number;percent:number|null})=>
 (change.difference>0?'+':'')+change.difference+' · '+(change.percent===null?'н/д':(change.percent>0?'+':'')+change.percent+'%');
function SeasonReportPage({PageFrame,LoadingPage,ErrorPanel}:{PageFrame:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>}){
 const [seasons,setSeasons]=useState<Array<{id:string;name:string;year:number}>>([]);
 const [seasonId,setSeasonId]=useState(''),[baselineId,setBaselineId]=useState('');
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [report,setReport]=useState<SeasonReport|null>(null),[comparison,setComparison]=useState<Comparison|null>(null);
 useEffect(()=>{let alive=true;apiGet<any>('/seasons').then(r=>{
  if(!alive)return;const rows=listData<{id:string;name:string;year:number}>(r).sort((a,b)=>b.year-a.year);
  setSeasons(rows);setSeasonId(rows[0]?.id||'');
 }).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Не удалось получить сезоны')}).finally(()=>{if(alive)setLoading(false)});
  return()=>{alive=false};
 },[]);
 useEffect(()=>{if(!seasonId){setReport(null);return}let alive=true;setBusy(true);setError('');
  const qs=baselineId&&baselineId!==seasonId?'?compare='+encodeURIComponent(baselineId):'';
  apiGet<any>('/statistics/season-report/'+encodeURIComponent(seasonId)+qs).then(r=>{
   if(!alive)return;setReport(r.report||null);setComparison(r.comparison||null);
  }).catch(e=>{if(alive){setError(e instanceof Error?e.message:'Не удалось сформировать отчёт');setReport(null);setComparison(null)}}).finally(()=>{if(alive)setBusy(false)});
  return()=>{alive=false};
 },[seasonId,baselineId]);
 const selectedYear=seasons.find(s=>s.id===seasonId)?.year;
 const classComparison=comparison&&report?compareSeasonClasses(comparison.baseline,report):[];
 return <PageFrame className="usd-season-report-page" title="Отчёт по сезону" subtitle="Участники, классы, направления и сравнение сезонов. Данные из USD без расчётной выручки."
  action={<button type="button" className="primary-button compact" disabled={!report||busy||loading} onClick={()=>window.print()}><Printer size={16} aria-hidden="true"/>Печать / PDF</button>}>
  <section className="season-report-filters">
   <label>Сезон<select value={seasonId} onChange={event=>setSeasonId(event.target.value)}><option value="">Выберите сезон</option>{seasons.map(s=><option value={s.id} key={s.id}>{s.year} · {s.name}</option>)}</select></label>
   <label>Сравнить с<select value={baselineId} onChange={event=>setBaselineId(event.target.value)}><option value="">Без сравнения</option>{seasons.filter(s=>s.id!==seasonId).map(s=><option value={s.id} key={s.id}>{s.year} · {s.name}</option>)}</select></label>
  </section>
  {loading||busy?<LoadingPage/>:error?<ErrorPanel message={error}/>:!report?<p className="muted">Пока нет данных для выбранного сезона.</p>:<article className="season-report-document" aria-label="Сводка сезона USD">
   <div className="season-report-intro"><strong>Сезон {selectedYear}</strong><small>Сформировано {new Date(report.generatedAt).toLocaleString('ru-RU')}</small></div>
   <div className="season-report-metrics">{(Object.keys(labels) as Array<keyof Totals>).map(key=><div className="season-report-metric" key={key}><span>{labels[key]}</span><strong>{report.totals[key].toLocaleString('ru-RU')}</strong>{comparison&&<small>К {comparison.baseline.season.year}: {formatChange(comparison.changes[key])}</small>}</div>)}</div>
   <section className="season-report-section"><h2>Этапы сезона</h2><div className="season-report-table-wrap"><table><thead><tr><th>Этап</th><th>Спортсмены с заявками</th><th>С результатами</th></tr></thead><tbody>{report.stages.map(stage=><tr key={stage.id}><th scope="row">{stage.stageNumber}. {stage.name}</th><td data-label="С заявками">{stage.registered}</td><td data-label="С результатами">{stage.actual}</td></tr>)}</tbody></table></div></section>
   <section className="season-report-section"><h2>Направления и классы</h2>{report.directions.length===0?<p>Нет зарегистрированных классов в сезоне.</p>:report.directions.map(direction=><div className="season-report-direction" key={direction.id}><h3>{direction.name}</h3><p>{direction.athletes} уникальных спортсменов · {direction.classEntries} заявок в классы · {direction.actualAthletes} с результатами</p><div className="season-report-table-wrap"><table><thead><tr><th>Класс</th><th>Спортсменов</th><th>Заявок</th><th>С результатами</th></tr></thead><tbody>{direction.classes.map(item=><tr key={item.id}><th scope="row">{item.name}</th><td data-label="Спортсменов">{item.athletes}</td><td data-label="Заявок">{item.classEntries}</td><td data-label="С результатами">{item.actualAthletes}</td></tr>)}</tbody></table></div></div>)}</section>

   {comparison&&<section className="season-report-section" aria-label="Сравнение классов двух сезонов">
    <h2>Динамика по классам · {comparison.baseline.season.year} → {report.season.year}</h2>
    <p>Сопоставляются только одинаковые идентификаторы классов внутри неизменённого направления. Новые, упразднённые или переименованные классы не сопоставимы без подтверждённой связи регламентов.</p>
    <div className="season-report-table-wrap"><table><thead><tr><th>Направление / класс</th><th>{comparison.baseline.season.year}: спортсменов</th><th>{report.season.year}: спортсменов</th><th>Изменение</th></tr></thead><tbody>
     {classComparison.map(row=><tr key={row.classId}>
      <th scope="row">{row.direction} · {row.className}{row.baselineName&&row.baselineName!==row.className&&<small>Ранее: {row.baselineName}</small>}</th>
      <td data-label="Базовый сезон">{row.baselineAthletes??'—'}</td><td data-label="Текущий сезон">{row.currentAthletes??'—'}</td>
      <td data-label="Изменение">{row.comparable?(row.difference!>0?'+':'')+row.difference+' · '+(row.percent===null?'н/д':(row.percent>0?'+':'')+row.percent+'%'):'не сопоставимы'}</td>
     </tr>)}
    </tbody></table></div>
   </section>}
   <p className="season-report-notes">{report.notes.join(' ')}</p>
  </article>}
 </PageFrame>;
}
export default SeasonReportPage;
