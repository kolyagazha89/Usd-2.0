import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import StatisticsPage from '../../src/admin/StatisticsPage';

export async function runStatisticsSearch(){
 const requests:Array<{path:string;resolve:(data:any)=>void;reject:(error:Error)=>void}>=[];
 const seasonRequests:Array<{path:string;resolve:(data:any)=>void}>=[];
 (globalThis as any).__searchApi=(path:string)=>{
  if(path==='/seasons')return Promise.resolve([{id:'s1',year:2026},{id:'s2',year:2027}]);
  if(path.startsWith('/statistics/seasons/'))return new Promise(resolve=>seasonRequests.push({path,resolve}));
  if(path.startsWith('/statistics/participants'))return new Promise((resolve,reject)=>requests.push({path,resolve,reject}));
  return Promise.resolve([]);
 };
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const Frame=({children}:any)=><main>{children}</main>,Title=({title}:any)=><h2>{title}</h2>;
 const Placeholder=({text,message}:any)=><p>{text||message||'Загрузка'}</p>;
 const flush=async(ms=0)=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,ms))});
 const input=()=>host.querySelector('[aria-label="Поиск статистики участника"]') as HTMLInputElement;
 const type=async(value:string)=>{await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input(),value);input().dispatchEvent(new window.Event('input',{bubbles:true}))});};
 const buttons=()=>[...host.querySelectorAll('button')];
 try{
  await act(async()=>root.render(<StatisticsPage go={()=>{}} PageFrame={Frame} PanelTitle={Title} LoadingPage={Placeholder} Empty={Placeholder} ErrorPanel={Placeholder}/>));await flush();
  assert.equal(requests.length,0,'empty query never fetches the directory');
  assert.equal(seasonRequests.length,1,'initial season reads once');
  const seasonSelect=host.querySelector('[aria-label="Сезон статистики"]') as HTMLSelectElement;
  await act(async()=>{seasonSelect.value='s2';seasonSelect.dispatchEvent(new window.Event('change',{bubbles:true}))});
  assert.equal(seasonRequests.length,2,'changing a season performs one request');
  const analytics=(total:number)=>({registrations:{total,withTeam:0,withoutTeam:total,withoutTeamPercent:100},teams:[],vibrationIsolation:[],speakerBrands:[],amplifierBrands:[]});
  await act(async()=>seasonRequests[1].resolve(analytics(202)));
  await act(async()=>seasonRequests[0].resolve(analytics(101)));
  assert.equal(seasonSelect.closest('section')!.querySelector('.admin-mini-stats strong')!.textContent,'202','old season response cannot replace selected season');

  assert.ok(host.querySelector('main')!.firstElementChild!.classList.contains('statistics-participant-search'),'participant lookup precedes long reports');
  assert.ok(!buttons().some(b=>b.textContent==='Найти'),'search needs no submit');
  await type('И');await type('Иван');assert.equal(requests.length,0,'typing is debounced');
  await flush(340);assert.equal(requests.length,1);assert.match(requests[0].path,/search=%D0%98%D0%B2%D0%B0%D0%BD&limit=20$/);
  await type('Пётр');await flush(340);assert.equal(requests.length,2);
  await act(async()=>requests[1].resolve([{id:'p2',lastName:'Петров',firstName:'Пётр'}]));
  assert.match(host.querySelector('.statistics-search-results')!.textContent!,/Петров/);
  await act(async()=>requests[0].resolve([{id:'p1',lastName:'Иванов'}]));
  assert.match(host.querySelector('.statistics-search-results')!.textContent!,/Петров/,'late earlier response cannot replace current results');
  await type('Новое');await flush(340);await type('');
  await act(async()=>requests[2].resolve([{id:'late',lastName:'Запоздалый'}]));
  assert.ok(!host.querySelector('.statistics-search-results'),'clearing cancels pending results');
  await type('Ошибка');await flush(340);await act(async()=>requests[3].reject(new Error('Тестовая ошибка поиска')));
  assert.match(host.querySelector('.statistics-participant-search [role="alert"]')!.textContent!,/Тестовая ошибка/,'search error stays beside input');
  const retry=buttons().find(b=>b.textContent==='Повторить поиск')!;await act(async()=>retry.click());await flush(340);
  assert.equal(requests.length,5);await act(async()=>requests[4].resolve([]));
  assert.match(host.querySelector('.statistics-participant-search')!.textContent!,/Участники не найдены/);
  assert.ok(!host.querySelector('[role="alert"]'),'retry clears old error');
  await type('Участник');await flush(340);await act(async()=>requests[5].resolve([{id:'p2',firstName:'Выбранный'}]));
  await act(async()=>(host.querySelector('.statistics-search-result') as HTMLButtonElement).click());
  assert.equal(requests[6].path,'/statistics/participants/p2');
  await type('Другой');await act(async()=>requests[6].resolve({participant:{id:'p2',firstName:'Выбранный'},stats:{}}));
  assert.ok(!host.querySelector('.participant-stat-card'),'typing a new lookup cancels an old detail response');
 }finally{await act(async()=>root.unmount());host.remove();delete (globalThis as any).__searchApi}
}
