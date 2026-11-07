import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
test('rules reader keeps approved content and supports contents and full-context search',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),tmp=await mkdtemp(path.join(base,'.rules-reader-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/rules'});
 const globals={window:dom.window,document:dom.window.document,Node:dom.window.Node,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true};
 const old=new Map(Object.keys(globals).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{
  for(const [k,v] of Object.entries(globals))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});
  dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  const outfile=path.join(tmp,'reader.mjs');await build({entryPoints:[path.join(base,'fixtures/rules-reader.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',packages:'external',outfile,loader:{'.css':'empty'}});
  await(await import(pathToFileURL(outfile).href)).runRulesReader();
 }finally{dom.window.close();for(const[k,d]of old){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}await rm(tmp,{recursive:true,force:true})}
});
