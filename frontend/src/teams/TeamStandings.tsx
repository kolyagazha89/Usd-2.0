import {useEffect,useState} from 'react';
import {apiGet,listData} from '../api';
import {Link} from '../public/PremiumUI';

type SeasonChoice={id:string;name:string;year:number};
type DirectionChoice={name:string;sortOrder?:number;isActive?:boolean};
type StageChoice={id:string;name:string;stageNumber:number;date:string;seasonId:string};
type PublicTeamResult={
 id:string;participant:{id:string;firstName:string;lastName:string};
 stage:{id:string;name:string;date:string;seasonId:string};
 direction:string;classId:string;className:string;value:string;unit:string;place:number|null;
};
type TeamLine={
 teamId:string;name:string;performances:number;participants:number;
 firstPlaces:number;podiums:number;results:PublicTeamResult[];
};
type TeamStandingsResponse={
 scope:{type:'SEASON'|'STAGE';id:string};
 total:number;truncated:boolean;order:string;teams:TeamLine[];
};

const resultUnit=(unit:string)=>unit==='DB'?'дБ':unit==='MPS'?'м/с':unit;
const readableDate=(value:string)=>new Date(value).toLocaleDateString('ru-RU');

export default function TeamStandings(){
 const [seasons,setSeasons]=useState<SeasonChoice[]>([]);
 const [stages,setStages]=useState<StageChoice[]>([]);
 const [directions,setDirections]=useState<string[]>([]);
 const [direction,setDirection]=useState('');
 const [choicesLoading,setChoicesLoading]=useState(true);
 const [choicesError,setChoicesError]=useState('');
 const [choicesRetry,setChoicesRetry]=useState(0);
 const [scopeType,setScopeType]=useState<'SEASON'|'STAGE'>('SEASON');
 const [scopeId,setScopeId]=useState('');
 const [data,setData]=useState<TeamStandingsResponse|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [retry,setRetry]=useState(0);
 const [expanded,setExpanded]=useState('');

 useEffect(()=>{
  let active=true;
  setChoicesLoading(true);setChoicesError('');
  Promise.all([apiGet('/seasons'),apiGet('/stages/public'),apiGet('/directions')])
   .then(([seasonsResponse,stagesResponse,directionsResponse])=>{
    if(!active)return;
    const availableSeasons=listData<SeasonChoice>(seasonsResponse)
     .filter(item=>item&&item.id&&Number.isFinite(item.year))
     .sort((a,b)=>b.year-a.year||b.name.localeCompare(a.name,'ru'));
    const availableStages=listData<StageChoice>(stagesResponse)
     .filter(item=>item&&item.id&&item.name)
     .sort((a,b)=>String(b.date).localeCompare(String(a.date))||b.stageNumber-a.stageNumber);
    const availableDirections=listData<DirectionChoice>(directionsResponse)
     .filter(item=>item&&typeof item.name==='string'&&item.name.trim()&&item.isActive!==false)
     .sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0));
    setSeasons(availableSeasons);
    setStages(availableStages);
    setDirections([...new Set(availableDirections.map(item=>item.name))]);
    if(availableSeasons.length){setScopeType('SEASON');setScopeId(availableSeasons[0].id)}
    else{setScopeType('STAGE');setScopeId(availableStages[0]?.id??'')}
   })
   .catch(err=>{if(active)setChoicesError(err instanceof Error?err.message:'Не удалось загрузить сезоны и этапы')})
   .finally(()=>{if(active)setChoicesLoading(false)});
  return()=>{active=false};
 },[choicesRetry]);

 useEffect(()=>{
  if(!scopeId){setData(null);setLoading(false);return}
  let active=true;
  setData(null);setError('');setLoading(true);setExpanded('');
  const query=scopeType==='SEASON'?'seasonId':'stageId';
  apiGet<TeamStandingsResponse>('/teams/public/standings?'+query+'='+encodeURIComponent(scopeId)+(direction?'&direction='+encodeURIComponent(direction):''))
   .then(response=>{
    if(!Array.isArray(response?.teams)||!response.scope)throw new Error('Сервер вернул неполную сводку команд');
    if(active)setData(response);
   })
   .catch(err=>{if(active)setError(err instanceof Error?err.message:'Не удалось загрузить результаты команд')})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[scopeType,scopeId,direction,retry]);

 const changeScope=(value:'SEASON'|'STAGE')=>{
  setScopeType(value);
  setScopeId(value==='SEASON'?seasons[0]?.id??'':stages[0]?.id??'');
 };
 return <section className="p-section team-standings" aria-label="Сравнение результатов команд">
  <h3>Результаты команд по этапам и сезонам</h3>
  <p className="team-achievement-disclaimer">Учитываются только опубликованные личные результаты с командой, зафиксированной при первой успешной инспекции. Сравнение сортируется по числу первых мест, затем призовых мест и выступлений. Это не очковый чемпионат: дБ и м/с не пересчитываются в баллы, официальные командные места не присваиваются.</p>
  {choicesLoading?<p role="status">Загружаем сезоны и этапы…</p>:
   choicesError?<div role="alert"><p>{choicesError}</p><button className="u-btn u-quiet" type="button" onClick={()=>setChoicesRetry(n=>n+1)}>Повторить загрузку</button></div>:
   <div className="team-standings-filters">
    <fieldset className="team-standings-switch">
     <legend>Сравнить команды</legend>
     <label><input type="radio" name="team-standings-scope" checked={scopeType==='SEASON'} disabled={!seasons.length} onChange={()=>changeScope('SEASON')}/> Сезон</label>
     <label><input type="radio" name="team-standings-scope" checked={scopeType==='STAGE'} disabled={!stages.length} onChange={()=>changeScope('STAGE')}/> Этап</label>
    </fieldset>
    <label className="team-standings-select">{scopeType==='SEASON'?'Выберите сезон':'Выберите этап'}
     {scopeType==='SEASON'?
      <select aria-label="Выберите сезон" value={scopeId} onChange={event=>setScopeId(event.target.value)} disabled={!seasons.length}>
       {seasons.map(season=><option key={season.id} value={season.id}>{season.name} · {season.year}</option>)}
      </select>:
      <select aria-label="Выберите этап" value={scopeId} onChange={event=>setScopeId(event.target.value)} disabled={!stages.length}>
       {stages.map(stage=><option key={stage.id} value={stage.id}>{stage.name} · {readableDate(stage.date)}</option>)}
      </select>}
    </label>
    <label className="team-standings-select">Выберите направление
     <select aria-label="Выберите направление" value={direction} onChange={event=>setDirection(event.target.value)}>
      <option value="">Все направления</option>
      {directions.map(name=><option key={name} value={name}>{name}</option>)}
     </select>
    </label>
   </div>}
  {!choicesLoading&&!choicesError&&(!seasons.length&&!stages.length)?<p>Опубликованных сезонов и этапов пока нет.</p>:null}
  {loading?<p role="status">Загружаем командные результаты…</p>:
   error?<div role="alert"><p>{error}</p><button className="u-btn u-quiet" type="button" onClick={()=>setRetry(n=>n+1)}>Повторить загрузку результатов</button></div>:
   data?<div className="team-standings-results">
    {data.truncated&&<p role="status" className="team-standings-warning">Сводка неполная: показаны первые 1500 опубликованных результатов. Для точного сравнения выберите отдельный этап. Частичную выборку нельзя считать итоговым рейтингом.</p>}
    {data.teams.length?<ol className="team-standings-list">
     {data.teams.map(team=><li key={team.teamId} className="team-standings-row">
      <div className="team-standings-row-head">
       <div className="team-standings-identity"><Link to={'/teams/'+encodeURIComponent(team.name)}>{team.name} ↗</Link><small>{team.participants} участников с результатами</small></div>
       <div className="team-standings-numbers">
        <span><strong>{team.firstPlaces}</strong> первых мест</span>
        <span><strong>{team.podiums}</strong> призовых</span>
        <span><strong>{team.performances}</strong> результатов</span>
       </div>
       <button type="button" className="u-btn u-quiet team-standings-toggle"
        aria-expanded={expanded===team.teamId} aria-controls={'team-standings-results-'+team.teamId}
        onClick={()=>setExpanded(current=>current===team.teamId?'':team.teamId)}>
        {expanded===team.teamId?'Скрыть выступления':'Показать выступления'} · {team.name}
       </button>
      </div>
      {expanded===team.teamId&&<ul id={'team-standings-results-'+team.teamId} className="team-standings-performances">
       {team.results.map(result=><li key={result.id}>
        <div><Link to={'/participants/'+encodeURIComponent(result.participant.id)}>{result.participant.lastName} {result.participant.firstName}</Link>
         <span>{result.direction} · {result.className}</span>
         <Link to={'/results?stageId='+encodeURIComponent(result.stage.id)}>{result.stage.name} · {readableDate(result.stage.date)} ↗</Link>
        </div>
        <strong>{result.value} {resultUnit(result.unit)}{result.place!=null&&result.place>0?' · '+result.place+' место':''}</strong>
       </li>)}
      </ul>}
     </li>)}
    </ol>:<p className="team-standings-empty">По выбранному {scopeType==='SEASON'?'сезону':'этапу'} пока нет опубликованных результатов с подтверждённой исторической принадлежностью к команде.</p>}
   </div>:null}
 </section>;
}
