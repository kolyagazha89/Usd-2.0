import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('merge readiness and preview reject stale or malformed pair responses',async t=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.merge-preview-race-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/profile-links'});
 const values={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,__previewGet:null};
 const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const outfile=path.join(scratch,'preview.mjs');
  await build({entryPoints:[path.join(base,'fixtures/merge-preview-race.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',
   plugins:[{name:'mock-merge-preview-api',setup(builder){builder.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:'export const apiGet=(path)=>globalThis.__previewGet(path);export const apiPost=()=>Promise.reject(new Error("No merge allowed"));export const listData=value=>Array.isArray(value)?value:[];'}))}}]});
  const workflow=await import(pathToFileURL(outfile).href);
  for(const mode of ['stale-success','stale-error','discarded-selection','unmounted','malformed-readiness'])
   await t.test(mode,()=>workflow.runMergePreviewRace(mode));
 }finally{
  dom.window.close();
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  await rm(scratch,{recursive:true,force:true});
 }
});
