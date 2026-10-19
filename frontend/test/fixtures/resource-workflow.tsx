import React,{act,useState,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import ImportPage from '../../src/admin/ImportPage';
import ResourcePage from '../../src/admin/ResourcePage';
import assert from 'node:assert/strict';
const state=globalThis as any;
let saved=0;
const Frame=({children}:any)=><div>{children}</div>;
const Form=({onSubmit,initial}:any)=><button id="save" onClick={()=>onSubmit(initial)}>Save</button>;
const Detail=({onEdit,onClose}:any)=><div><button id="edit-detail" onClick={onEdit}>Edit</button><button onClick={onClose}>Back</button></div>;
function Harness(){const[path,setPath]=useState('/admin/stages');useLayoutEffect(()=>{window.scrollTo({top:0})},[path]);return <ResourcePage title="Этапы" subtitle="" path="/stages" routePath={path} go={p=>{history.pushState({},'',p);setPath(p)}} seasonFilter columns={[{key:'name',label:'Название'}]} fields={[{name:'name',label:'Название'}]} update={async()=>{saved++}} PageFrame={Frame} ErrorPanel={Frame} LoadingPage={Frame} Empty={Frame} EntityForm={Form} EntityDetailModal={Detail} formatCell={v=>v} getPath={(o,p)=>o[p]}/>}
export async function runWorkflow(){
const root=createRoot(document.getElementById('root')!);
const flush=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,30))})};
await act(async()=>root.render(<Harness/>));await flush();
assert.equal(document.querySelector('select')?.value,'2025');
assert.equal(document.querySelector('input')?.value,'Волгоград');
assert.equal(document.querySelectorAll('tbody tr').length,1);
window.scrollTo({top:4500});await flush();
await act(async()=>{(document.querySelector('button[title="Изменить"]') as HTMLElement).click()});await flush();
assert.match(location.search,/season=2025/);
assert.ok(document.getElementById('save'));
await act(async()=>{document.getElementById('save')!.click()});await flush();
assert.equal(saved,1);assert.equal(document.querySelector('select')?.value,'2025');assert.equal(document.querySelector('input')?.value,'Волгоград');
assert.equal(document.querySelectorAll('tbody tr').length,1);assert.equal(window.scrollY,4500);
await act(async()=>root.unmount());
console.log('PASS: stage edit/save retains season, search, status, filtered rows, and scroll position');

}

export async function runImportWorkflow(){
 history.replaceState({},'', '/admin/import?jobId=job1');
 function ImportHarness(){const[path,setPath]=useState('/admin/import?jobId=job1');useLayoutEffect(()=>{window.scrollTo({top:0})},[path]);return <ImportPage path={path} go={p=>{history.pushState({},'',p);setPath(p)}} PageFrame={Frame} PanelTitle={Frame} Empty={Frame} enumLabel={v=>String(v)}/>}
 const root=createRoot(document.getElementById('root')!);
 const flush=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,30))})};
 await act(async()=>root.render(<ImportHarness/>));await flush();
 assert.equal(document.querySelectorAll('.import-row').length,150);
 window.scrollTo({top:12000});await flush();
 await act(async()=>{(document.querySelector('.import-row:last-child button') as HTMLElement).click()});await flush();
 assert.match(location.search,/rowId=r150/);
 const save=[...document.querySelectorAll('button')].find(b=>b.textContent?.includes('Сохранить решение'))!;
 assert.ok(save);assert.equal(save.disabled,false);
 await act(async()=>save.click());await flush();
 assert.equal(document.querySelectorAll('.import-row').length,150);
 assert.equal(window.scrollY,12000);
 assert.equal((globalThis as any).__importSaves,1);
 await act(async()=>root.unmount());
}
