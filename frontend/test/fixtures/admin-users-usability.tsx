import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import UsersPage from '../../src/admin/UsersPage';

const PageFrame=({children,action,title}:any)=><main><h1>{title}</h1>{action}{children}</main>;
const ErrorPanel=({message}:any)=><p role="alert">{message}</p>;
const LoadingPage=()=> <p>Загружаем…</p>;
const EntityForm=()=>null;
const EntityDetailModal=({title,onClose}:any)=><article><h2>{title}</h2><button onClick={onClose}>К списку</button></article>;
const flush=async()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,20))});

export async function runAdminUserUsability(){
 const host=document.createElement('div');document.body.appendChild(host);
 const root=createRoot(host);
 const Harness=()=> <UsersPage PageFrame={PageFrame} ErrorPanel={ErrorPanel} LoadingPage={LoadingPage} EntityForm={EntityForm} EntityDetailModal={EntityDetailModal} formatDate={String} go={()=>{}}/>;
 const button=(name:string)=>[...host.querySelectorAll('button')].find(el=>el.textContent?.trim()===name) as HTMLButtonElement|undefined;
 const click=async(el:HTMLElement|undefined)=>{assert.ok(el,'expected clickable control');await act(async()=>el.click());await flush()};
 const choose=async(el:HTMLSelectElement,value:string)=>{
  await act(async()=>{el.value=value;el.dispatchEvent(new window.Event('change',{bubbles:true}))});await flush();
 };
 await act(async()=>root.render(<Harness/>));await flush();
 assert.equal(host.querySelectorAll('.data-table tbody tr').length,1,'test participant is listed');
 const system=()=>host.querySelector('select[aria-label="Системная роль participant@usd.test"]') as HTMLSelectElement;
 await choose(system(),'ADMIN');
 assert.equal((globalThis as any).__userPatches.length,0,'selecting ADMIN must not immediately persist access');
 assert.ok(host.textContent?.includes('полный доступ'),'the escalation warning is visible');
 await click(button('Отмена'));
 assert.equal((globalThis as any).__userPatches.length,0,'cancel does not mutate privileges');
 assert.equal(system().value,'PARTICIPANT','cancel restores current database role');
 await choose(system(),'ADMIN');
 await click(button('Подтвердить изменение роли'));
 assert.equal((globalThis as any).__userPatches.length,1,'the confirmed role is written once');
 assert.equal((globalThis as any).__userPatches[0].path,'/auth/admin/users/usr1/role');
 assert.equal((globalThis as any).__userPatches[0].body.role,'ADMIN');
 assert.equal(system().value,'ADMIN','list refreshes from persisted role');
 const custom=host.querySelector('select[aria-label="Пользовательская роль participant@usd.test"]') as HTMLSelectElement;
 await choose(custom,'judge');
 assert.equal((globalThis as any).__userPatches.length,1,'custom role also needs confirmation');
 await click(button('Подтвердить изменение роли'));
 assert.equal((globalThis as any).__userPatches[1].path,'/auth/admin/users/usr1/custom-role');
 assert.equal((globalThis as any).__userPatches[1].body.customRoleId,'judge');
 const search=host.querySelector('input[aria-label="Поиск пользователей по email"]') as HTMLInputElement;
 await act(async()=>{search.value='missing@example.test';search.dispatchEvent(new window.Event('input',{bubbles:true}))});await flush();
 await click(button('Найти'));
 assert.ok(host.textContent?.includes('Пользователи не найдены'),'no-results state explains the missing rows');
 await click(button('Сбросить поиск и фильтры'));
 assert.equal(host.querySelectorAll('.data-table tbody tr').length,1,'reset restores the list');
 assert.equal((host.querySelector('input[aria-label="Поиск пользователей по email"]') as HTMLInputElement).value,'');
 const row=host.querySelector('.data-table tbody tr') as HTMLElement;
 assert.equal(row.getAttribute('tabindex'),'0','list row is keyboard reachable');
 await act(async()=>row.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));await flush();
 assert.ok(host.textContent?.includes('Пользователь'),'keyboard opens details');
 await act(async()=>root.unmount());host.remove();
}
