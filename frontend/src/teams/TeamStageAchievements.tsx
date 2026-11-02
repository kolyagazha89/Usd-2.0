import {useEffect,useState} from 'react';
import {apiGet} from '../api';

export type TeamStagePerformance = {
  id: string;
  participant: {id:string;firstName:string;lastName:string};
  direction:string;className:string;value:string;unit:string;place:number|null;
};
export type TeamStageAchievementResponse = {
  teamId:string;teamName:string;scope:'CURRENT_PUBLIC_MEMBERS';
  total:number;truncated:boolean;
  stages:Array<{id:string;name:string;city:string|null;date:string;performances:TeamStagePerformance[]}>;
};

export default function TeamStageAchievements({teamId}:{teamId:string}) {
 const [data,setData]=useState<TeamStageAchievementResponse|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let active=true;
  setLoading(true);setError('');
  apiGet<TeamStageAchievementResponse>('/teams/public/'+encodeURIComponent(teamId)+'/achievements')
   .then(result=>{if(active)setData(result)})
   .catch(err=>{if(active)setError(err instanceof Error?err.message:'Не удалось загрузить выступления команды')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[teamId,retry]);
 return <section className="p-section team-stage-achievements" aria-label="Выступления текущего состава по этапам">
  <h3>Выступления по этапам</h3>
  <p className="team-achievement-disclaimer">Показаны опубликованные результаты участников, состоящих в команде сейчас и разрешивших публичный показ профиля. Это не исторический командный зачёт: состав на дату старых соревнований мог отличаться.</p>
  {loading?<p role="status">Загружаем результаты…</p>:error?<div role="alert"><p>{error}</p><button className="u-btn u-quiet" onClick={()=>setRetry(v=>v+1)}>Повторить загрузку</button></div>:data?.stages.length?
   <><p className="team-achievements-total">{data.stages.length} этапов · {data.total} выступлений</p>
    <div className="team-stage-grid">{data.stages.map(stage=><article className="team-stage-card" key={stage.id}>
     <header><h4>{stage.name}</h4><p>{[stage.city,new Date(stage.date).toLocaleDateString('ru-RU')].filter(Boolean).join(' · ')}</p></header>
     <ul>{stage.performances.map(result=><li key={result.id}>
      <div><strong>{result.participant.lastName} {result.participant.firstName}</strong><span>{result.direction} · {result.className}</span></div>
      <div className="team-achievement-measure"><strong>{result.value} {result.unit==='DB'?'дБ':result.unit}</strong>{result.place&&result.place>0?<span>{result.place}-е место</span>:<span>Результат опубликован</span>}</div>
     </li>)}</ul>
    </article>)}</div>
    {data.truncated&&<p className="team-achievement-disclaimer">Показаны первые 500 результатов текущего состава. Полный исторический архив доступен в разделе результатов USD.</p>}
   </>:<p>У текущего публичного состава пока нет опубликованных результатов.</p>}
 </section>;
}
