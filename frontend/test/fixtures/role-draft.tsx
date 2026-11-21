import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import RolesPage from '../../src/admin/RolesPage';
const flush=async()=>act(async()=>{await new Promise(r=>setTimeout(r,5))});
export async function run(){
 const host=document.getElementById('root')!,root=createRoot(host);
 const Frame=({children,action}:any)=><main>{action}{children}</main>,Text=({text,message}:any)=><p>{text??message}</p>;
 const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
 const click=async(b:HTMLElement)=>{assert.ok(b);await act(async()=>b.click());await flush()};
 const input=()=>host.querySelector('.role-basic-fields input') as HTMLInputElement;
 await act(async()=>root.render(<RolesPage PageFrame={Frame} ErrorPanel={Text} Empty={Text} LoadingPage={Text}/>));await flush();
 await click(host.querySelectorAll<HTMLButtonElement>('.role-summary-actions button')[0]);
 assert.equal(input().value,'Судья');
 await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input(),'Черновик');input().dispatchEvent(new window.Event('input',{bubbles:true}))});await flush();
 await click(host.querySelectorAll<HTMLButtonElement>('.role-summary')[1].querySelector('button')!);
 assert.equal(input().value,'Черновик','switch does not destroy edits');
 assert.ok(host.querySelector('[role="alert"]'));
 await click(button('Продолжить редактирование'));assert.equal(input().value,'Черновик');
 await click(button('Создать роль'));await click(button('Отбросить изменения'));assert.equal(input().value,'');
 await click(button('Отмена'));assert.equal(host.querySelector('.role-basic-fields'),null,'untouched new draft closes immediately');
 await click(host.querySelector('.role-summary button')!);
 const permission=host.querySelector('.permission-actions input') as HTMLInputElement;
 await click(permission);await click(button('Отмена'));assert.ok(host.querySelector('[role="alert"]'),'permission changes also require explicit discard');
 await click(button('Продолжить редактирование'));assert.equal(permission.checked,true);
 assert.equal((globalThis as any).__roleWrites,0,'navigation never persists a role');
 await act(async()=>root.unmount());
}
