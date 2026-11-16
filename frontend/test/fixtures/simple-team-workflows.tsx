import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import MyTeamPage from '../../src/participant/MyTeamPage';
import PublicTeamsPage from '../../src/public/PublicTeamsPage';
import TeamsPage from '../../src/admin/TeamsPage';

export async function runSimpleTeamWorkflows(){
 const host=document.getElementById('root')!,root=createRoot(host);let fullManagement=false,selectedTeam:string|null=null,fail=false;const writes:any[]=[];
 const team:any={id:'t1',name:'First team',isActive:true,memberships:[],members:[],historicalMembers:[],posts:[{id:'news',kind:'NEWS',title:'Preserved news',body:'Saved content',status:'PUBLISHED'}]};
 (globalThis as any).__teamApi=async(method:string,path:string,body:any)=>{
  if(path==='/teams/mode'){if(method==='PATCH')fullManagement=body.fullManagement;return {fullManagement}}
  if(path==='/teams/options')return [{name:team.name}];
  if(path==='/teams/me/selection'){if(method==='PATCH'){if(fail){fail=false;throw Error('Save failed')}selectedTeam=body.name||null;writes.push(body)}return {team:selectedTeam}}
  if(path==='/teams/public')return [team];
  if(path==='/teams/admin')return {teams:[team],users:[],fullManagement};
  if(path.includes('achievements'))return {teamId:team.id,teamName:team.name,scope:'FIRST_PASSED_INSPECTION',total:0,stages:[],summary:{participants:0,podiums:0,firstPlaces:0,directions:[]}};
  return {};
 };
 const render=async(node:React.ReactNode)=>{await act(async()=>{root.render(node);await new Promise(r=>setTimeout(r,5))})};
 const click=async(text:string)=>{const button=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text);assert.ok(button,text);await act(async()=>{button.click();await new Promise(r=>setTimeout(r,5))})};
 const select=async(value:string)=>{const field=host.querySelector<HTMLSelectElement>('[aria-label="Команда"]')!;await act(async()=>{field.value=value;field.dispatchEvent(new window.Event('change',{bubbles:true}))})};
 try{
  window.history.replaceState({},'','/participant?tab=team&teamId=t1');await render(<MyTeamPage/>);
  assert.equal(host.querySelector<HTMLSelectElement>('[aria-label="Команда"]')?.value,team.name);assert.equal(writes.length,0);
  assert.doesNotMatch(host.textContent??'',/Подать заявку|командира|Preserved news/);
  fail=true;await click('Сохранить команду');assert.match(host.querySelector('[role="alert"]')?.textContent??'',/Save failed/);assert.equal(selectedTeam,null);
  await click('Сохранить команду');assert.equal(selectedTeam,team.name);assert.equal(writes.length,1);
  await render(<MyTeamPage key="reload"/>);assert.equal(host.querySelector<HTMLSelectElement>('[aria-label="Команда"]')?.value,team.name);
  await select('');await click('Сохранить команду');assert.equal(selectedTeam,null);
  await render(<PublicTeamsPage path="/teams/First%20team"/>);assert.doesNotMatch(host.textContent??'',/Preserved news|Текущий состав/);assert.ok([...host.querySelectorAll('a')].some(a=>a.textContent==='Выбрать команду'));
  const Frame=({children}:any)=><main>{children}</main>;
  await render(<TeamsPage PageFrame={Frame} ErrorPanel={({message}:any)=><p role="alert">{message}</p>} LoadingPage={()=>null} Empty={({text}:any)=><p>{text}</p>}/>);
  assert.equal(host.querySelector('.team-review-queue'),null);assert.equal(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,false);
  await act(async()=>{host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();await new Promise(r=>setTimeout(r,5))});assert.equal(fullManagement,true);assert.ok(host.querySelector('.team-review-queue'));
  await act(async()=>{host.querySelector<HTMLButtonElement>('.team-team-list li button')!.click();await new Promise(r=>setTimeout(r,5))});assert.ok(host.querySelector('.team-workspace'));
  await act(async()=>{host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();await new Promise(r=>setTimeout(r,5))});assert.equal(fullManagement,false);assert.equal(host.querySelector('.team-workspace'),null);assert.match(host.textContent??'',/Убрать из списка выбора/);
  assert.equal(team.posts[0].title,'Preserved news');
 }finally{await act(async()=>root.unmount())}
}
