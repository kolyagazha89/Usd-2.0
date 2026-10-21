import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../../src/App';
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
  if(path==='/participants/me')return {participant:{id:'p1',firstName:'Иван',lastName:'Тестовый',city:'Тюмень',phone:'+79000000000'}};
  if(path==='/stages/public')return [stage];
  if(path==='/participants/me/cars')return [car];
  if(path==='/registrations/me')return [{id:'reg1',stageId:stage.id,stage,carId:car.id,car,status:'ACTIVE',classes:[],results:[]}];
  if(path==='/auth/legal-consent')return {legalReady:false};
  if(path==='/auth/newsletter-consent')return {consent:false};
  return [];
 };
 history.replaceState({},'','/participant?tab=profile');
 let root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<App/>));await flush();active('Профиль');
  assert.equal(link('Мои автомобили').getAttribute('href'),'/participant?tab=cars');
  await click(link('Мои автомобили'));assert.equal(location.search,'?tab=cars');active('Мои автомобили');
  await click(link('Регистрации'));assert.equal(location.search,'?tab=registrations');active('Регистрации');
  await act(async()=>history.back());await flush();active('Мои автомобили');
  await act(async()=>history.forward());await flush();active('Регистрации');
  await act(async()=>root.unmount());
  root=createRoot(document.getElementById('root')!);
  await act(async()=>root.render(<App/>));await flush();active('Регистрации');
  await act(async()=>{history.pushState({},'','/participant');window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();active('Обзор');
  assert.match(document.querySelector('.participant-welcome button')?.textContent??'',/Мои регистрации/);
  assert.match(document.body.textContent??'',/На все доступные этапы ваши автомобили уже зарегистрированы/);
  for(const url of ['/participant/car?carId=car1','/participant/configurations?carId=car1']){
   await act(async()=>{history.pushState({},'',url);window.dispatchEvent(new window.PopStateEvent('popstate'))});await flush();
   assert.ok(document.querySelector('.participant-tabs'),'garage subpages must keep participant navigation');active('Мои автомобили');
  }
  await click(link('Профиль'));active('Профиль');
  const previous=location.href;
  const modified=new window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});
  link('Профиль').dispatchEvent(modified);
  assert.equal(modified.defaultPrevented,false,'modified clicks keep native anchor behavior');
  assert.equal(location.href,previous);
 }finally{await act(async()=>root.unmount())}
}
