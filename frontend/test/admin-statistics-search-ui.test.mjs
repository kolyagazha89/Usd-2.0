import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('statistics searches automatically and ignores stale results, cleared queries and stale details',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.statistics-search-'));
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://usd.test/admin/statistics'}),originals=new Map();
 try{
  for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){
   originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  const outfile=path.join(scratch,'statistics.mjs');
  await build({entryPoints:[path.join(base,'fixtures/admin-statistics-search.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},plugins:[{name:'search-api',setup(b){
   b.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:'export const apiGet=p=>globalThis.__searchApi(p);export const listData=x=>x;'}));
   b.onLoad({filter:/[\\/]AdminEntityLink\.tsx$/},()=>({loader:'tsx',contents:'export const AdminEntityLink=({children})=><span>{children}</span>;'}));
  }}]});
  await (await import(pathToFileURL(outfile).href)).runStatisticsSearch();
 }finally{
  for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  dom.window.close();await rm(scratch,{recursive:true,force:true});
 }
});
