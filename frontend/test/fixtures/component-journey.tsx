import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import {CatalogPage} from '../../src/admin/CatalogPage';
const flush=async()=>act(async()=>{await new Promise(r=>setTimeout(r,20))});
const button=(s:string)=>[...document.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.includes(s))!;
const click=async(s:string)=>{assert.ok(button(s));await act(async()=>button(s).click());await flush()};
const select=async(label:string,value:string)=>{const e=[...document.querySelectorAll('label')].find(x=>x.textContent?.startsWith(label))?.querySelector('select');assert.ok(e);await act(async()=>{e.value=value;e.dispatchEvent(new Event('change',{bubbles:true}))});await flush()};
const Frame=({children}:any)=><main>{children}</main>,Title=({title}:any)=><h2>{title}</h2>,Empty=({text}:any)=><p>{text}</p>;
export async function run(){const root=createRoot(document.getElementById('root')!);try{
 await act(async()=>root.render(<CatalogPage mode="components" PageFrame={Frame} PanelTitle={Title} Empty={Empty} LoadingPage={()=>null}/>));await flush();
 await click('Запросы');assert.match(document.body.textContent!,/Ошибка очереди/);await click('Повторить');assert.match(document.body.textContent!,/Old One/);await select('Статус','RESOLVED');assert.match(document.body.textContent!,/New Done/);await click('Каталог');
 await select('Исходная марка','source');await select('Оставить название','target');
 (globalThis as any).__hold=true;await act(async()=>button('Предпросмотр').click());await flush();
 for(const label of ['Исходная марка','Оставить название','Область']){const e=[...document.querySelectorAll('label')].find(x=>x.textContent?.startsWith(label))?.querySelector('select');assert.ok(e?.disabled,label+' must be disabled while preview is pending')}
 assert.ok(button('Усилители').disabled,'category must be disabled while preview is pending');
 await act(async()=>(globalThis as any).__resolvePreview());(globalThis as any).__hold=false;await flush();assert.match(document.body.textContent!,/совпадений: 1/);await click('Подтвердить объединение');assert.equal((globalThis as any).__lastMerge.scope,'HEAD_UNIT');
 await select('Исходная марка','source');await select('Оставить название','target');await click('Предпросмотр');assert.match(document.body.textContent!,/совпадений: 1/);await click('Отмена');assert.doesNotMatch(document.body.textContent!,/Предпросмотр объединения/);
 await click('Предпросмотр');(globalThis as any).__failure=true;await click('Подтвердить объединение');assert.match(document.body.textContent!,/Конфликт/);await click('Предпросмотр');(globalThis as any).__failure=false;await click('Подтвердить объединение');assert.match(document.body.textContent!,/Марки объединены/);assert.ok((globalThis as any).__loads>=2);
 }finally{await act(async()=>root.unmount())}}
