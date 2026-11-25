import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('operational controls start collapsed, remember explicit expansion on return and isolate desks',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.ops-controls-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/registrations'}),previous=new Map();
 try{
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true})){
   previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const outfile=path.join(scratch,'controls.mjs');
  await build({stdin:{contents:"export * from './src/admin/EventOperationsControls'",resolveDir:path.join(base,'..'),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',outfile});
  const {EventOperationsStagePicker:Stage,EventOperationsActions:Actions}=await import(pathToFileURL(outfile).href);
  const React=await import('react'),{createRoot}=await import('react-dom/client');let root=createRoot(document.getElementById('root'));
  const render=async(viewKey,stageId='s1')=>React.act(async()=>root.render(React.createElement(React.Fragment,null,
   React.createElement(Stage,{viewKey,stageId,stageName:'Тестовый этап'},'Выбор этапа'),React.createElement(Actions,{viewKey},'Кнопки действий'))));
  const stages=()=>document.querySelector('.event-ops-stage-drawer'),actions=()=>document.querySelector('.event-ops-actions-drawer');
  try{
   await render('registrations');assert.equal(stages().open,false);assert.equal(actions().open,false);
   await React.act(async()=>{for(const el of [stages(),actions()]){el.open=true;el.dispatchEvent(new window.Event('toggle'))}});
   await React.act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await render('registrations');
   assert.equal(stages().open,true,'return preserves the list height by restoring the expanded stage controls');
   assert.equal(actions().open,true,'return restores expanded actions');
   await render('inspections');assert.equal(stages().open,false,'another desk starts collapsed');assert.equal(actions().open,false);
   await render('inspections','');assert.equal(stages().open,true,'without a selected stage the selector is available');
  }finally{await React.act(async()=>root.unmount())}
 }finally{
  dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  await rm(scratch,{recursive:true,force:true});
 }
});
