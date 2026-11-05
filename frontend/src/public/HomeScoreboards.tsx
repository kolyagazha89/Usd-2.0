import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight,Pause,Play} from 'lucide-react';
import {publicResultUnit,publicResultValue} from '../public-result-utils';
import {carName,personName} from './premium-model';
import {getPublicEntityPhotoUrl} from './public-entity-photo-url';
import {publicEntityPhotoSource} from './photo-source';
import {Link,Photo} from './PremiumUI';
import {groupLiveByClass,otherHomepageRecords,recordHolderName,resultClass,resultEntryNumber} from './home-results-model';

export function HomeResultRow({row}:{row:any}){
 const participant=row.participant??row.registration?.participant??row.result?.registration?.participant;
 const cls=resultClass(row),car=row.car??row.registration?.car??row.result?.registration?.car;
 const number=resultEntryNumber(row);
 const place=Number(row.place??row.position);
 const url=participant?.id&&participant?.isPublic!==false?'/participants/'+encodeURIComponent(participant.id):'/results';
 const value=row.value??row.result?.value??row.score;
 return <Link to={url} className="usd-score-row">
  <span className="usd-score-place"><b>{Number.isInteger(place)&&place>0?place:'—'}</b><small>МЕСТО</small></span>
  <Photo kind="participant" src={publicEntityPhotoSource('PARTICIPANT_PHOTO',participant,getPublicEntityPhotoUrl)} alt={personName(participant)} className="usd-score-avatar" fallback={<img src="/usd/usd-original.png" alt="" aria-hidden="true"/>}/>
  <span className="usd-score-identity"><b>{personName(participant)}</b><small>{number!==null?'№ '+String(number).padStart(3,'0')+' · ':''}{cls.name||'Класс не указан'}</small><small>{carName(car)}</small></span>
  <strong className="usd-score-value">{publicResultValue(value)}<small>{publicResultUnit(row.unit??cls.unit,cls)}</small></strong>
 </Link>;
}

export function LiveClassCarousel({rows}:{rows:any[]}){
 const groups=groupLiveByClass(rows),[index,setIndex]=useState(0),[paused,setPaused]=useState(false),[hovered,setHovered]=useState(false),[focused,setFocused]=useState(false);
 const keys=groups.map(g=>g.key).join('|');
 useEffect(()=>setIndex(0),[keys]);
 useEffect(()=>{
  if(paused||hovered||focused||groups.length<2||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const timer=window.setInterval(()=>setIndex(current=>(current+1)%groups.length),7000);
  return ()=>window.clearInterval(timer);
 },[keys,groups.length,paused,hovered,focused]);
 const group=groups[index%groups.length];
 if(!group)return null;
 return <div className="usd-live-carousel" aria-label="Результаты по классам" onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocusCapture={()=>setFocused(true)} onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false)}}>
  <div className="usd-live-class-heading">
   <div><small>{group.direction||'НАПРАВЛЕНИЕ USD'}</small><h3>{group.name}</h3><span>{group.rows.length} {group.rows.length===1?'результат':group.rows.length<5?'результата':'результатов'}</span></div>
   {groups.length>1&&<div className="usd-carousel-controls"><span>{index%groups.length+1} / {groups.length}</span><button type="button" aria-label={paused?'Возобновить смену классов':'Приостановить смену классов'} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={18}/>:<Pause size={18}/>}</button><button type="button" aria-label="Предыдущий класс" onClick={()=>{setPaused(true);setIndex(i=>(i-1+groups.length)%groups.length)}}><ChevronLeft size={18}/></button><button type="button" aria-label="Следующий класс" onClick={()=>{setPaused(true);setIndex(i=>(i+1)%groups.length)}}><ChevronRight size={18}/></button></div>}
  </div>
  <div className="usd-carousel-viewport" aria-label="Табло результатов по классам">
   <div className="usd-carousel-track" style={{transform:`translate3d(-${index%groups.length*100}%,0,0)`}}>
    {groups.map(g=><div key={g.key} className="usd-carousel-slide" aria-hidden={g.key!==group.key} inert={g.key!==group.key}>
     <div className="usd-live-class-entries" onScroll={()=>setPaused(true)}>{g.rows.map((r:any,i:number)=><HomeResultRow key={r.id??i} row={r}/>)}</div>
    </div>)}
   </div>
  </div>
  {groups.length>1&&<div className="usd-carousel-dots" role="group" aria-label="Выбор класса">{groups.map((g,i)=><button type="button" key={g.key} aria-label={'Показать класс '+g.name} aria-pressed={i===index%groups.length} onClick={()=>{setPaused(true);setIndex(i)}}/>)}</div>}
 </div>;
}

/** A full-width podium carousel: three records on desktop, two on phones.
 * Change the page size with the viewport so mobile never renders a single
 * skinny three-column strip or a vertically stacked trio.
 */
export function RecordMinis({rows,bestId}:{rows:any[];bestId:string}){
 const records=otherHomepageRecords(rows,bestId);
 const [perPage,setPerPage]=useState(3);
 const [page,setPage]=useState(0);
 const [paused,setPaused]=useState(false);
 const [hovered,setHovered]=useState(false);
 const [focused,setFocused]=useState(false);
 const keys=records.map(r=>r.id).join('|');
 const total=Math.ceil(records.length/perPage);
 useEffect(()=>{
  const media=window.matchMedia('(max-width: 680px)');
  const update=()=>setPerPage(media.matches?2:3);
  update();
  media.addEventListener('change',update);
  return ()=>media.removeEventListener('change',update);
 },[]);
 useEffect(()=>setPage(0),[keys,perPage]);
 useEffect(()=>{
  if(paused||hovered||focused||total<2||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const timer=window.setInterval(()=>setPage(p=>(p+1)%total),8500);
  return ()=>window.clearInterval(timer);
 },[keys,total,paused,hovered,focused]);
 if(!records.length)return null;
 const current=page%Math.max(1,total);
 return <div className="usd-record-carousel usd-record-podium" data-columns={perPage}
  onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
  onFocusCapture={()=>setFocused(true)}
  onBlurCapture={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setFocused(false)}}>
  <div className="usd-record-podium__heading">
   <span>ЕЩЁ РЕКОРДЫ USD</span>
   <small>Лучшие результаты по классам</small>
  </div>
  <div className="usd-record-viewport" aria-label="Карусель рекордов USD" aria-live="off">
   <div className="usd-record-track" style={{transform:`translate3d(-${current*100}%,0,0)`}}>
    {Array.from({length:total},(_,slide)=><div key={slide}
     className="u-record-minis usd-record-slide usd-record-podium__grid"
     aria-hidden={slide!==current} inert={slide!==current}>
     {records.slice(slide*perPage,slide*perPage+perPage).map(r=>{
      const cls=resultClass(r);
      return <Link key={r.id} to="/records" className="usd-record-podium__card">
       <span className="usd-record-podium__direction">{cls.direction?.name||'USD'}</span>
       <b className="usd-record-podium__number">{publicResultValue(r.value)}<small>{publicResultUnit(cls.unit??r.unit,cls)}</small></b>
       <span className="usd-record-podium__class">{cls.name||'Класс не указан'}</span>
       <span className="usd-record-podium__holder">{recordHolderName(r)}</span>
       <span className="usd-record-podium__corner" aria-hidden="true">↗</span>
      </Link>;
     })}
    </div>)}
   </div>
  </div>
  {total>1&&<div className="usd-record-controls usd-record-podium__controls">
   <button type="button" onClick={()=>{setPaused(true);setPage(p=>(p-1+total)%total)}} aria-label="Предыдущие рекорды"><ChevronLeft size={17}/></button>
   <span aria-label={`Страница ${current+1} из ${total}`}>{current+1} / {total}</span>
   <button type="button" aria-label={paused?'Возобновить ротацию рекордов':'Приостановить ротацию рекордов'} aria-pressed={paused} onClick={()=>setPaused(p=>!p)}>{paused?<Play size={17}/>:<Pause size={17}/>}</button>
   <button type="button" onClick={()=>{setPaused(true);setPage(p=>(p+1)%total)}} aria-label="Следующие рекорды"><ChevronRight size={17}/></button>
  </div>}
 </div>;
}
