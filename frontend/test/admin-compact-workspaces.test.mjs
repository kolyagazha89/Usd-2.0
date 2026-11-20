import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
test('participant sections, private photo lifecycle and brand-to-model navigation',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.compact-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/participants'});
 const keys=['window','document','location','history','sessionStorage','HTMLElement','IS_REACT_ACT_ENVIRONMENT','__released','__photoFail','__auditCalls','requestAnimationFrame'];
 const saved=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{
  for(const k of keys.slice(0,6))globalThis[k]=dom.window[k];globalThis.IS_REACT_ACT_ENVIRONMENT=true;globalThis.__released=[];globalThis.__auditCalls=[];globalThis.requestAnimationFrame=fn=>{fn();return 0};
  const outfile=path.join(scratch,'fixture.mjs');
  await build({entryPoints:[path.join(base,'fixtures/admin-compact-workspaces.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},plugins:[{name:'mock-api',setup(b){b.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:`let n=0;export const getPrivateMediaObjectUrl=async()=>{if(globalThis.__photoFail)throw Error('missing');return 'blob:test-'+(++n)};export const releasePrivateMediaUrl=u=>globalThis.__released.push(u);export const apiGet=async p=>p==='/media/library'?{items:Array.from({length:23},(_,i)=>({targetType:'SITE_ASSET',targetId:'asset-'+i,contentType:'image/png',canDelete:true}))}:[];export const apiDelete=async()=>({});export const uploadEntityPhoto=async()=>({});export const uploadSiteAsset=async()=>({});export const getAudit=async(...args)=>{globalThis.__auditCalls.push(args);return {items:Array.from({length:25},(_,i)=>({id:'log-'+i,action:'UPDATE',entity:'Participant',createdAt:'2026-11-20T00:00:00Z',metadata:{}})),pagination:{total:123}}};export const apiPost=async()=>({});export const apiPatch=async()=>({});export const listData=x=>Array.isArray(x)?x:x?.items??[];`}))}}]});
  await (await import(pathToFileURL(outfile).href)).run();
 }finally{dom.window.close();for(const [k,v]of saved){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}await rm(scratch,{recursive:true,force:true})}
});
