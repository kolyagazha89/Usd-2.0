import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
test('content editors preserve news drafts and require saving before test email',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.compact-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/participants'});
 const keys=['window','document','location','history','sessionStorage','HTMLElement','IS_REACT_ACT_ENVIRONMENT','__released','__photoFail','__auditCalls','requestAnimationFrame','cancelAnimationFrame','__roleWrites'];
 const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{
  for(const k of keys.slice(0,6))globalThis[k]=dom.window[k];globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__released=[];globalThis.__roleWrites=0;globalThis.__auditCalls=[];globalThis.requestAnimationFrame=fn=>{fn();return 0};globalThis.cancelAnimationFrame=()=>{};window.scrollTo=()=>{};
  const outfile=path.join(scratch,'fixture.mjs');
  await build({entryPoints:[path.join(base,'fixtures/content-draft.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},plugins:[{name:'mock-api',setup(b){b.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:`export const getSiteSettings=async()=>({settings:{news:[],registration:{}}});export const apiGet=async p=>p==='/site-settings'?{settings:{registration:{}}}:{items:[],pagination:{total:0,pages:1}};export const apiPost=async()=>({});export const updateSiteSettings=async()=>{globalThis.__roleWrites++;return {settings:{news:[]}}};export const uploadSiteAsset=async()=>({});`}))}}]});
  await (await import(pathToFileURL(outfile).href)).run();
 }finally{dom.window.close();for(const [k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}await rm(scratch,{recursive:true,force:true})}
});
