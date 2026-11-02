import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Pause,Play} from 'lucide-react';
import {publicResultUnit,publicResultValue} from '../public-result-utils';
import {carName,personName} from './premium-model';
import {Link,Photo} from './PremiumUI';
import {groupLiveByClass,otherHomepageRecords,resultClass,resultEntryNumber} from './home-results-model';

export function HomeResultRow({row}:{row:any}){
 const participant=row.participant??row.registration?.participant??row.result?.registration?.participant;
 const cls=resultClass(row),car=row.car??row.registration?.car??row.result?.registration?.car;
 const number=resultEntryNumber(row);
 const place=Number(row.place??row.position);
 const url=participant?.id&&participant?.isPublic!==false?'/participants/'+encodeURIComponent(participant.id):'/results';
 const value=row.value??row.result?.value??row.score;
 return <Link to={url} className="usd-score-row">
  <span className="usd-score-place"><b>{Number.isInteger(place)&&place>0?place:'—'}</b><small>МЕСТО</small></span>
  <Photo kind="participant" src={participant?.photoUrl} alt={personName(participant)} className="usd-score-avatar" fallback={<img src="/usd/usd-original.png" alt="" aria-hidden="true"/>}/>
  <span className="usd-score-identity"><b>{personName(participant)}</b><small>{number!==null?'№ '+String(number).padStart(3,'0')+' · ':''}{cls.name||'Класс не указан'}</small><small>{carName(car)}</small></span>
  <strong className="usd-score-value">{publicResultValue(value)}<small>{publicResultUnit(row.unit??cls.unit,cls)}</small></strong>
 </Link>;
}

export function LiveClassCarousel({rows}:{rows:any[]}){
 const groups=groupLiveByClass(rows),[index,setIndex]=useState(0),[paused,setPaused]=useState(false);
 const keys=groups.map(g=>g.key).join('|');
 useEffect(()=>setIndex(0),[keys]);
 useEffect(()=>{
  if(paused||groups.length<2||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const timer=window.setInterval(()=>setIndex(current=>(current+1)%groups.length),7000);
  return ()=>window.clearInterval(timer);
 },[keys,groups.length,paused]);
 const group=groups[index%groups.length];
 if(!group)return null;
 return <div className="usd-live-carousel" aria-label="Результаты по классам">
  <div className="usd-live-class-heading">
   <div><small>{group.direction||'НАПРАВЛЕНИЕ USD'}</small><h3>{group.name}</h3><span>{group.rows.length} {group.rows.length===1?'результат':group.rows.length<5?'результата':'результатов'}</span></div>
   {groups.length>1&&<div className="usd-carousel-controls"><span>{index%groups.length+1} / {groups.length}</span><button type="button" aria-label={paused?'Возобновить смену классов':'Приостановить смену классов'} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={18}/>:<Pause size={18}/>}</button><button type="button" aria-label="Предыдущий класс" onClick={()=>{setPaused(true);setIndex(i=>(i-1+groups.length)%groups.length)}}><ChevronLeft size={18}/></button><button type="button" aria-label="Следующий класс" onClick={()=>{setPaused(true);setIndex(i=>(i+1)%groups.length)}}><ChevronRight size={18}/></button></div>}
  </div>
  <div className="usd-live-class-entries" key={group.key} onScroll={()=>setPaused(true)}>{group.rows.map((r:any,i:number)=><HomeResultRow key={r.id??i} row={r}/>)}</div>
  {groups.length>1&&<div className="usd-carousel-dots" role="group" aria-label="Выбор класса">{groups.map((g,i)=><button type="button" key={g.key} aria-label={'Показать класс '+g.name} aria-pressed={i===index%groups.length} onClick={()=>{setPaused(true);setIndex(i)}}/>)}</div>}
 </div>;
}

export function RecordMinis({rows,bestId}:{rows:any[];bestId:string}){
 const records=otherHomepageRecords(rows,bestId),[page,setPage]=useState(0),[paused,setPaused]=useState(false);
 const total=Math.ceil(records.length/3);
 const keys=records.map(r=>r.id).join('|');
 useEffect(()=>setPage(0),[keys]);
 useEffect(()=>{
  if(paused||total<2||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const timer=window.setInterval(()=>setPage(p=>(p+1)%total),8500);
  return ()=>window.clearInterval(timer);
 },[keys,total,paused]);
 const current=page%Math.max(1,total);
 return <div className="usd-record-carousel">
  <div className="u-record-minis" aria-label="Другие рекорды USD">{records.slice(current*3,current*3+3).map(r=>{
   const cls=resultClass(r);
   return <Link key={r.id} to="/records"><b>{publicResultValue(r.value)}<small> {publicResultUnit(cls.unit??r.unit,cls)}</small></b><span>{cls.name||'Класс не указан'}</span><small>{cls.direction?.name}</small></Link>;
  })}</div>
  {total>1&&<div className="usd-record-controls"><button type="button" onClick={()=>{setPaused(true);setPage(p=>(p-1+total)%total)}} aria-label="Предыдущие рекорды"><ChevronLeft size={17}/></button><span>{current+1} / {total}</span><button type="button" aria-label={paused?'Возобновить ротацию рекордов':'Приостановить ротацию рекордов'} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={17}/>:<Pause size={17}/>}</button><button type="button" onClick={()=>{setPaused(true);setPage(p=>(p+1)%total)}} aria-label="Следующие рекорды"><ChevronRight size={17}/></button></div>}
 </div>;
}
