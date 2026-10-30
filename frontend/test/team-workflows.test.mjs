import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('team management renders real join, commander, moderation and archive workflows',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.team-workflows-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/participant?tab=team'});
 const values={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,__teamApi:null};
 const old=new Map(Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{
  for(const [k,v] of Object.entries(values))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
  const outfile=path.join(scratch,'workflows.mjs');
  await build({entryPoints:[path.join(base,'fixtures/team-workflows.tsx')],bundle:true,format:'esm',platform:'node',jsx:'automatic',packages:'external',outfile,
   plugins:[{name:'synthetic-team-api',setup(builder){builder.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:`export const apiGet=path=>globalThis.__teamApi('GET',path); export const apiPost=(path,body)=>globalThis.__teamApi('POST',path,body); export const apiPatch=(path,body)=>globalThis.__teamApi('PATCH',path,body); export const listData=x=>Array.isArray(x)?x:[];`}))}}]});
  await (await import(pathToFileURL(outfile).href)).runTeamWorkflows();
 }finally{dom.window.close();for(const [k,v] of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}await rm(scratch,{recursive:true,force:true})}
});
