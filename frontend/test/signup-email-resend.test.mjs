import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
test('signup recovers verification mail with cooldown and guarded resend',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.signup-email-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/login'});
 let now=Date.now();const realNow=Date.now,intervals=new Map();let id=0;
 dom.window.setInterval=fn=>{intervals.set(++id,fn);return id};dom.window.clearInterval=id=>intervals.delete(id);
 const values={window:dom.window,document:dom.window.document,location:dom.window.location,history:dom.window.history,localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,HTMLElement:dom.window.HTMLElement,addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,IS_REACT_ACT_ENVIRONMENT:true,__advanceResendClock:ms=>{now+=ms;for(const fn of intervals.values())fn()}};
 const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  Date.now=()=>now;for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});dom.window.scrollTo=()=>{};
  const apiSource=await readFile(path.join(base,'../src/api.ts'),'utf8');
  const names=[...apiSource.matchAll(/export (?:async )?function (\w+)/g)].map(m=>m[1]);
  const mocks={refresh:'async()=>null',getPublicSiteAsset:'async()=>({})',apiGet:'async()=>({settings:{legal:{legalApproved:true,ipName:"USD",privacyText:"policy",consentText:"consent",termsText:"terms"}}})',apiPost:'async(path,body)=>globalThis.__signupPost(path,body)',listData:'value=>Array.isArray(value)?value:[]'};
  const outfile=path.join(scratch,'workflow.mjs');
  await build({entryPoints:[path.join(base,'fixtures/signup-email-resend.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},plugins:[{name:'signup-api',setup(b){b.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:names.map(n=>'export const '+n+'='+(mocks[n]??'async()=>({})')+';').join('\n')}))}}]});
  await(await import(pathToFileURL(outfile).href)).runSignupEmailResend();
 }finally{
  Date.now=realNow;dom.window.close();for(const [key,d] of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}delete globalThis.__signupPost;await rm(scratch,{recursive:true,force:true});
 }
});
