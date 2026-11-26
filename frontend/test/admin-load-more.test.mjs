import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('load more appends records, resets on filtering and restores expanded lists on return',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.load-more-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/inspections'}),previous=new Map();
 try{
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,IS_REACT_ACT_ENVIRONMENT:true})){
   previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const outfile=path.join(scratch,'load.mjs');
  await build({stdin:{contents:"import React from 'react';import {AdminLoadMore,useIncrementalRows} from './src/admin/AdminLoadMore';export function Harness({viewKey,filter='',total=25}){const all=Array.from({length:total},(_,i)=>({id:i+1}));const rows=filter?all.filter(row=>row.id===Number(filter)):all;const list=useIncrementalRows(viewKey,rows,filter);return <><ul>{list.rows.map(row=><li key={row.id}>{row.id}</li>)}</ul><AdminLoadMore label='Инспекции' total={rows.length} shown={list.rows.length} onMore={list.showMore}/></>}",resolveDir:path.join(base,'..'),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',outfile});
  const {Harness}=await import(pathToFileURL(outfile).href),React=await import('react'),{createRoot}=await import('react-dom/client');let root=createRoot(document.getElementById('root'));
  const render=async(viewKey='inspections',filter='',total=25)=>React.act(async()=>root.render(React.createElement(Harness,{viewKey,filter,total})));
  const records=()=>[...document.querySelectorAll('li')].map(el=>Number(el.textContent));
  const more=async()=>React.act(async()=>document.querySelector('button').click());
  try{
   await render();assert.equal(records().length,10);await more();assert.deepEqual(records(),Array.from({length:20},(_,i)=>i+1));
   await React.act(async()=>root.unmount());root=createRoot(document.getElementById('root'));await render();assert.equal(records().length,20,'return keeps loaded records');
   await more();assert.equal(records().length,25);assert.equal(document.querySelectorAll('button').length,0,'all records loaded, no redundant button');
   await render('inspections','3');assert.deepEqual(records(),[3]);await render();assert.equal(records().length,10,'new filter resets expansion');
   await more();await render('inspections','',35);assert.equal(records().length,20,'refresh keeps expansion');
   await render('results');assert.equal(records().length,10,'another list starts with its own count');
  }finally{await React.act(async()=>root.unmount())}
 }finally{
  dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  await rm(scratch,{recursive:true,force:true});
 }
});
