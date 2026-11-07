import test from 'node:test';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';

test('real partner editor previews, saves, reopens and resets image framing',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url));
 const scratch=await mkdtemp(path.join(base,'.partner-image-'));
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'http://localhost'});
 const values={window:dom.window,document:dom.window.document,navigator:dom.window.navigator,
  HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,File:dom.window.File,
  IS_REACT_ACT_ENVIRONMENT:true,__partnerWrites:0,__revokedUrls:[],
  __partnerSettings:{partners:[{id:'aura',name:'Aura',tier:'PREMIUM',photoUrl:'/media/aura.png',
   isPublished:true,isActive:true,internalNote:'keep'}],contacts:{phone:'keep-phone'}}};
 const previous=new Map(Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL;
 try{
  for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  URL.createObjectURL=()=> 'blob:local-preview';
  URL.revokeObjectURL=url=>globalThis.__revokedUrls.push(url);
  const outfile=path.join(scratch,'editor.mjs');
  await build({entryPoints:[path.join(base,'fixtures/partner-image-editor.tsx')],bundle:true,
   platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},
   plugins:[{name:'partner-api',setup(builder){builder.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:`
    export const getSiteSettings=async()=>({settings:globalThis.__partnerSettings});
    export const updateSiteSettings=async value=>{globalThis.__partnerWrites++;globalThis.__partnerSettings={...globalThis.__partnerSettings,...JSON.parse(JSON.stringify(value))};};
    export const uploadSiteAsset=async()=>({publicPath:'/media/new-logo.webp'});
   `}))}}]});
  const {runPartnerImageEditor}=await import(pathToFileURL(outfile).href);
  await runPartnerImageEditor();
  globalThis.__partnerSettings={partners:[{id:'legacy',name:123,tier:'PREMIUM',photoUrl:'/media/aura.png',
   isPublished:true,isActive:true,internalNote:'keep'}],contacts:{phone:'keep-phone'}};
  await runPartnerImageEditor();
 }finally{
  URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;dom.window.close();
  for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  await rm(scratch,{recursive:true,force:true});
 }
});
