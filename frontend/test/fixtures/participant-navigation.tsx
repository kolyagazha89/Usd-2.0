import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../../src/App';
import MemberDashboard from '../../src/participant/MemberDashboard';
const state=globalThis as any;
const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,40))})};
const nav=()=>document.querySelector('.participant-tabs')!;
const link=(label:string)=>[...nav().querySelectorAll<HTMLAnchorElement>('a')].find(element=>element.textContent===label)!;
const click=async(element:HTMLElement)=>{assert.ok(element);await act(async()=>element.click());await flush()};
function active(label:string){assert.equal(nav().querySelector('[aria-current="page"]')?.textContent,label)}
export async function runParticipantNavigation(){
 const stage={id:'stage1',name:'Этап USD',date:'2026-11-21T12:00:00Z',registrationOpen:true,status:'PUBLISHED'};
 const car={id:'car1',brand:'Lada',model:'Vesta',isActive:true,configurations:[]};
 state.__getPublic=async(path:string)=>{
  if(path==='/participants/me')return {participant:{id:'p1',firstName:'Иван',lastName:'Тестовый',city:'Тюмень',phone:'+79001111008'}};
  if(path==='/stages/public')return [stage];
  if(path==='/participants/me/cars')return [car];
  if(path==='/registrations/me')return [{id:'reg1',stageId:stage.id,stage,carId:car.id,car,status:'ACTIVE',classes:[],results:[]},{id:'cancelled1',stageId:stage.id,stage,carId:car.id,car,status:'CANCELLED',classes:[],results:[]}];
  if(path==='/auth/legal-consent')return {legalReady:false};
  if(path==='/auth/newsletter-consent')return {consent:false};
  return [];
 };
 history.replaceState({},'','/participant?tab=profile');
 let root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<App/>));await flush();active('Профиль');assert.equal(document.querySelector('main h1')?.textContent,'Мой профиль');
  const saveProfile=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Сохранить профиль');await click(saveProfile!);active('Профиль');assert.match(document.querySelector('[role="status"]')?.textContent??'',/Профиль сохранён/);
  await click(document.querySelector<HTMLInputElement>('.participant-public-toggle input')!);assert.equal(document.querySelector('[role="status"]'),null,'changing profile visibility clears the saved confirmation');
  assert.equal(link('Мои автомобили').getAttribute('href'),'/participant?tab=cars');
  await click(link('Мои автомобили'));assert.equal(location.search,'?tab=cars');active('Мои автомобили');assert.equal(document.querySelector('main h1')?.textContent,'Мои автомобили');
  await click(link('Регистрации'));assert.equal(location.search,'?tab=registrations');active('Регистрации');assert.equal([...document.querySelectorAll('button')].filter(b=>b.textContent==='QR-код для инспекции').length,1,'cancelled applications do not offer an unusable QR action');
  await act(async()=>history.back());await flush();active('Мои автомобили');
  await act(async()=>history.forward());await flush();active('Регистрации');
  await act(async()=>root.unmount());
  root=createRoot(document.getElementById('root')!);
  await act(async()=>root.render(<App/>));await flush();active('Регистрации');
  await act(async()=>{history.pushState({},'','/participant');window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();active('Обзор');
  assert.match(document.querySelector('.member-race-card button')?.textContent??'',/Открыть заявку/);
  const setup=[...document.querySelectorAll<HTMLButtonElement>('.participant-journey button')].find(b=>b.textContent?.includes('Настроить оборудование'));assert.ok(setup,'overview explains the next setup step');
  await click(setup!);assert.equal(location.pathname,'/participant/configurations');assert.equal(new URLSearchParams(location.search).get('carId'),'car1');
  await act(async()=>{history.pushState({},'','/participant');window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();
  assert.match(document.body.textContent??'',/Все ваши автомобили уже заявлены на этот этап/);
  for(const url of ['/participant/car?carId=car1','/participant/configurations?carId=car1']){
   await act(async()=>{history.pushState({},'',url);window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();
   assert.equal(document.querySelectorAll('.participant-tabs').length,1,'each subpage has one section navigation');active('Мои автомобили');
  }
  await click(link('Профиль'));active('Профиль');
  const previous=location.href;
  const modified=new window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});
  link('Профиль').dispatchEvent(modified);
  assert.equal(modified.defaultPrevented,false,'modified clicks keep native anchor behavior');
  assert.equal(location.href,previous);
 }finally{await act(async()=>root.unmount())}
}

export async function runRegistrationJourney(){
 const stage={id:'flow-stage',name:'Финал USD',date:'2026-11-21T12:00:00Z',registrationOpen:true,status:'PUBLISHED'};
 const car={id:'flow-car',brand:'Lada',model:'Vesta',isActive:true};
 const cls={id:'flow-class',name:'Limited 2.0',direction:{name:'SPL'}};
 const version={id:'flow-version',version:1,audioComponents:[{direction:'SUB',type:'SUBWOOFER',brand:'Test',model:'12'}]};
 let submitted:any=null;let releaseOld:((value:any)=>void)|null=null;let firstConfigurationRequest=true;
 state.__getPublic=async(path:string)=>{
  if(path==='/participants/me')return {participant:{id:'p1',firstName:'Иван',phone:'+79001111008'}};
  if(path==='/stages/public')return [stage];
  if(path==='/participants/me/cars')return [car,{...car,id:'other-car',model:'Granta'}];
  if(path==='/registrations/me')return submitted?[{id:'flow-registration',stage,stageId:stage.id,car,carId:car.id,status:'ACTIVE'}]:[];
  if(path==='/stages/flow-stage/classes')return [{classId:cls.id,class:cls}];
  if(path==='/cars/flow-car/configurations'){if(firstConfigurationRequest){firstConfigurationRequest=false;return new Promise(resolve=>{releaseOld=resolve})}return [{id:'flow-configuration',name:'На сезон',versions:[version]}]}
  if(path==='/cars/other-car/configurations')return [{id:'other-configuration',name:'Другой автомобиль',versions:[{...version,id:'other-version'}]}];
  if(path==='/auth/legal-consent')return {legalReady:true,version:'fixture',privacyAccepted:true,termsAccepted:true};
  return [];
 };
 state.__postAction=async(path:string,body:any)=>{assert.equal(path,'/registrations/me');submitted=body;return {id:'flow-registration'}};
 history.replaceState({},'','/participant/register?stageId=flow-stage');
 const root=createRoot(document.getElementById('root')!);
 const button=(label:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label)!;
 const select=async(label:string,value:string)=>{const input=[...document.querySelectorAll<HTMLLabelElement>('.registration-field')].find(l=>l.querySelector('span')?.textContent===label)!.querySelector('select')!;await act(async()=>{input.value=value;input.dispatchEvent(new window.Event('change',{bubbles:true}))});await flush()};
 try{
  await act(async()=>root.render(<App/>));await flush();await flush();
  assert.equal(button('Перейти к классам').disabled,true);
  await select('Ваш автомобиль',car.id);await select('Ваш автомобиль','other-car');
  await act(async()=>{releaseOld!([{id:'flow-configuration',name:'На сезон',versions:[version]}])});await flush();
  assert.ok(document.querySelector('.registration-field option[value="other-version"]'),'the latest car keeps its equipment when an earlier request finishes late');
  assert.equal(document.querySelector('.registration-field option[value="flow-version"]'),null);
  await select('Ваш автомобиль',car.id);await select('Сохранённое оборудование',version.id);
  assert.equal(button('Перейти к классам').disabled,false);await click(button('Перейти к классам'));
  assert.match(document.querySelector('.entry-task-title h2')?.textContent??'',/В каких классах/);
  assert.equal(button('Проверить заявку').disabled,true);
  await click(document.querySelector<HTMLInputElement>('.registration-class-option input')!);
  await click(button('Проверить заявку'));
  assert.equal(button('Подтвердить регистрацию').disabled,true,'rules are required even when account legal consent is current');
  await click(button('Изменить классы'));assert.equal(document.querySelector<HTMLInputElement>('.registration-class-option input')!.checked,true);
  await click(button('Назад'));assert.equal(document.querySelectorAll<HTMLSelectElement>('.registration-field select')[1].value,version.id);
  await click(button('Перейти к классам'));await click(button('Проверить заявку'));
  await click(document.querySelector<HTMLInputElement>('.registration-rules-consent input')!);
  assert.equal(button('Подтвердить регистрацию').disabled,false);await click(button('Подтвердить регистрацию'));
  assert.deepEqual(submitted,{stageId:stage.id,participantId:'p1',carId:car.id,configurationVersionId:version.id,classIds:[cls.id],source:'PRE_REGISTRATION',rulesAccepted:true});
  active('Регистрации');assert.match(document.body.textContent??'',/Финал USD/);
 }finally{await act(async()=>root.unmount())}
}

export async function runDashboardAvailability(){
 const stages=[{id:'first',name:'Первый этап',date:'2027-01-01',registrationOpen:true},{id:'second',name:'Второй этап',date:'2027-02-01',registrationOpen:true}];
 const cars=[{id:'one',brand:'Lada',model:'Vesta',configurations:[{}]}];
 const registrations=stages.map(stage=>({id:'entry-'+stage.id,stageId:stage.id,stage,carId:'one',status:'ACTIVE'}));
 const actions:string[]=[];
 const props={participant:{firstName:'Иван'},cars,stages,registrations,onGo:(path:string)=>actions.push(path),onAddCar:()=>{},onRegistration:()=>{},onStageRegistration:(stage:any)=>actions.push(stage.id)};
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<MemberDashboard {...props}/>));
  assert.equal(document.querySelector('.member-more-stages article button')?.textContent,'Открыть заявку');
  await click(document.querySelector<HTMLButtonElement>('.member-more-stages article button')!);assert.equal(actions.at(-1),'/participant/registration?registrationId=entry-second');
  assert.equal(document.querySelector('.member-race-add'),null);
  await act(async()=>root.render(<MemberDashboard {...props} cars={[...cars,{id:'two',brand:'Lada',model:'Granta',configurations:[{}]}]}/>));
  await click(document.querySelector<HTMLButtonElement>('.member-race-add')!);assert.equal(actions.at(-1),'first');
  assert.equal(document.querySelector('.member-more-stages article button')?.textContent,'Подать заявку');
  await click(document.querySelector<HTMLButtonElement>('.member-more-stages article button')!);assert.equal(actions.at(-1),'second');
 }finally{await act(async()=>root.unmount())}
}

export async function runFullyRegisteredStage(){
 const stage={id:'full-stage',name:'Этап USD',date:'2026-11-21',registrationOpen:true,status:'PUBLISHED'};
 const car={id:'full-car',brand:'Lada',model:'Vesta'};
 state.__getPublic=async(path:string)=>{
  if(path==='/participants/me')return {participant:{id:'p1',firstName:'Иван'}};
  if(path==='/stages/public')return [stage];
  if(path==='/participants/me/cars')return [car];
  if(path==='/registrations/me')return [{id:'full-registration',stage,stageId:stage.id,car,carId:car.id,status:'ACTIVE'}];
  return [];
 };
 history.replaceState({},'','/participant/register?stageId=full-stage');const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<App/>));await flush();await flush();
  assert.match(document.querySelector('main')?.textContent??'',/Все ваши автомобили уже зарегистрированы/,'repeat registration explains why there are no available cars');
  const open=[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Открыть мои заявки'));
  assert.ok(open,'provide a way to review existing entries instead of a disabled wizard');await click(open);active('Регистрации');
 }finally{await act(async()=>root.unmount())}
}

export async function runUnavailableStageRegistration(){
 const stages=[{id:'one',name:'Первый кубок',date:'2027-01-01',registrationOpen:true,status:'PUBLISHED'},{id:'two',name:'Второй кубок',date:'2027-02-01',registrationOpen:true,status:'PUBLISHED'}];
 let stageRows:any[]=stages,fail=false;
 state.__getPublic=async(path:string)=>{
  if(path==='/participants/me')return {participant:{id:'p1',firstName:'Иван'}};
  if(path==='/stages/public'){if(fail)throw new Error('Network failure');return stageRows}
  if(path==='/participants/me/cars')return [{id:'car1',brand:'Lada',model:'Vesta'}];
  return [];
 };
 for(const [url,rows] of [['/participant/register?stageId=missing',stages],['/participant/register',[]]] as const){
  stageRows=[...rows];history.replaceState({},'',url);const root=createRoot(document.getElementById('root')!);
  try{await act(async()=>root.render(<App/>));await flush();await flush();assert.equal(Boolean(document.querySelector('.participant-loading')),false,'invalid or empty stage links must not spin forever');assert.match(document.querySelector('main')?.textContent??'',/Этап не найден|Выберите этап/);assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent?.includes('Выбрать этап')))}finally{await act(async()=>root.unmount())}
 }
 stageRows=stages;fail=true;history.replaceState({},'','/participant/register?stageId=one');let root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<App/>));await flush();await flush();assert.equal(Boolean(document.querySelector('.participant-loading')),false);assert.match(document.querySelector('main')?.textContent??'',/Не удалось загрузить этапы/);fail=false;await click([...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes('Повторить загрузку'))!);assert.match(document.querySelector('.registration-hero')?.textContent??'',/Первый кубок/)}finally{await act(async()=>root.unmount())}
 history.replaceState({},'','/participant/register?stageId=one');root=createRoot(document.getElementById('root')!);
 try{await act(async()=>root.render(<App/>));await flush();await flush();await act(async()=>{history.pushState({},'','/participant/register?stageId=two');window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();assert.match(document.querySelector('.registration-hero')?.textContent??'',/Второй кубок/,'history navigation changes the actual registration event')}finally{await act(async()=>root.unmount())}
}
