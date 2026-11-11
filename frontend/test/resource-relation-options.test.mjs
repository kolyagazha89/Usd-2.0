import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

test('relation selectors preserve separate season IDs with equal names and year-only labels',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url));
 const scratch=await mkdtemp(path.join(base,'.relation-options-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/stages/new'});
 const globals={window:dom.window,document:dom.window.document,sessionStorage:dom.window.sessionStorage,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout};
 const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const outfile=path.join(scratch,'workflow.mjs');
  await build({stdin:{contents:`
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import ResourcePage from '../src/admin/ResourcePage';
import {EntityForm} from '../src/admin/FormComponents';
const Empty=()=>null;
const Form=props=><EntityForm {...props} enumLabel={x=>x}/>;
export async function run(){
 const root=createRoot(document.getElementById('root'));
 await act(async()=>{
  root.render(<ResourcePage title="Этапы" subtitle="" path="/stages" routePath="/admin/stages/new" go={()=>{}} columns={[]} fields={[{name:'seasonId',label:'Сезон',optionsPath:'/seasons',optionLabel:s=>String(s.year)+(s.name?' · '+s.name:'')},{name:'team',label:'Команда',optionsPath:'/participants/teams'}]} create={async()=>({})} PageFrame={({children})=>children} ErrorPanel={Empty} LoadingPage={Empty} Empty={Empty} EntityForm={Form} EntityDetailModal={Empty} formatCell={x=>x} getPath={(o,k)=>o[k]}/>);
 });
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))});
 const inputs=document.querySelectorAll('input[role="combobox"]');
 await act(async()=>{inputs[0].dispatchEvent(new window.FocusEvent('focusin',{bubbles:true}))});
 const seasons=Array.from(document.querySelectorAll('[role="option"]'),node=>node.textContent);
 await act(async()=>{inputs[0].dispatchEvent(new window.FocusEvent('focusout',{bubbles:true}));inputs[1].dispatchEvent(new window.FocusEvent('focusin',{bubbles:true}))});
 const teams=Array.from(document.querySelectorAll('[role="option"]'),node=>node.textContent);
 await act(async()=>root.unmount());
 return {seasons,teams};
}`,resolveDir:base,loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},plugins:[{name:'relation-api',setup(b){b.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:`
export const apiGet=async p=>p==='/seasons'?[{id:'2025',year:2025,name:'USD'},{id:'2026',year:2026,name:'USD'},{id:'2027',year:2027}]:p==='/participants/teams'?[{name:'Team A'},{name:'team a'},{name:'Team B'}]:[];
export const getSiteSettings=async()=>({settings:{catalogs:{teams:['Team A']}}});
export const listData=x=>x;
export const apiPost=async()=>({});
`}))}}]});
  const result=await(await import(pathToFileURL(outfile).href)).run();
  assert.deepEqual(result.seasons.sort(),['2025 · USD','2026 · USD','2027']);
  assert.deepEqual(result.teams,['Team A','Team B'],'name-based team catalog still deduplicates aliases');
 }finally{
  for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  dom.window.close();await rm(scratch,{recursive:true,force:true});
 }
});
