import {useEffect,useState} from 'react';
import {apiGet} from '../api';

export type TeamStagePerformance = {
  id: string;
  participant: {id:string;firstName:string;lastName:string};
  direction:string;className:string;value:string;unit:string;place:number|null;
};
export type TeamStageAchievementResponse = {
  teamId:string;teamName:string;scope:'CURRENT_PUBLIC_MEMBERS'|'FIRST_PASSED_INSPECTION';
  total:number;truncated:boolean;
  summary:{participants:number;podiums:number;firstPlaces:number;directions:Array<{name:string;performances:number}>};
  stages:Array<{id:string;name:string;city:string|null;date:string;performances:TeamStagePerformance[]}>;
};

export default function TeamStageAchievements({teamId,mode='current'}:{teamId:string;mode?:'current'|'inspected'}) {
 const inspected=mode==='inspected';
 const heading=inspected?'Выступления команды на этапах':'Выступления текущего состава по этапам';
 const [data,setData]=useState<TeamStageAchievementResponse|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [direction,setDirection]=useState('');
 useEffect(()=>{
  let active=true;
  setLoading(true);setError('');setDirection('');
  apiGet<TeamStageAchievementResponse>('/teams/public/'+encodeURIComponent(teamId)+(inspected?'/inspected-achievements':'/achievements'))
   .then(result=>{if(!result||!Array.isArray(result.stages)||!result.summary||!Array.isArray(result.summary.directions))throw new Error('Ответ сервера не содержит статистики команды');if(active)setData(result)})
   .catch(err=>{if(active)setError(err instanceof Error?err.message:'Не удалось загрузить выступления команды')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[teamId,retry,inspected]);
 const visibleStages=data?.stages.map(stage=>({
  ...stage,
  performances:stage.performances.filter(result=>!direction||result.direction===direction),
 })).filter(stage=>stage.performances.length>0)??[];
 const visibleCount=visibleStages.reduce((sum,stage)=>sum+stage.performances.length,0);
 return <section className="p-section team-stage-achievements" aria-label={heading}>
  <h3>{heading}</h3>
  <p className="team-achievement-disclaimer">{inspected
   ?'Команда зафиксирована при первой успешной инспекции автомобиля. Показаны только опубликованные личные результаты участников с публичным профилем. Старые этапы без подтверждённой фиксации не приписываются команде задним числом. Это не командный зачёт по очкам.'
   :'Показаны опубликованные результаты участников, состоящих в команде сейчас и разрешивших публичный показ профиля. Это не исторический командный зачёт: состав на дату старых соревнований мог отличаться.'}</p>
  {!loading&&!error&&data?.stages.length?<div className="team-achievement-overview">
   <div className="team-achievement-stats" aria-label={inspected?'Статистика проверенного состава':'Статистика личных результатов текущего состава'}>
    <p><strong>{data.summary.participants}</strong><span>участников с результатами</span></p>
    <p><strong>{data.summary.podiums}</strong><span>личных призовых мест</span></p>
    <p><strong>{data.summary.firstPlaces}</strong><span>личных первых мест</span></p>
   </div>
   <label className="team-achievement-filter">Направление
    <select aria-label="Фильтр выступлений по направлению" value={direction} onChange={e=>setDirection(e.target.value)}>
     <option value="">Все направления</option>
     {data.summary.directions.map(item=><option key={item.name} value={item.name}>{item.name} · {item.performances}</option>)}
    </select>
   </label>
  </div>:null}
  {loading?<p role="status">Загружаем результаты…</p>:error?<div role="alert"><p>{error}</p><button className="u-btn u-quiet" onClick={()=>setRetry(v=>v+1)}>Повторить загрузку</button></div>:data?.stages.length?
   <><p className="team-achievements-total">{visibleStages.length} этапов · {visibleCount} выступлений{direction?' в направлении '+direction:''}</p>
    <div className="team-stage-grid">{visibleStages.map(stage=><article className="team-stage-card" key={stage.id}>
     <header><h4>{stage.name}</h4><p>{[stage.city,new Date(stage.date).toLocaleDateString('ru-RU')].filter(Boolean).join(' · ')}</p></header>
     <ul>{stage.performances.map(result=><li key={result.id}>
      <div><strong>{result.participant.lastName} {result.participant.firstName}</strong><span>{result.direction} · {result.className}</span></div>
      <div className="team-achievement-measure"><strong>{result.value} {result.unit==='DB'?'дБ':result.unit==='MPS'?'м/с':result.unit}</strong>{result.place&&result.place>0?<span>{result.place}-е место</span>:<span>Результат опубликован</span>}</div>
     </li>)}</ul>
    </article>)}</div>
    {data.truncated&&<p className="team-achievement-disclaimer">Статистика и фильтры рассчитаны только по первым 500 результатам {inspected?'проверенного':'текущего'} состава, а не по полному архиву. Полный исторический архив доступен в разделе результатов USD.</p>}
   </>:<p>{inspected?'Пока нет опубликованных результатов с подтверждённым составом на инспекции.':'У текущего публичного состава пока нет опубликованных результатов.'}</p>}
 </section>;
}
