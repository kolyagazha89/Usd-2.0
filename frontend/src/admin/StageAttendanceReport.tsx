import {AdminEntityLink} from './AdminEntityLink';
import type {buildStageAttendanceReport} from './stage-attendance-report';
type Report=ReturnType<typeof buildStageAttendanceReport>;
type R=Report['registrations'][number];
const sourceLabel={PRE_REGISTRATION:'Предварительно',ON_SITE:'На площадке',IMPORT:'Импорт',UNKNOWN:'Не указан'};
const inspectionLabel=(s:string)=>s==='PASSED'?'Допущен':s==='FAILED'?'Не допущен':'Нет инспекции';
const fmt=(n:number|null)=>n===null?'—':String(n).padStart(3,'0');
const time=(value:unknown)=>{if(!value)return '—';const date=new Date(String(value));return Number.isNaN(date.getTime())?'—':date.toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК'};
const unit=(s:string)=>s==='DB'?'дБ':s==='MPS'?'м/с':s==='OTHER'?'':s;
const metrics=(items:[string,number|string][])=> <div className="usd-report-metrics">{items.map(([label,value])=><div key={label} className="usd-report-metric"><strong>{value}</strong><span>{label}</span></div>)}</div>;
const rate=(a:number,b:number)=>b?Math.round(a/b*100)+'%':'—';
function PeopleTable({rows,label}:{rows:R[];label:string}){
 return rows.length?<div className="usd-report-table-wrap"><table className="usd-report-table usd-report-detail-table" aria-label={label}><thead><tr><th>№ / ФИО</th><th>Авто / город</th><th>Источник / время</th><th>Инспекция</th><th>Классы и замеры</th></tr></thead><tbody>
  {rows.map(r=><tr key={r.id}><td data-label="Участник"><strong>№{fmt(r.number)} · <AdminEntityLink kind="participant" id={r.personId}>{r.participant}</AdminEntityLink></strong><small>{r.team}</small></td>
   <td data-label="Авто"><AdminEntityLink kind="car" id={r.carId}>{r.car}</AdminEntityLink><small>{[r.plate,r.city].filter(Boolean).join(' · ')||'—'}</small></td>
   <td data-label="Регистрация">{sourceLabel[r.source]}<small>{time(r.registeredAt)}</small>{r.status==='CANCELLED'&&<small>Отменена</small>}</td>
   <td data-label="Инспекция">{inspectionLabel(r.inspection)}<small>{time(r.inspectedAt)}</small>{r.inspector&&<small>Судья: {r.inspector}</small>}{r.reason&&<small>{r.reason}</small>}</td>
   <td data-label="Классы"><div>{r.classes.length===0?'Классы не указаны':r.classes.map(c=><div key={c.classId}>№{fmt(c.number)} · {c.direction} / {c.name}<small>{c.measured?c.results.map(m=>m.value+' '+unit(m.unit)+(m.place?' · место '+m.place:'')).join('; '):'Результат отсутствует'}</small></div>)}</div></td>
  </tr>)}
 </tbody></table></div>:<p className="usd-report-empty">Нет записей.</p>;
}
type Group=Report['directions'][number];
function CompletionTable({rows,label}:{rows:(Group&{direction?:string})[];label:string}){
 return rows.length?<div className="usd-report-table-wrap"><table className="usd-report-table usd-report-detail-table" aria-label={label}><thead><tr><th>Направление / класс</th><th>Заявки / люди / авто</th><th>Предв. / на месте / прочие</th><th>Допуск / отказ / нет проверки</th><th>С замером / без замера (допущ.)</th><th>Без признаков явки (предв.)</th></tr></thead><tbody>
 {rows.map(r=><tr key={r.id}><td data-label="Направление / класс"><strong>{r.direction?r.direction+' · ':''}{r.name}</strong></td><td data-label="Заявки / люди / авто">{r.entries} / {r.people} / {r.cars}</td><td data-label="Предв. / на месте / прочие">{r.pre} / {r.onSite} / {r.other}</td><td data-label="Допуск / отказ / ожидание">{r.passed} / {r.failed} / {r.pending}</td><td data-label="С замером / без замера"><strong>{r.measured} / {r.missing}</strong>{r.measuredWithoutAdmission>0&&<small>Без текущего допуска: {r.measuredWithoutAdmission}</small>}</td><td data-label="Нет признаков явки">{r.unconfirmed}</td></tr>)}
 </tbody></table></div>:<p className="usd-report-empty">Классы не назначены.</p>;
}
export default function StageAttendanceReport({report:r}:{report:Report}){
 return <>
 <section className="usd-report-section" aria-label="Регистрации и явка">
  <div className="usd-report-heading"><h3>Регистрации и явка</h3><span>По данным этапа</span></div>
  {metrics([['Всего регистраций в базе',r.total],['Активных',r.active],['Отменённых',r.cancelled],['Уникальных участников',r.people],['Автомобилей',r.cars],['Предварительно · активных',r.sources[0].active],['На площадке · активных',r.sources[1].active],['Регистраций с признаками явки',r.arrivalEvidence],['Людей с признаками явки',r.arrivalPeople],['Предварительных без признаков явки',r.unconfirmed.length],['Людей без признаков явки',r.unconfirmedPeople.length],['Явка по предварительным заявкам',rate(r.sources[0].arrivalEvidence,r.sources[0].active)]])}
  <p className="usd-report-help">Признаки явки: регистрация на площадке, решение инспекции или сохранённый результат. Неявка не подтверждена, если признаков нет. Отдельной отметки физического въезда в базе нет. Источник и статус отражают текущую запись, а не полную историю её изменений. Люди считаются по ID, а не ФИО.</p>
  <div className="usd-report-table-wrap"><table className="usd-report-table usd-report-detail-table" aria-label="Источники регистраций"><thead><tr><th>Источник</th><th>Всего / активны / отменены</th><th>Люди / авто (активные)</th><th>Признаки явки</th><th>Допущены / отказ / ожидание</th></tr></thead><tbody>{r.sources.map(s=><tr key={s.source}><td data-label="Источник">{sourceLabel[s.source]}</td><td data-label="Всего / активны / отменены">{s.total} / {s.active} / {s.cancelled}</td><td data-label="Люди / авто">{s.people} / {s.cars}</td><td data-label="Признаки явки">{s.arrivalEvidence}</td><td data-label="Допуск / отказ / ожидание">{s.passed} / {s.failed} / {s.pending}</td></tr>)}</tbody></table></div>
 </section>
 <section className="usd-report-section">
  <div className="usd-report-heading"><h3>Допуск и выполнение замеров</h3><span>Только активные регистрации</span></div>
  {metrics([['Инспекция проведена',r.inspected],['Допущены',r.passed],['Не допущены',r.failed],['Нет инспекции',r.pending],['Заявки на классы',r.entries],['Классы с сохранённым замером',r.measured],['Допущенные классы без замера',r.missing],['Людей без замера хотя бы в одном классе',r.missingPeople],['Людей с результатом',r.measuredPeople],['Все классы закрыты (допущенные регистрации)',r.complete],['Частично закрыты',r.partial],['Нет ни одного замера',r.noMeasurements],['Допущены без классов',r.noClasses],['Классы с замером без текущего допуска',r.measuredWithoutAdmission],['Результаты вне текущих классов',r.orphanResults]])}
  <p className="usd-report-help">Сохранённое измерение, даже 0, считается внесённым. Дубли измерений не увеличивают число закрытых классов. Спортивная статистика ниже отдельно учитывает только допустимые результаты.</p>
 </section>
 <section className="usd-report-section"><div className="usd-report-heading"><h3>Выполнение по направлениям</h3></div><CompletionTable rows={r.directions} label="Замеры по направлениям"/></section>
 <section className="usd-report-section"><div className="usd-report-heading"><h3>Выполнение по классам</h3></div><CompletionTable rows={r.classes} label="Замеры по классам"/></section>
 <section className="usd-report-section usd-report-detail-section"><div className="usd-report-heading"><h3>Предварительные заявки без признаков явки</h3><span>{r.unconfirmed.length} регистраций · {r.unconfirmedPeople.length} человек без признаков явки на любой машине</span></div><p className="usd-report-help">Неявка не подтверждена. Сверьте с судьёй въезда перед принятием решений. Если у человека есть признаки явки по другой машине, он не входит в число отсутствующих людей.</p><PeopleTable rows={r.unconfirmed} label="Предварительные заявки без признаков явки"/></section>
 <section className="usd-report-section usd-report-detail-section"><div className="usd-report-heading"><h3>Допущенные классы без замера</h3><span>{r.missing} заявок</span></div><p className="usd-report-help">Это список невнесённых результатов, а не подтверждённых отказов выезжать.</p>
 {r.missingRows.length?<div className="usd-report-table-wrap"><table className="usd-report-table usd-report-detail-table" aria-label="Допущенные классы без замера"><thead><tr><th>Направление / класс</th><th>№</th><th>Участник</th><th>Авто / госномер</th></tr></thead><tbody>{r.missingRows.map(c=><tr key={c.classId}><td data-label="Класс">{c.direction} · {c.name}</td><td data-label="№">{fmt(c.number)}</td><td data-label="Участник"><AdminEntityLink kind="participant" id={c.personId}>{c.participant}</AdminEntityLink><small>{c.team}</small></td><td data-label="Авто">{c.car}<small>{c.plate||'—'}</small></td></tr>)}</tbody></table></div>:<p className="usd-report-empty">Нет незакрытых допущенных классов.</p>}
 </section>
 <section className="usd-report-section usd-report-detail-section"><div className="usd-report-heading"><h3>Не прошли инспекцию</h3><span>{r.failed}</span></div><PeopleTable rows={r.registrations.filter(x=>x.status==='ACTIVE'&&x.inspection==='FAILED')} label="Не прошли инспекцию"/></section>
 <section className="usd-report-section usd-report-detail-section"><div className="usd-report-heading"><h3>Без решения инспекции</h3><span>{r.pending}</span></div><PeopleTable rows={r.registrations.filter(x=>x.status==='ACTIVE'&&x.inspection==='PENDING')} label="Без решения инспекции"/></section>
 <section className="usd-report-section usd-report-detail-section"><div className="usd-report-heading"><h3>Отменённые регистрации</h3><span>{r.cancelled}</span></div><PeopleTable rows={r.registrations.filter(x=>x.status==='CANCELLED')} label="Отменённые регистрации"/></section>
 <section className="usd-report-section usd-report-detail-section"><div className="usd-report-heading"><h3>Полный реестр этапа</h3><span>{r.total} регистраций</span></div><PeopleTable rows={r.registrations} label="Полный реестр этапа"/></section>
 </>;
}
