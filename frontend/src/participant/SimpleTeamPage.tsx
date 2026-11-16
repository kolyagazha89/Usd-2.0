import {useEffect,useState} from 'react';
import {apiGet,apiPatch,listData} from '../api';
import TeamStageAchievements from '../teams/TeamStageAchievements';
import type {PublicTeam} from '../teams/types';

export default function SimpleTeamPage({canJoin}:{canJoin:boolean}){
 const [options,setOptions]=useState<{name:string}[]>([]),[teams,setTeams]=useState<PublicTeam[]>([]),[selected,setSelected]=useState(''),[saved,setSaved]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=async()=>{setLoading(true);setError('');try{
  const [names,current,directory]=await Promise.all([apiGet<{name:string}[]>('/teams/options'),apiGet<{team:string|null}>('/teams/me/selection'),apiGet<PublicTeam[]>('/teams/public')]);
  const list=listData<PublicTeam>(directory),name=current.team??'';
  setOptions(listData<{name:string}>(names));setTeams(list);setSaved(name);
  const linked=list.find(t=>t.id===new URLSearchParams(window.location.search).get('teamId')&&t.isActive);
  setSelected(name||linked?.name||'');
 }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить команды')}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const save=async()=>{setBusy(true);setError('');setNotice('');try{const result=await apiPatch<{team:string|null}>('/teams/me/selection',{name:selected});setSaved(result.team??'');setSelected(result.team??'');setNotice('Команда сохранена');const directory=await apiGet<PublicTeam[]>('/teams/public');setTeams(listData<PublicTeam>(directory))}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить команду')}finally{setBusy(false)}};
 const current=teams.find(t=>t.name===saved);
 return <div className="my-team-page"><section className="participant-section team-membership"><h2>Моя команда</h2>
 {error&&<div role="alert" className="form-error">{error}<button className="secondary-button" onClick={()=>void load()}>Повторить загрузку</button></div>}
 {notice&&<p role="status">{notice}</p>}
 {loading?<p role="status">Загружаем команды…</p>:canJoin?<form className="team-join-form" onSubmit={e=>{e.preventDefault();void save()}}><p>Выберите свою команду и сохраните.</p><label>Команда<select aria-label="Команда" value={selected} disabled={busy} onChange={e=>setSelected(e.target.value)}><option value="">Без команды</option>{saved&&!options.some(t=>t.name===saved)&&<option value={saved} disabled>{saved} · в архиве</option>}{options.map(t=><option key={t.name} value={t.name}>{t.name}</option>)}</select></label><button className="primary-button" disabled={busy||selected===saved}>{busy?'Сохраняем…':'Сохранить команду'}</button></form>:<p>Сначала привяжите профиль участника.</p>}
 </section>{current?.id&&<section className="participant-section"><TeamStageAchievements teamId={current.id} mode="inspected"/></section>}</div>;
}
