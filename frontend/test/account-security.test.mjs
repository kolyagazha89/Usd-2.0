import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('cabinet account settings protect password, email and session actions for participants and staff',async()=>{
  const base=path.dirname(fileURLToPath(import.meta.url));
  const scratch=await mkdtemp(path.join(base,'.account-security-'));
  const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/participant?tab=profile'});
  const values={window:dom.window,document:dom.window.document,location:dom.window.location,history:dom.window.history,
    localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,HTMLElement:dom.window.HTMLElement,Image:dom.window.Image,
    addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),
    requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,IS_REACT_ACT_ENVIRONMENT:true,
    fetch:(...args)=>globalThis.__securityFetch(...args)};
  const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    dom.window.scrollTo=()=>{};
    const outfile=path.join(scratch,'workflow.mjs');
    await build({entryPoints:[path.join(base,'fixtures/account-security.tsx')],bundle:true,platform:'node',format:'esm',
      jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},define:{'import.meta.env':'{"VITE_API_URL":"https://candidate.invalid"}'}});
    const workflow=await import(pathToFileURL(outfile).href);
    await workflow.runAccountSecurity();
  }finally{
    dom.window.close();
    for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
    delete globalThis.__securityFetch;
    await rm(scratch,{recursive:true,force:true});
  }
});
