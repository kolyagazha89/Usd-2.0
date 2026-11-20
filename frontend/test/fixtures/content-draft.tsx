import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import NewsPage from '../../src/admin/NewsPage';
import EmailTemplatesPage from '../../src/admin/EmailTemplatesPage';
const flush=async()=>act(async()=>{await new Promise(r=>setTimeout(r,10))});
export async function run(){
 const host=document.getElementById('root')!,root=createRoot(host);
 const Frame=({children,action}:any)=><main>{action}{children}</main>,Text=({text,title}:any)=><p>{text??title}</p>;
 const button=(name:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===name)!;
 const click=async(b:HTMLElement)=>{assert.ok(b);await act(async()=>b.click());await flush()};
 const type=async(el:HTMLInputElement,value:string)=>{await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new window.Event('input',{bubbles:true}))});await flush()};
 await act(async()=>root.render(<NewsPage PageFrame={Frame} PanelTitle={Text} Empty={Text} LoadingPage={Text} formatDate={String}/>));await flush();
 await click(button('Создать новость'));
 const title=host.querySelector('.news-editor input') as HTMLInputElement;
 await type(title,'Не потерять текст');await click(button('Создать новость'));
 assert.equal(title.value,'Не потерять текст');assert.match(host.querySelector('[role="alert"]')!.textContent!,/несохранённая новость/);
 await click(button('Продолжить редактирование'));assert.equal(title.value,'Не потерять текст');
 await click(button('Отмена'));await click(button('Отбросить изменения'));assert.equal(host.querySelector('.news-editor'),null);
 assert.equal((globalThis as any).__roleWrites,0,'discard never persists a news draft');
 await act(async()=>root.render(<EmailTemplatesPage PageFrame={Frame} PanelTitle={Text}/>));await flush();
 await type(host.querySelector('.email-template-editor input') as HTMLInputElement,'Правка имени');
 const send=()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Отправить тест этого триггера'))!;
 assert.equal(send().disabled,true,'unsaved template cannot be sent as if it were persisted');
 assert.match(host.querySelector('[role="status"]')!.textContent!,/несохранённые изменения/);
 await click(button('Сохранить изменения'));assert.equal((globalThis as any).__roleWrites,1);assert.equal(send().disabled,false);
 await act(async()=>root.unmount());
}
