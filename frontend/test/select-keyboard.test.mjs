import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
test('combobox selects with keyboard, restores selection on Escape and rejects unselected text',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url));const scratch=await mkdtemp(path.join(base,'.select-keyboard-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test'});const keys={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true};
 const previous=new Map(Object.keys(keys).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  for(const[key,value]of Object.entries(keys))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  const outfile=path.join(scratch,'select.mjs');
  await build({entryPoints:[path.join(base,'fixtures/select-keyboard.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external'});
  await(await import(pathToFileURL(outfile).href)).runSelectKeyboard();
 }finally{dom.window.close();for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key]}await rm(scratch,{recursive:true,force:true})}
});
