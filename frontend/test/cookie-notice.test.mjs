import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('cookie clearance follows the wrapped notice and is removed on dismissal',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.cookie-notice-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/'});
 let height=180,resize,disconnected=false;
 const values={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true,
  ResizeObserver:class{constructor(callback){resize=callback}observe(){}disconnect(){disconnected=true}}};
 const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  for(const [key,value]of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  dom.window.HTMLElement.prototype.getBoundingClientRect=()=>({height});
  const outfile=path.join(scratch,'cookie.mjs');
  await build({stdin:{contents:"export {default} from './src/CookieNotice'",resolveDir:path.join(base,'..'),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',outfile});
  const {default:CookieNotice}=await import(pathToFileURL(outfile).href);
  const React=await import('react'),{createRoot}=await import('react-dom/client');
  const root=createRoot(document.getElementById('root'));
  const clearance=()=>document.documentElement.style.getPropertyValue('--usd-cookie-height');
  try{
   await React.act(async()=>root.render(React.createElement(CookieNotice)));
   assert.equal(clearance(),'180px');
   height=240;await React.act(async()=>resize());assert.equal(clearance(),'240px','a taller wrapped notice must reserve more scroll space');
   await React.act(async()=>document.querySelector('.cookie-notice__button').click());
   assert.equal(document.querySelector('.cookie-notice'),null);assert.equal(clearance(),'');assert.equal(disconnected,true);
   assert.equal(window.localStorage.getItem('usd_cookie_notice_dismissed'),'2026-10-v1');
   height=300;window.dispatchEvent(new window.Event('resize'));assert.equal(clearance(),'','dismissed notices must not leave stale clearance');
  }finally{await React.act(async()=>root.unmount())}
 }finally{
  dom.window.close();
  for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  await rm(scratch,{recursive:true,force:true});
 }
});
