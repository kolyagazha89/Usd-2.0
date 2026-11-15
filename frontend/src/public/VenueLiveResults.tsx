import {useEffect,useMemo,useState,type CSSProperties} from 'react';
import {apiGet} from '../api';
import {buildVenueTvSlides,groupVenueLiveRows,isVenueLiveSnapshotCurrent,
 parseVenueTvMode,venueLiveRowsPerScreen,type VenueLiveSnapshot,type VenueTvMode} from './venue-live-model';
import './venue-live.css';

const POLL_MS=4000;
const TV_ROTATE_MS=9000;
const SPL_URL='/venue/live?screen=spl';
const COMBINED_URL='/venue/live?screen=bfspl-bdw';
const ALL_URL='/venue/live';

function initialTvMode():VenueTvMode{
 return parseVenueTvMode(new URLSearchParams(window.location.search).get('screen'));
}
function labelUnit(value:string){
 return value.toUpperCase()==='DB'?'дБ':value;
}

/** Shared LAN-only read-only scoreboard. Each TV can pin its own direction URL. */
export default function VenueLiveResults(){
 const [snapshot,setSnapshot]=useState<VenueLiveSnapshot|null>(null);
 const [lastSuccess,setLastSuccess]=useState<number|null>(null);
 const [failed,setFailed]=useState(false);
 const [clock,setClock]=useState(Date.now());
 const [mode,setMode]=useState<VenueTvMode>(initialTvMode);
 const [slideIndex,setSlideIndex]=useState(0);
 const [paused,setPaused]=useState(false);
 const [fullscreen,setFullscreen]=useState(false);
 const [viewport,setViewport]=useState(()=>({height:window.innerHeight,width:window.innerWidth}));

 useEffect(()=>{
  let alive=true,loading=false;
  const load=async()=>{
   if(loading||!alive||document.hidden)return;
   loading=true;
   try{
    const response=await apiGet<VenueLiveSnapshot>('/results/venue-live');
    if(!alive)return;
    if(!response?.stage?.id||!Array.isArray(response.rows))throw new Error('Неверный ответ локального сервера');
    setSnapshot(response);setLastSuccess(Date.now());setFailed(false);
   }catch{if(alive)setFailed(true)}
   finally{loading=false;if(alive)setClock(Date.now())}
  };
  void load();
  const timer=window.setInterval(()=>{setClock(Date.now());void load()},POLL_MS);
  const onVisible=()=>{if(!document.hidden)void load()};
  document.addEventListener('visibilitychange',onVisible);
  return()=>{alive=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisible)};
 },[]);
 useEffect(()=>{
  const resize=()=>setViewport({height:window.innerHeight,width:window.innerWidth});
  const syncFullscreen=()=>setFullscreen(Boolean(document.fullscreenElement));
  window.addEventListener('resize',resize);
  document.addEventListener('fullscreenchange',syncFullscreen);
  return()=>{window.removeEventListener('resize',resize);document.removeEventListener('fullscreenchange',syncFullscreen)};
 },[]);
 const groups=useMemo(()=>groupVenueLiveRows(snapshot?.rows??[]),[snapshot]);
 const capacity=venueLiveRowsPerScreen(viewport.height,viewport.width);
 const slides=useMemo(()=>buildVenueTvSlides(groups,capacity,mode),[groups,capacity,mode]);
 const slide=slides[slideIndex%slides.length];
 const currentPosition=slideIndex%slides.length;
 useEffect(()=>{
  const timer=window.setInterval(()=>{
   if(!paused&&!document.hidden)setSlideIndex(index=>(index+1)%Math.max(1,slides.length));
  },TV_ROTATE_MS);
  return()=>window.clearInterval(timer);
 },[paused,slides.length]);
 const changeMode=(next:VenueTvMode)=>{
  setMode(next);setSlideIndex(0);
  const target=next==='spl'?SPL_URL:next==='bfspl-bdw'?COMBINED_URL:ALL_URL;
  window.history.replaceState(window.history.state,'',target);
 };
 const nextSlide=()=>setSlideIndex(index=>(index+1)%slides.length);
 const previousSlide=()=>setSlideIndex(index=>(index-1+slides.length)%slides.length);
 const toggleFullscreen=async()=>{
  try{
   if(document.fullscreenElement){await document.exitFullscreen();}
   else{await document.documentElement.requestFullscreen();}
  }catch{/* Browser may deny fullscreen without a desktop gesture. */}
 };
 useEffect(()=>{
  const onKey=(event:KeyboardEvent)=>{
   if(event.key==='ArrowRight'){event.preventDefault();nextSlide();}
   if(event.key==='ArrowLeft'){event.preventDefault();previousSlide();}
   if(event.code==='Space'&&!(event.target instanceof HTMLButtonElement)){
    event.preventDefault();setPaused(value=>!value);
   }
  };
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[slides.length]);
 const fresh=!failed&&isVenueLiveSnapshotCurrent(lastSuccess,clock);
 const rowStyle={'--venue-board-rows':Math.max(slide.rows.length,1)} as CSSProperties;
 return <main className="usd-venue-live-board" aria-label="USD LIVE — экран соревнований">
  <header className="venue-tv-top">
   <div className="venue-tv-identity">
    <span className="venue-tv-logo">USD</span>
    <div className="venue-tv-identity-text">
     <span className="venue-tv-eyebrow">ULTIMATE SOUND DESTRUCTION · LIVE</span>
     <h1>{snapshot?.stage.name??'Подключение к этапу USD…'}</h1>
     <small>{snapshot?.stage.city??'Локальная площадка'} · Сохранены результаты площадки</small>
    </div>
   </div>
   <div className="venue-tv-control">
    <span className={'venue-live-status'+(fresh?' is-connected':' is-disconnected')} role="status">
     <i aria-hidden="true"/>{fresh?'LIVE · подключено':'Нет соединения с локальным сервером'}
    </span>
    <button type="button" onClick={()=>void toggleFullscreen()} title="Полноэкранный режим телевизора">
     {fullscreen?'Выйти из полного экрана':'На весь экран'}
    </button>
   </div>
  </header>
  <nav className="venue-tv-switch" aria-label="Направления на телевизоре">
   <div className="venue-tv-direction-links">
    <a href={ALL_URL} aria-current={mode==='all'?'page':undefined}
     onClick={event=>{event.preventDefault();changeMode('all')}}>Автопоказ</a>
    <a href={SPL_URL} aria-current={mode==='spl'?'page':undefined}
     onClick={event=>{event.preventDefault();changeMode('spl')}}>Только SPL</a>
    <a href={COMBINED_URL} aria-current={mode==='bfspl-bdw'?'page':undefined}
     onClick={event=>{event.preventDefault();changeMode('bfspl-bdw')}}>BFSPL + BDW SPL</a>
   </div>
   <div className="venue-tv-remote">
    <button type="button" onClick={previousSlide} aria-label="Предыдущий класс">‹</button>
    <button type="button" onClick={()=>setPaused(value=>!value)} aria-pressed={paused}>
     {paused?'▶ Продолжить':'Ⅱ Пауза'}
    </button>
    <button type="button" onClick={nextSlide} aria-label="Следующий класс">›</button>
   </div>
  </nav>
  <section className="venue-tv-content" aria-label="Текущая таблица результатов">
   <div className="venue-tv-class-heading">
    <div className="venue-tv-class-titles">
     <span className="venue-tv-discipline">{slide.heading}</span>
     <h2>{slide.group?.name??'Ожидание результатов'}</h2>
    </div>
    <div className="venue-tv-counters">
     <strong>{slide.group?slide.group.rows.length:0} результатов</strong>
     {slide.pages>1&&<span>Страница {slide.page}/{slide.pages}</span>}
     <span>Класс {currentPosition+1} из {slides.length}</span>
    </div>
   </div>
   {slide.group?<div className="venue-tv-table" role="table"
    aria-label={slide.heading+' · '+slide.group.name} style={rowStyle}>
    <div className="venue-tv-table-head" role="row">
     <span role="columnheader">Место</span>
     <span role="columnheader">Старт №</span>
     <span role="columnheader">Участник / автомобиль</span>
     <span role="columnheader">Результат</span>
    </div>
    {slide.rows.map(row=><div className="venue-tv-result" key={row.id} role="row">
     <strong className="venue-tv-place" role="cell">{row.place??'—'}</strong>
     <b className="venue-tv-number" role="cell">{row.number??'—'}</b>
     <span className="venue-tv-person" role="cell">
      <strong title={row.participant}>{row.participant}</strong>
      <small title={row.car}>{row.car}</small>
     </span>
     <strong className="venue-tv-measure" role="cell">
      {row.value}<small>{labelUnit(row.unit)}</small>
     </strong>
    </div>)}
   </div>:<div className="venue-tv-empty">
    {failed&&!snapshot?'Табло не может подключиться к ноутбуку. Проверьте Wi-Fi USD и локальный сервер.':
     'В этом направлении результатов пока нет. Как только судья внесёт измерение, оно появится автоматически.'}
   </div>}
  </section>
  <footer className="venue-tv-footer">
   <div className="venue-tv-progress" aria-label={'Экран '+(currentPosition+1)+' из '+slides.length}>
    {slides.map((item,index)=><span key={item.id} className={index===currentPosition?'is-active':''}/>)}
   </div>
   <div className="venue-tv-footer-details">
    <span>USD · ЛОКАЛЬНАЯ СЕТЬ · НЕОФИЦИАЛЬНЫЕ РЕЗУЛЬТАТЫ</span>
    <span>{paused?'Показ остановлен':'Автосмена каждые 9 секунд'} · {lastSuccess?
     'Данные '+new Date(lastSuccess).toLocaleTimeString('ru-RU'):'Ожидание первой загрузки'}</span>
   </div>
  </footer>
 </main>;
}
