import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import DuplicateProfilesPreview from '../../src/admin/DuplicateProfilesPreview';

const people=[{id:'source',lastName:'Альфа',firstName:'Участник'},{id:'old-target',lastName:'Бета',firstName:'Участник'},{id:'new-target',lastName:'Гамма',firstName:'Участник'}];
const click=async(element:HTMLElement)=>{assert.ok(element);await act(async()=>element.click())};
const button=()=>document.querySelector<HTMLButtonElement>('.duplicate-profile-preview > button')!;
const choose=async(index:number,query:string)=>{
 const picker=document.querySelectorAll('.duplicate-choose-profile')[index];
 const input=picker.querySelector('input')!;
 await act(async()=>{
  input.focus();
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,query);
  input.dispatchEvent(new window.Event('input',{bubbles:true}));
 });
 await click(picker.querySelector<HTMLButtonElement>('li button')!);
};
const snapshot=(id:string)=>({id,name:people.find(p=>p.id===id)!.lastName,linkedUserId:null,birthDate:null,cars:[],registrations:[]});
const preview=(targetId:string)=>({state:'DRY_RUN_ONLY',canMerge:false,source:snapshot('source'),target:snapshot(targetId),counts:{source:{cars:1},target:{cars:2}},conflicts:[],constraints:[]});
const readiness=()=>({state:'READ_ONLY',canMergeNow:false,conflicts:[{code:'POLICY',description:'Requires review'}]});

export async function runMergePreviewRace(mode:string){
 const requests:Array<{resolve:(value:unknown)=>void;reject:(error:Error)=>void;path:string}>=[];
 (globalThis as any).__previewGet=(path:string)=>path==='/admin/participants'?Promise.resolve(people):new Promise((resolve,reject)=>requests.push({resolve,reject,path}));
 const root=createRoot(document.getElementById('root')!);let mounted=true;
 const resolvePair=async(offset:number,target:string)=>{
  await act(async()=>{requests[offset].resolve(preview(target));requests[offset+1].resolve(readiness());});
 };
 try{
  await act(async()=>root.render(<DuplicateProfilesPreview/>));
  await choose(0,'Альфа');await choose(1,'Бета');await click(button());
  assert.equal(requests.length,2);assert.match(requests[0].path,/targetId=old-target/);
  assert.match(requests[1].path,/duplicates\/readiness/);
  if(mode==='unmounted'){
   await act(async()=>root.unmount());mounted=false;
   await resolvePair(0,'old-target');
   assert.equal(document.querySelector('.duplicate-preview-result'),null);return;
  }
  await choose(1,'Гамма');
  assert.equal(button().disabled,false,'new pair must not remain blocked by old request');
  if(mode==='discarded-selection'){
   await resolvePair(0,'old-target');
   assert.equal(document.querySelector('.duplicate-preview-result'),null);return;
  }
  await click(button());assert.equal(requests.length,4);assert.match(requests[2].path,/targetId=new-target/);
  if(mode==='stale-error'){
   await act(async()=>requests[0].reject(new Error('Error from previous pair')));
  }else{
   await resolvePair(0,'old-target');
  }
  assert.equal(document.querySelector('.duplicate-preview-result'),null,'old response must not replace new request');
  assert.equal(document.querySelector('[role="alert"]'),null,'stale error must be ignored');
  assert.equal(button().disabled,true,'old finally must not unlock new request');
  if(mode==='malformed-readiness'){
   await act(async()=>{requests[2].resolve(preview('new-target'));requests[3].resolve([]);});
   assert.equal(document.querySelector('.duplicate-preview-result'),null,'malformed readiness must fail closed');
   assert.match(document.querySelector('[role="alert"]')?.textContent??'',/Не удалось|Некоррект/);
  }else{
   await resolvePair(2,'new-target');
   assert.match(document.querySelector('.duplicate-preview-metrics')!.textContent!,/Гамма/);
   assert.doesNotMatch(document.querySelector('.duplicate-preview-metrics')!.textContent!,/Бета/);
   assert.equal(button().disabled,false);
  }
 }finally{if(mounted)await act(async()=>root.unmount())}
}
