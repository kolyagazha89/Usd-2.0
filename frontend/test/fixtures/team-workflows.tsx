import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import TeamWorkspace from '../../src/teams/TeamWorkspace';
import MyTeamPage from '../../src/participant/MyTeamPage';
import PublicTeamsPage from '../../src/public/PublicTeamsPage';
import TeamsPage from '../../src/admin/TeamsPage';

export async function runTeamWorkflows(){
 const host=document.getElementById('root')!,root=createRoot(host);
 const calls:any[]=[];let membership:any=null;
 const team:any={id:'t1',name:'First team',description:'Team description',isActive:true,commanderUserId:'u1',memberships:[{id:'m1',status:'PENDING',participant:{id:'p1',firstName:'Member',lastName:'Synthetic',city:'Test city'}}],posts:[{id:'post1',kind:'NEWS',title:'Reviewed news',body:'Public text',status:'PUBLISHED'}],members:[{id:'p1',firstName:'Member',lastName:'Synthetic'}],historicalMembers:[]};
 const archive={id:null,name:'Archive team',description:'',isActive:false,members:[],historicalMembers:[{id:'old1',firstName:'Historic',lastName:'Member'}],posts:[]};
 (globalThis as any).__teamApi=async(method:string,path:string,body:any)=>{calls.push({method,path,body});
  if(path==='/teams/public')return [team,archive];
  if(path==='/teams/admin')return {teams:[team],users:[{id:'u1',name:'Commander',email:'synthetic@teams.invalid'}]};
  if(path==='/teams/me')return {membership,commandedTeam:null};
  if(path==='/teams/t1/join'){membership={id:'m2',status:'PENDING',team:{id:'t1',name:'First team'}};return membership}
  if(path==='/teams/me/leave'){membership=null;return {success:true}}
  return {id:'saved',...body};
 };
 const render=async(node:React.ReactNode)=>{await act(async()=>{root.render(node);await new Promise(r=>setTimeout(r,0))})};
 const click=async(text:string)=>{const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===text);assert.ok(button,'button '+text);await act(async()=>{button.click();await new Promise(r=>setTimeout(r,0))})};
 const input=async(label:string,value:string)=>{const field=[...host.querySelectorAll('input,textarea,select')].find(n=>n.getAttribute('aria-label')===label) as HTMLInputElement;assert.ok(field,label);await act(async()=>{const proto=field.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:field.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(field,value);field.dispatchEvent(new window.Event(field.tagName==='SELECT'?'change':'input',{bubbles:true}))})};
 try{
  await render(<MyTeamPage/>);
  assert.match(host.textContent??'',/Моя команда/);assert.doesNotMatch(host.textContent??'',/Archive team/);
  await input('Команда для заявки','t1');await click('Подать заявку');assert.match(host.textContent??'',/Ожидает решения/);
  await click('Отменить заявку');await click('Подтвердить выход');assert.equal(calls.filter(c=>c.path==='/teams/me/leave'&&c.method==='POST').length,1);
  await render(<TeamWorkspace key="commander" team={team} admin={false} onChanged={async()=>{}}/>);
  assert.doesNotMatch(host.textContent??'',/Опубликовать/);assert.ok(!host.querySelector('[aria-label="Командир команды"]'));
  await click('Принять');assert.equal(calls.at(-1).path,'/teams/t1/memberships/m1');assert.deepEqual(calls.at(-1).body,{status:'APPROVED'});
  await input('Заголовок публикации','New achievement');await input('Текст публикации','Synthetic team achievement');await click('Отправить на проверку');
  assert.equal(calls.at(-1).body.status,'IN_REVIEW');
  await render(<TeamWorkspace key="admin" team={{...team,posts:[{...team.posts[0],status:'IN_REVIEW'}]}} admin users={[]} onChanged={async()=>{}}/>);
  await click('Опубликовать');assert.equal(calls.at(-1).body.status,'PUBLISHED');
  await render(<PublicTeamsPage path="/teams/Archive%20team"/>);assert.match(host.textContent??'',/Архивные участники/);assert.match(host.textContent??'',/Historic/);
  await render(<PublicTeamsPage path="/teams/First%20team"/>);assert.match(host.textContent??'',/Reviewed news/);assert.match(host.textContent??'',/Public text/);
  const Frame=({children}:any)=><main>{children}</main>,Error=({message}:any)=><p role="alert">{message}</p>;
  await render(<TeamsPage PageFrame={Frame} ErrorPanel={Error} LoadingPage={()=>null} Empty={({text}:any)=><p>{text}</p>}/>);
  assert.match(host.textContent??'',/Архивные названия/);assert.ok(!host.textContent?.includes('Переименование обновляет'));
  await input('Название новой команды','New normalized team');await click('Создать команду');
  assert.ok(calls.some(c=>c.method==='POST'&&c.path==='/teams'&&c.body.name==='New normalized team'));
 }finally{await act(async()=>root.unmount())}
}
