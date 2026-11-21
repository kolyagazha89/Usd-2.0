import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
test('role switching and cancellation preserve dirty names and permissions',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.compact-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/participants'});
 const keys=['window','document','location','history','sessionStorage','HTMLElement','IS_REACT_ACT_ENVIRONMENT','__released','__photoFail','__auditCalls','requestAnimationFrame','__roleWrites'];
 const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{
  for(const k of keys.slice(0,6))globalThis[k]=dom.window[k];globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__released=[];globalThis.__roleWrites=0;globalThis.__auditCalls=[];globalThis.requestAnimationFrame=fn=>{fn();return 0};
  const outfile=path.join(scratch,'fixture.mjs');
  await build({entryPoints:[path.join(base,'fixtures/role-draft.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},plugins:[{name:'mock-api',setup(b){b.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:`export const apiGet=async()=>[{id:'judge',name:'Судья',key:'judge',permissions:{},_count:{users:0}},{id:'operator',name:'Оператор',key:'operator',permissions:{},_count:{users:0}}];export const listData=x=>x;export const apiPatch=async()=>{globalThis.__roleWrites++};export const apiPost=apiPatch;export const apiDelete=apiPatch;`}))}}]});
  await (await import(pathToFileURL(outfile).href)).run();
 }finally{dom.window.close();for(const [k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}await rm(scratch,{recursive:true,force:true})}
});
