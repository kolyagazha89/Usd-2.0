import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../../src/App';
const state=globalThis as any;
const flush=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,35))});
const click=async(element:HTMLElement)=>{assert.ok(element);await act(async()=>element.click());await flush()};
const rows=()=>[...document.querySelectorAll<HTMLTableRowElement>('.data-table tbody tr')];
const next=()=>document.querySelector<HTMLButtonElement>('[aria-label="Следующая страница автомобилей"]')!;
const previous=()=>document.querySelector<HTMLButtonElement>('[aria-label="Предыдущая страница автомобилей"]')!;
const type=async(value:string)=>{await act(async()=>{const input=document.querySelector<HTMLInputElement>('[aria-label="Поиск автомобилей"]')!;Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}))});await flush()};
export async function runCarsPagination(){
 let cars=Array.from({length:63},(_,index)=>({id:'car-'+(index+1),brand:'Lada',model:'Модель '+String(index+1).padStart(2,'0'),isActive:true,configurations:[],participant:{firstName:'Тест',lastName:'Участник'}}));
 state.__getPublic=async(path:string)=>path==='/cars'?cars:[];
 history.replaceState({},'','/admin/cars');
 const root=createRoot(document.getElementById('root')!);
 try{
  await act(async()=>root.render(<App/>));await flush();
  assert.equal(rows().length,25);assert.equal(previous().disabled,true);assert.match(rows()[0].textContent??'',/Модель 01/);
  await click(next());assert.equal(rows().length,25);assert.match(rows()[0].textContent??'',/Модель 26/);
  await click(rows()[0].querySelector<HTMLButtonElement>('.car-name-button')!);
  assert.match(document.querySelector('.detail-grid')?.textContent??'',/Модель 26/);
  await click([...document.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Назад')!);
  assert.match(rows()[0].textContent??'',/Модель 26/);
  await click(next());assert.equal(rows().length,13);assert.equal(next().disabled,true);
  await type('Модель 63');assert.equal(rows().length,1);assert.match(rows()[0].textContent??'',/Модель 63/);assert.equal(next(),null,'search runs over the whole collection and resets its page');
  await type('неизвестный автомобиль');assert.equal(rows().length,0);assert.match(document.querySelector('.empty-state')?.textContent??'',/По запросу ничего не найдено/);
  await type('');assert.equal(rows().length,25);assert.equal(previous().disabled,true);
  await click(next());cars=cars.slice(0,12);
  await click(document.querySelector<HTMLButtonElement>('[aria-label="Обновить список автомобилей"]')!);
  assert.equal(rows().length,12,'refresh must clamp a page that no longer exists');
 }finally{await act(async()=>root.unmount())}
}
