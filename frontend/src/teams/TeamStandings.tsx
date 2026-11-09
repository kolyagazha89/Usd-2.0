import {useEffect,useMemo,useState} from 'react';
import {apiGet} from '../api';
import {Link} from '../public/PremiumUI';
import {sortTeamStandings,type TeamStandingSort} from './team-standings-model';

type StandingResult={
 id:string;
 participant:{id:string;firstName:string;lastName:string};
 stage:{id:string;name:string;city:string|null;date:string};
 historicalTeamName:string|null;
 classId:string;className:string;direction:string;
 place:number|null;value:string;unit:string;
};
type StandingTeam={
 teamId:string;teamName:string;
 performances:number;participants:number;stages:number;firstPlaces:number;podiums:number;
 results:StandingResult[];
};
type StandingResponse={
 season:string|null;stageId:string|null;direction:string|null;
 total:number;truncated:boolean;teams:StandingTeam[];
 availableStages:Array<{id:string;name:string;city:string|null;date:string}>;
 directions:string[];
};

const unitLabel=(unit:string)=>unit==='DB'?'дБ':unit==='MPS'?'м/с':unit;

export default function TeamStandings(){
 const [data,setData]=useState<StandingResponse|null>(null);
 const [season,setSeason]=useState(''),[stageId,setStageId]=useState(''),[direction,setDirection]=useState('');
 const [sort,setSort]=useState<TeamStandingSort>('NAME');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [openTeam,setOpenTeam]=useState<string|null>(null),[shown,setShown]=useState(40);
 useEffect(()=>{
  let active=true;
  const params=new URLSearchParams();
  if(season)params.set('season',season);
  if(stageId)params.set('stageId',stageId);
  if(direction)params.set('direction',direction);
  setLoading(true);setError('');
  apiGet<StandingResponse>('/teams/public/standings'+(params.size?'?'+params.toString():''))
   .then(result=>{
    if(!result||!Array.isArray(result.teams)||!Array.isArray(result.availableStages)||!Array.isArray(result.directions))throw new Error('Неверный ответ сервера о результатах команд');
    if(active)setData(result);
   })
   .catch(err=>{if(active)setError(err instanceof Error?err.message:'Не удалось загрузить сводку команд')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[season,stageId,direction,retry]);
 const seasons=useMemo(()=>[...new Set(data?.availableStages.map(stage=>stage.date.slice(0,4))??[])].sort((a,b)=>b.localeCompare(a)),[data]);
 const selectableStages=useMemo(()=>data?.availableStages.filter(stage=>!season||stage.date.slice(0,4)===season)??[],[data,season]);
 const ordered=useMemo(()=>sortTeamStandings(data?.teams??[],sort),[data,sort]);
 const changeTeam=(teamId:string)=>{setOpenTeam(current=>current===teamId?null:teamId);setShown(40)};
 const changeSeason=(value:string)=>{setSeason(value);setStageId('');setOpenTeam(null)};
 return <section className="p-section team-standings" aria-label="Результаты команд по этапам и сезонам">
  <div className="team-standings-intro">
   <div><h3>Результаты команд · этапы и сезоны</h3>
    <p className="team-achievement-disclaimer">Выступления по подтверждённой команде: принадлежность зафиксирована при первой пройденной инспекции. Показаны только опубликованные личные результаты участников с открытым профилем. Архив без подтверждения команды не приписывается задним числом.</p>
    <p className="team-achievement-disclaimer"><strong>Порядок команд по местам не утверждён.</strong> Это сравнительная сводка, а не официальный очковый зачёт. Децибелы, м/с и места из разных классов не пересчитываются в общие баллы. Сортировка меняет только порядок просмотра.</p></div>
  </div>
  <div className="team-standings-filters">
   <label>Сезон
    <select value={season} onChange={e=>changeSeason(e.target.value)} aria-label="Сезон для командной сводки">
     <option value="">Все сезоны</option>{seasons.map(year=><option key={year} value={year}>{year}</option>)}
    </select>
   </label>
   <label>Этап
    <select value={stageId} onChange={e=>{setStageId(e.target.value);setOpenTeam(null)}} aria-label="Этап для командной сводки">
     <option value="">Все этапы</option>{selectableStages.map(stage=><option key={stage.id} value={stage.id}>{stage.name} · {new Date(stage.date).toLocaleDateString('ru-RU')}</option>)}
    </select>
   </label>
   <label>Направление
    <select value={direction} onChange={e=>{setDirection(e.target.value);setOpenTeam(null)}} aria-label="Направление для командной сводки">
     <option value="">Все направления</option>{data?.directions.map(name=><option key={name} value={name}>{name}</option>)}
    </select>
   </label>
   <label>Упорядочить по
    <select value={sort} onChange={e=>setSort(e.target.value as TeamStandingSort)} aria-label="Сортировка командной сводки">
     <option value="NAME">Названию команды</option>
     <option value="FIRST_PLACES">Количеству личных первых мест</option>
     <option value="PODIUMS">Количеству личных призовых мест</option>
     <option value="PERFORMANCES">Количеству выступлений</option>
    </select>
   </label>
  </div>
  {loading?<p role="status">Загружаем проверенные результаты команд…</p>:error?
   <div role="alert"><p>{error}</p><button type="button" className="u-btn u-quiet" onClick={()=>setRetry(n=>n+1)}>Повторить</button></div>:data?
   <>
    <p className="team-achievements-total">{ordered.length} команд · {data.total} личных выступлений {season?'· сезон '+season:''}{stageId?' · выбранный этап':''}</p>
    {data.truncated&&<p className="team-standings-warning" role="status">Показаны первые 5000 опубликованных выступлений. Сводка неполная: показатели и сортировка учитывают только эту часть архива. Для полного протокола откройте результаты соответствующего этапа.</p>}
    {ordered.length===0?<p>По выбранным фильтрам пока нет выступлений с подтверждённой принадлежностью к команде. Старые выступления без фиксации при инспекции здесь не учитываются.</p>:
     <div className="team-standings-list">{ordered.map(team=><article key={team.teamId} className="team-standing-card">
      <div className="team-standing-head">
       <div><h4>{team.teamName}</h4><span>{team.stages} этапов · {team.participants} участников</span></div>
       <div className="team-standing-metrics" aria-label={'Статистика '+team.teamName}>
        <span><strong>{team.performances}</strong> выступлений</span>
        <span><strong>{team.podiums}</strong> личных призовых</span>
        <span><strong>{team.firstPlaces}</strong> личных первых мест</span>
       </div>
      </div>
      <button type="button" className="team-standing-expand" aria-expanded={openTeam===team.teamId} onClick={()=>changeTeam(team.teamId)}>
       {openTeam===team.teamId?'Свернуть выступления':'Показать выступления и протоколы'} <span aria-hidden>{openTeam===team.teamId?'−':'+'}</span>
      </button>
      {openTeam===team.teamId&&<div className="team-standing-results">
       <p>Каждая строка — личный результат в своём классе. Откройте официальный протокол этапа для проверки.</p>
       <ul>{team.results.slice(0,shown).map(result=><li key={result.id}>
        <div><Link className="team-stage-athlete" to={'/participants/'+encodeURIComponent(result.participant.id)}>{result.participant.lastName} {result.participant.firstName}</Link>
         <span>{result.direction} · {result.className}</span>
         {result.historicalTeamName&&result.historicalTeamName!==team.teamName&&<span>На момент инспекции: {result.historicalTeamName}</span>}
        </div>
        <div className="team-standing-result-value"><strong>{result.value} {unitLabel(result.unit)}</strong><span>{result.place&&result.place>0?result.place+'-е место':'Место не определено'}</span></div>
        <div className="team-standing-stage"><Link to={'/results?stageId='+encodeURIComponent(result.stage.id)}>{result.stage.name} ↗</Link><span>{new Date(result.stage.date).toLocaleDateString('ru-RU')}</span></div>
       </li>)}</ul>
       {team.results.length>shown&&<button type="button" className="u-btn u-quiet" onClick={()=>setShown(n=>n+40)}>Показать ещё {Math.min(40,team.results.length-shown)} выступлений</button>}
       <Link className="team-stage-protocol" to={'/teams/'+encodeURIComponent(team.teamName)}>Открыть страницу команды</Link>
      </div>}
     </article>)}</div>}
   </>:null}
 </section>;
}
