import {useEffect,useMemo,useState} from 'react';
import {apiGet} from '../api';
import {groupVenueLiveRows,isVenueLiveSnapshotCurrent,type VenueLiveSnapshot} from './venue-live-model';
import './venue-live.css';

const POLL_MS=4000;

/** Local Wi-Fi results screen; public DNS or a central JWT is not required. */
export default function VenueLiveResults(){
 const [snapshot,setSnapshot]=useState<VenueLiveSnapshot|null>(null);
 const [lastSuccess,setLastSuccess]=useState<number|null>(null);
 const [failed,setFailed]=useState(false);
 const [clock,setClock]=useState(Date.now());
 const [selectedDirection,setSelectedDirection]=useState('');
 const [projector,setProjector]=useState(false);
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
 const groups=useMemo(()=>groupVenueLiveRows(snapshot?.rows??[]),[snapshot]);
 const directions=[...new Set(groups.map(group=>group.direction))];
 const visible=groups.filter(group=>!selectedDirection||group.direction===selectedDirection);
 const fresh=!failed&&isVenueLiveSnapshotCurrent(lastSuccess,clock);
 return <main className={'usd-venue-live-board'+(projector?' is-projector':'')}>
  <header className="venue-live-header">
   <div className="venue-live-brand"><span className="venue-live-logo">USD</span>
    <div><span className="venue-live-overline">ULTIMATE SOUND DESTRUCTION / LAN</span>
     <h1>LIVE РЕЗУЛЬТАТЫ</h1></div>
   </div>
   <div className="venue-live-actions">
    <span className={'venue-live-status '+(fresh?'is-connected':'is-disconnected')} role="status" aria-live="polite">
     <i aria-hidden="true"/>{fresh?'Локальный сервер подключён':'Нет соединения с локальным сервером'}
    </span>
    <button type="button" onClick={()=>setProjector(value=>!value)}
     aria-pressed={projector}>{projector?'Обычный вид':'На большой экран'}</button>
   </div>
  </header>
  <section className="venue-live-stage">
   <div><span>ТАБЛО СОРЕВНОВАНИЙ</span>
    <h2>{snapshot?.stage.name??'Подключение к этапу USD…'}</h2>
    <p>{snapshot?.stage.city??'Локальная площадка'} · {snapshot?.rows.length??0} результатов</p>
   </div>
   <div className="venue-live-note">
    <b>Сохранены результаты площадки</b>
    <small>{lastSuccess?new Date(lastSuccess).toLocaleTimeString('ru-RU'):'Ожидание первой загрузки'}</small>
    <small>{fresh?'Обновление каждые 4 секунды':'Показана последняя загруженная версия; новые измерения пока не поступают'}</small>
   </div>
  </section>
  {failed&&!snapshot&&<div className="venue-live-error" role="alert">
   Табло не может подключиться к ноутбуку. Проверьте Wi-Fi USD и адрес локального сервера.
  </div>}
  {directions.length>1&&<nav className="venue-live-filters" aria-label="Направление">
   <button type="button" aria-pressed={!selectedDirection} onClick={()=>setSelectedDirection('')}>Все направления</button>
   {directions.map(direction=><button type="button" key={direction}
    aria-pressed={direction===selectedDirection}
    onClick={()=>setSelectedDirection(direction)}>{direction}</button>)}
  </nav>}
  {!groups.length&&snapshot&&<p className="venue-live-empty">
   Результатов пока нет. Как только судья внесёт измерение в локальную базу, оно появится здесь автоматически.
  </p>}
  <div className="venue-live-groups">{visible.map(group=><section className="venue-live-class" key={group.key}>
   <header><span>{group.direction}</span><h3>{group.name}</h3><small>{group.rows.length} результатов</small></header>
   <div className="venue-live-table" role="table" aria-label={group.name}>
    <div role="row" className="venue-live-table-head">
     <span role="columnheader">Место</span><span role="columnheader">Старт №</span>
     <span role="columnheader">Участник / автомобиль</span><span role="columnheader">Результат</span>
    </div>
    {group.rows.map(row=><div className="venue-live-row" role="row" key={row.id}>
     <strong role="cell" className="venue-live-place">{row.place??'—'}</strong>
     <span role="cell" className="venue-live-number">{row.number??'—'}</span>
     <span role="cell" className="venue-live-person"><b>{row.participant}</b><small>{row.car}</small></span>
     <strong role="cell" className="venue-live-value">{row.value}<small>{row.unit}</small></strong>
    </div>)}
   </div>
  </section>)}</div>
  <footer className="venue-live-footer">
   <span>USD · ЛОКАЛЬНАЯ СЕТЬ · БЕЗ ПУБЛИЧНОГО ИНТЕРНЕТА</span>
   <span>Неофициальные результаты площадки. Публикация — отдельно.</span>
   <a href="/admin/event-day">Рабочий экран судьи ↗</a>
  </footer>
 </main>;
}
