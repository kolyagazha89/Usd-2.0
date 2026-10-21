import {useState,type ReactNode} from 'react';
import {Search,SlidersHorizontal} from 'lucide-react';
import {EmptyState} from './PremiumUI';
import {carName,personName} from './premium-model';
const classOf=(row:any)=>row.class??row.registrationClass?.class??row.result?.registrationClass?.class??{};
export default function PublicMeasurements({rows,children}:{rows:any[];children:(rows:any[])=>ReactNode}){
 const [query,Q]=useState(''),[direction,D]=useState(''),[cls,C]=useState(''),[limit,L]=useState(24);
 const directions=[...new Set(rows.map(r=>classOf(r).direction?.name).filter(Boolean))] as string[];
 const classes=[...new Set(rows.filter(r=>!direction||classOf(r).direction?.name===direction).map(r=>classOf(r).name).filter(Boolean))] as string[];
 const needle=query.trim().toLocaleLowerCase('ru');
 const filtered=rows.filter(r=>{const c=classOf(r),p=r.participant??r.registration?.participant??r.result?.registration?.participant,car=r.car??r.registration?.car??r.result?.registration?.car;return (!direction||c.direction?.name===direction)&&(!cls||c.name===cls)&&[personName(p),carName(car),p?.team,c.name,c.direction?.name].join(' ').toLocaleLowerCase('ru').includes(needle)});
 return <><div className="p-measurement-filters"><label className="p-search"><Search size={18} aria-hidden/><input aria-label="Поиск по измерениям" placeholder="Участник, автомобиль или класс" value={query} onChange={e=>{Q(e.target.value);L(24)}}/></label><label className="p-filter"><span><SlidersHorizontal size={13}/>Направление</span><select value={direction} onChange={e=>{D(e.target.value);C('');L(24)}}><option value="">Все направления</option>{directions.map(d=><option key={d}>{d}</option>)}</select></label><label className="p-filter"><span>Класс</span><select value={cls} onChange={e=>{C(e.target.value);L(24)}}><option value="">Все классы</option>{classes.map(c=><option key={c}>{c}</option>)}</select></label></div><div className="p-filter-summary"><span aria-live="polite">Найдено: {filtered.length}</span>{(query||direction||cls)&&<button type="button" onClick={()=>{Q('');D('');C('');L(24)}}>Сбросить фильтры ×</button>}</div>{filtered.length?children(filtered.slice(0,limit)):<EmptyState title="Таких измерений не нашли">Измените запрос или сбросьте фильтры.</EmptyState>}{filtered.length>limit&&<div className="p-show-more"><button type="button" className="u-btn u-quiet" onClick={()=>L(limit+24)}>Показать ещё {Math.min(24,filtered.length-limit)} <span aria-hidden>↓</span></button><span>{Math.min(limit,filtered.length)} из {filtered.length}</span></div>}</>;
}
