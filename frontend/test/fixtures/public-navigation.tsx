import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../../src/App';

const state=globalThis as any;
const stages=[
  {id:'alpha',name:'Этап Альфа',stageNumber:2,date:'2026-09-01T12:00:00Z',status:'COMPLETED',season:{year:2026},resultsPublishedAt:'2026-09-01T18:00:00Z'},
  {id:'beta',name:'Этап Бета',stageNumber:1,date:'2026-08-01T12:00:00Z',status:'COMPLETED',season:{year:2026},resultsPublishedAt:'2026-08-01T18:00:00Z'},
];
const result=(stage:any)=>[{id:'result-'+stage.id,value:150,place:1,participant:{firstName:stage.name},class:{name:'Limited 2.0',unit:'DB',direction:{code:'SPL'}},registration:{stage,car:{brand:'Lada',model:stage.id}}}];
const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,35))})};
const click=async(element:HTMLElement)=>{assert.ok(element);await act(async()=>element.click());await flush()};
const stageSelect=()=>document.querySelector<HTMLSelectElement>('.public-stage-select select')!;
function assertStage(id:string){
  assert.equal(stageSelect()?.value,id);
  const stage=stages.find(stage=>stage.id===id)!;
  assert.match(document.querySelector('.public-result-context')?.textContent??'',new RegExp(stage.name));
}
export async function runPublicNavigation(){
  state.__getPublic=async(path:string)=>{
    if(path==='/stages/public')return stages;
    if(path.startsWith('/stages/public/'))return stages.find(stage=>stage.id===path.split('/').at(-1));
    if(path.startsWith('/results/stage/'))return result(stages.find(stage=>stage.id===path.split('/').at(-1)));
    if(path==='/site-settings/public')return {settings:{homepage:{blocks:[{id:'latest-results',enabled:false},{id:'live-results',enabled:false},{id:'participants',enabled:false}]}}};
    return [];
  };
  history.replaceState({},'','/results?stageId=alpha');
  const root=createRoot(document.getElementById('root')!);
  try{
    await act(async()=>root.render(<App/>));await flush();
    assertStage('alpha');
    assert.equal(document.querySelector('.u-mobile-dock [aria-current="page"]')?.textContent,'Результаты','public dock marks the current section');
    await click([...document.querySelectorAll<HTMLAnchorElement>('.public-nav a')].find(button=>button.textContent==='Этапы')!);
    const cards=[...document.querySelectorAll<HTMLElement>('.public-stage-card')];
    assert.equal(cards.length,2);
    assert.ok(cards[0].textContent?.includes('Этап Альфа'));
    assert.ok(cards[1].textContent?.includes('Этап Бета'));
    const beta=cards.find(card=>card.textContent?.includes('Этап Бета'))!;
    const nestedResults=[...beta.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('Результаты этапа'))!;
    await act(async()=>nestedResults.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})));
    assert.equal(location.pathname,'/stages','a nested action must not trigger the parent card keyboard navigation');
    await click([...beta.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('Подробнее об этапе'))!);
    assert.equal(location.pathname,'/stages/beta');
    await click([...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.includes('Результаты этапа'))!);
    assert.equal(location.search,'?stageId=beta');
    assertStage('beta');

    await act(async()=>{stageSelect().value='alpha';stageSelect().dispatchEvent(new window.Event('change',{bubbles:true}))});await flush();
    assert.equal(location.search,'?stageId=alpha','the stage selector must update the shareable URL');
    assertStage('alpha');
    await act(async()=>history.back());await flush();
    assert.equal(location.search,'?stageId=beta');assertStage('beta');
    await act(async()=>history.forward());await flush();
    assert.equal(location.search,'?stageId=alpha');assertStage('alpha');

    await act(async()=>{stageSelect().value='';stageSelect().dispatchEvent(new window.Event('change',{bubbles:true}))});await flush();
    assert.equal(location.search,'?stageId=');
    assert.equal(stageSelect().value,'');
    assert.equal(document.querySelectorAll('.public-result-card').length,0,'an intentional empty selection must not auto-discover another stage');

    // A browser navigation to the bare results URL should discover results again.
    await act(async()=>{history.pushState({},'','/results');window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();await flush();
    assertStage('alpha');

    // An explicit link in browser history must replace the auto-discovered selection.
    await act(async()=>{history.pushState({},'','/results?stageId=beta');window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();
    assertStage('beta');
  }finally{await act(async()=>root.unmount())}
}

export async function runPublicBootstrap(){
 let finish:(value:any)=>void=()=>{};state.__publicRefresh=()=>new Promise(resolve=>{finish=resolve});state.__getPublic=async()=>[];history.replaceState({},'','/');const root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<App/>));await flush();assert.ok(document.querySelector('header'),'public navigation must render while session refresh is pending');assert.ok(document.querySelector('main'),'public content must not wait on authentication');}
 finally{await act(async()=>{finish({user:null})});await act(async()=>root.unmount());delete state.__publicRefresh;}
}

export async function runSignedInPublicAccess(){
 const requested:string[]=[];
 const person={id:'other-person',lastName:'Петров',firstName:'Пётр',team:'Команда Тест',isPublic:true,cars:[{id:'other-car',brand:'Lada',model:'Vesta'}],registrations:[{id:'other-entry',stage:stages[0],car:{brand:'Lada',model:'Vesta'},classes:[{class:{name:'Limited 2.0'}}]}]};
 state.__accountUser={id:'my-account',email:'member@example.test',role:'PARTICIPANT',participantId:'my-person'};
 state.__getPublic=async(path:string)=>{
  requested.push(path);
  if(path==='/results/registration/other-entry')return result(stages[0]);
  if(path==='/cars/other-car')return {...person.cars[0],participant:person};
  if(path==='/participants')return [person];
  if(path==='/participants/other-person')return person;
  if(path==='/participants/me')return {participant:{id:'my-person',firstName:'Мой профиль'}};
  if(path==='/stages/public')return stages;
  if(path==='/site-settings/public')return {settings:{}};
  return [];
 };
 history.replaceState({},'','/participants');
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<App/>));await flush();await flush();
  assert.equal(document.querySelectorAll('[aria-label="Поиск участника"]').length,1,'a participant session must open the public participant directory');
  assert.equal(document.querySelector('.participant-portal'),null,'public profiles never render the viewer own cabinet');
  await click(document.querySelector<HTMLAnchorElement>('.p-person-card')!);
  assert.equal(location.pathname,'/participants/other-person');assert.match(document.querySelector('.p-profile-banner')?.textContent??'',/Петров Пётр/);
  assert.match(document.body.textContent??'',/история участия/i);
  assert.ok(!requested.includes('/results/registration/other-entry'),'results load only when the visitor requests them');
  const resultsButton=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Показать результаты'));
  assert.ok(resultsButton,'public profiles offer published achievements for each entry');
  await click(resultsButton);
  assert.match(document.querySelector('.p-entry-results')?.textContent??'',/150/);
  assert.match(document.querySelector('.p-entry-results')?.textContent??'',/1 место/);
  assert.ok(document.querySelector('a[href="/results?stageId=alpha"]'));
  assert.ok(!requested.some(p=>p.startsWith('/statistics')),'public achievements never use administrator APIs');
  await act(async()=>history.back());await flush();assert.ok(document.querySelector('[aria-label="Поиск участника"]'));
  for(const path of ['/teams','/cars','/news','/partners','/documents','/contacts','/about','/rules','/privacy','/terms','/consent','/stages','/records','/results']){
   await act(async()=>{history.pushState({},'',path);window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();
   assert.ok(document.querySelector('.usd-live'),path+' remains public for signed-in members');
   assert.equal(document.querySelector('.participant-portal'),null,path+' does not switch to the cabinet');
   if(path==='/cars'){
    assert.equal(requested.includes('/cars/'),false,'the public car directory must not call the private car list');
    assert.ok(document.querySelector('a[href="/cars/other-car"]'),'public cars are discoverable');
    await click(document.querySelector<HTMLAnchorElement>('a[href="/cars/other-car"]')!);
    assert.match(document.querySelector('.p-car-banner')?.textContent??'',/Lada Vesta/);
   }
  }
 }finally{await act(async()=>root.unmount());state.__accountUser=null}
}

export async function runRulesSearch(){
 const blocks=[{type:'heading',level:1,text:'1. Классы SPL'},{type:'heading',level:2,text:'Limited 2.0'},{type:'paragraph',text:'SPL Limited 2.0'},{type:'paragraph',text:'Бюджет не более 45000 рублей.'},{type:'table',rows:[['Оборудование','Лимит'],['Усилитель','4000 Вт']]},{type:'heading',level:1,text:'2. Судейство'},{type:'paragraph',text:'Решение принимает судья.'}];
 state.__getPublic=async(path:string)=>path==='/site-settings/public'?{settings:{registration:{rulesDocument:{published:{blocks}}}}}:[];
 history.replaceState({},'','/rules');const root=createRoot(document.getElementById('root')!);
 const type=async(value:string)=>{await act(async()=>{const input=document.querySelector<HTMLInputElement>('[aria-label="Поиск по регламенту"]')!;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}))});await flush()};
 try{
  await act(async()=>root.render(<App/>));await flush();
  await type('Limited');
  assert.match(document.querySelector('.public-rules-rich-document')?.textContent??'',/45000/,'a class search keeps the restrictions following its name');
  assert.match(document.querySelector('nav[aria-label="Оглавление регламента"]')?.textContent??'',/Классы SPL/,'search retains the matching section title');
  assert.doesNotMatch(document.querySelector('.public-rules-rich-document')?.textContent??'',/Решение принимает судья/);
  await type('Классы SPL');assert.match(document.querySelector('.public-rules-rich-document')?.textContent??'',/45000/,'parent heading search includes nested classes and limits');
  await type('Усилитель');assert.match(document.querySelector('nav[aria-label="Оглавление регламента"]')?.textContent??'',/Классы SPL/,'a nested match keeps its parent heading');assert.equal(document.querySelectorAll('.public-rules-rich-document table tr').length,2,'table context and headers are preserved');
  await type('небывалыйпоиск');assert.match(document.querySelector('.public-rules-document')?.textContent??'',/ничего не найдено/);
  await type('');assert.match(document.querySelector('.public-rules-rich-document')?.textContent??'',/Решение принимает судья/);
 }finally{await act(async()=>root.unmount())}
}

export async function runPrereleaseErrors(){
 state.__accountUser=null;
 state.__getPublic=async(path:string)=>path==='/site-settings/public'?{settings:{}}:[];
 history.replaceState({},'','/stages/%E0%A4%A');let root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<App/>));await flush();assert.ok(document.querySelector('header'),'malformed links retain site navigation');assert.match(document.querySelector('main')?.textContent??'',/не найден/i)}finally{await act(async()=>root.unmount())}
 let attempts=0;
 state.__getPublic=async(path:string)=>{
  if(path==='/participants/missing')throw Object.assign(new Error('not found'),{status:404});
  if(path==='/participants/retry'){if(++attempts===1)throw new Error('network failure');return {id:'retry',firstName:'Успех',cars:[],registrations:[]}}
  if(path==='/stages/public/offline')throw new Error('network failure');
  if(path==='/site-settings/public')return {settings:{}};return [];
 };
 for(const path of ['/participants/missing','/participants/retry','/stages/offline']){
  history.replaceState({},'',path);root=createRoot(document.getElementById('root')!);
  try{
   await act(async()=>root.render(<App/>));await flush();
   const main=document.querySelector('main')!;
   if(path.endsWith('missing')){assert.match(main.textContent??'',/Участник не найден/);assert.ok(main.querySelector('a[href="/participants"]'),'closed or missing profiles offer the public directory');assert.equal(main.querySelector('[role="alert"]'),null)}
   else {assert.match(main.textContent??'',/Не удалось/,'network failure must not be described as a missing entity');assert.doesNotMatch(main.textContent??'',/Этап не найден/);const retry=[...main.querySelectorAll<HTMLButtonElement>('button')].find(b=>/Попробовать ещё раз/.test(b.textContent??''));assert.ok(retry);if(path.includes('/participants/')){await click(retry);assert.match(main.textContent??'',/Успех/)}}
  }finally{await act(async()=>root.unmount())}
 }
}
export async function runResultProfileLinks(){
 state.__accountUser=null;
 const rows=[{...result(stages[0])[0],id:'public',registration:{stage:stages[0],participant:{id:'public-person',firstName:'Открытый',isPublic:true},car:{brand:'Lada',model:'Vesta'}}},{...result(stages[0])[0],id:'private',participant:null,registration:{stage:stages[0],participant:{id:'private-person',lastName:'Участник скрыт',isPublic:false}}}];
 // Prefer the public API participant identity, not a fixture-level fallback.
 delete (rows[0] as any).participant;
 state.__getPublic=async(path:string)=>path==='/stages/public'?stages:path.startsWith('/results/stage/')?rows:path==='/site-settings/public'?{settings:{}}:[];
 history.replaceState({},'','/results?stageId=alpha');const root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<App/>));await flush();assert.ok(document.querySelector('.public-result-card a[href="/participants/public-person"]'),'published result links to the public competitor profile');assert.equal(document.querySelector('a[href="/participants/private-person"]'),null,'hidden competitor identities never link to a profile')}finally{await act(async()=>root.unmount())}
}
export async function runRegistrationContext(){
 state.__accountUser=null;state.__getPublic=async(path:string)=>path==='/stages/public/alpha'?{...stages[0],name:'Выбранный кубок'}:path==='/site-settings/public'?{settings:{legal:{legalApproved:true,ipName:'USD',privacyText:'policy',consentText:'consent',termsText:'terms'}}}:[];
 history.replaceState({},'','/login?next=%2Fparticipant%2Fregister%3FstageId%3Dalpha');const root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<App/>));await flush();assert.match(document.querySelector('.login-card')?.textContent??'',/Выбранный кубок/,'login retains visible event context');await click([...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>/Нет аккаунта/.test(b.textContent??''))!);const password=document.querySelector<HTMLInputElement>('input[autocomplete="new-password"]')!;const hint=password.getAttribute('aria-describedby');assert.ok(hint&&document.getElementById(hint)?.textContent?.includes('8'),'password constraints are visible and associated with the field')}finally{await act(async()=>root.unmount())}
}

export async function runCommunityNavigationRace(){
 state.__accountUser=null;let finish:(v:any)=>void=()=>{};
 state.__getPublic=async(path:string)=>path==='/participants'?new Promise(resolve=>{finish=resolve}):path==='/site-settings/public'?{settings:{}}:[];
 history.replaceState({},'','/participants');const root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<App/>));await flush();await click([...document.querySelectorAll<HTMLAnchorElement>('.public-nav a')].find(a=>a.textContent==='Новости')!);assert.equal(location.pathname,'/news');assert.equal(document.querySelector('[aria-label="Загружаем страницу"]'),null,'leaving an unfinished directory request must not leave news loading forever');assert.match(document.querySelector('main')?.textContent??'',/Новые истории/)}finally{await act(async()=>finish([]));await act(async()=>root.unmount())}
}
