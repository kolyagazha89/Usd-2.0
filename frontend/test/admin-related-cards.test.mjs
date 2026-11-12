import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

test('a related-car link restores the exact record card and supports modified clicks',async()=>{
 const dir=await mkdtemp(path.resolve('test/.related-cards-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/records'});
 const values={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true};
 const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const outfile=path.join(dir,'flow.mjs');
  await build({stdin:{contents:`import React,{act,useState} from 'react';import {createRoot} from 'react-dom/client';import {AdminEntityLink,AdminNavigationContext,useAdminDetail} from './src/admin/AdminEntityLink';
const row={id:'record-1'};let current='';let parentClicks=0;
function Cards(){const [detail,setDetail]=useAdminDetail([row]);return detail?<div onClick={()=>parentClicks++}><h2>Record {detail.id}</h2><AdminEntityLink kind="car" id="car/1">Car</AdminEntityLink></div>:<button onClick={()=>setDetail(row)}>Open record</button>}
function Harness(){const [path,go]=useState('/admin/records');current=path;return <AdminNavigationContext.Provider value={{path,go}}>{path.startsWith('/admin/cars')?<button onClick={()=>go(new URLSearchParams(path.split('?')[1]).get('returnTo'))}>Back to source</button>:<Cards/>}</AdminNavigationContext.Provider>}
export async function run(assert){const root=createRoot(document.getElementById('root'));await act(async()=>root.render(<Harness/>));await act(async()=>document.querySelector('button').click());assert.equal(current,'/admin/records?view=record-1');const link=document.querySelector('a');assert.ok(link.href.includes('carId=car%2F1'));assert.ok(link.href.includes('returnTo=%2Fadmin%2Frecords%3Fview%3Drecord-1'));const modified=new window.MouseEvent('click',{bubbles:true,cancelable:true,ctrlKey:true});link.dispatchEvent(modified);assert.equal(modified.defaultPrevented,false);assert.equal(parentClicks,0);await act(async()=>link.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true})));assert.ok(current.startsWith('/admin/cars?'));assert.equal(parentClicks,0);await act(async()=>document.querySelector('button').click());assert.equal(document.querySelector('h2').textContent,'Record record-1');await act(async()=>root.unmount())}`,
   resolveDir:path.resolve('.'),loader:'tsx'},bundle:true,format:'esm',platform:'node',packages:'external',jsx:'automatic',outfile});
  const flow=await import(pathToFileURL(outfile).href);await flow.run(assert);
 }finally{dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}await rm(dir,{recursive:true,force:true})}
});
