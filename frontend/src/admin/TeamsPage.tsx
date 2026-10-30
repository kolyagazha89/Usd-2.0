import {useEffect,useState} from 'react';
import {apiGet,apiPost,listData} from '../api';
import TeamWorkspace from '../teams/TeamWorkspace';
import type {PublicTeam,Team,TeamUser} from '../teams/types';
function TeamsPage({PageFrame,ErrorPanel,LoadingPage,Empty}:{PageFrame:React.ComponentType<any>;ErrorPanel:React.ComponentType<any>;LoadingPage:React.ComponentType<any>;Empty:React.ComponentType<any>}){
 const [teams,setTeams]=useState<Team[]>([]),[users,setUsers]=useState<TeamUser[]>([]),[legacy,setLegacy]=useState<PublicTeam[]>([]),[selected,setSelected]=useState(''),[name,setName]=useState(''),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=async()=>{
  const [result,directory]=await Promise.all([apiGet<{teams:Team[];users:TeamUser[]}>('/teams/admin'),apiGet<PublicTeam[]>('/teams/public')]);
  if(!Array.isArray(result?.teams)||!Array.isArray(result?.users))throw new Error('Не удалось загрузить список команд. Попробуйте ещё раз.');
  setTeams(result.teams);setUsers(result.users);setLegacy(listData<PublicTeam>(directory).filter(t=>!t.id));
 };
 const refresh=async()=>{setLoading(true);setError('');try{await load()}catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить команды')}finally{setLoading(false)}};
 useEffect(()=>{void refresh()},[]);
 const create=async()=>{setBusy(true);setError('');try{const team=await apiPost<Team>('/teams',{name:name.trim()});setName('');await load();setSelected(team.id)}catch(e){setError(e instanceof Error?e.message:'Не удалось создать команду')}finally{setBusy(false)}};
 const filtered=teams.filter(t=>t.name.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))),current=teams.find(t=>t.id===selected);
 return <PageFrame title="Команды" subtitle="Составы, командиры и публикации USD" action={<button className="secondary-button" disabled={loading||busy} onClick={()=>void refresh()}>Обновить</button>}>
 {error&&<ErrorPanel message={error} retry={refresh}/>}
 <section className="panel team-admin-intro"><h2>Управление командами</h2><p>Создайте команду, назначьте командира и проверяйте материалы перед публикацией. Назначение действует только внутри выбранной команды.</p><form className="team-create-form" onSubmit={e=>{e.preventDefault();void create()}}><label>Название новой команды<input aria-label="Название новой команды" value={name} maxLength={120} required onChange={e=>setName(e.target.value)}/></label><button className="primary-button" disabled={busy||!name.trim()}>Создать команду</button></form></section>
 {loading?<LoadingPage/>:<div className="team-admin-layout"><section className="panel team-team-list"><label>Найти команду<input aria-label="Найти команду" value={query} onChange={e=>setQuery(e.target.value)}/></label>{filtered.length?<ul>{filtered.map(t=><li key={t.id}><button className={selected===t.id?'is-selected':''} aria-pressed={selected===t.id} onClick={()=>setSelected(t.id)}><strong>{t.name}</strong><span>{t.isActive?'Активна':'В архиве'} · {t.memberships?.filter(m=>m.status==='PENDING').length??0} заявок</span></button></li>)}</ul>:<Empty text={query?'Команды не найдены':'Создайте первую команду'}/>}</section><section className="panel team-admin-detail">{current?<TeamWorkspace key={current.id} team={current} users={users} admin onChanged={load}/>:<Empty text="Выберите команду для управления составом и публикациями"/>}</section></div>}
 <section className="panel team-archive"><h2>Архивные названия</h2><p>История выступлений сохранена. Архивные связи не означают подтверждённое текущее членство.</p>{legacy.length?<ul>{legacy.map(t=><li key={t.name}><strong>{t.name}</strong><span>{t.historicalMembers.length} публичных участников в архиве</span></li>)}</ul>:<p>Отдельных архивных названий нет.</p>}</section>
 </PageFrame>;
}
export default TeamsPage;
