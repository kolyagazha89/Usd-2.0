import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
test('requests retry and merge preview, cancellation, failure and reload',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.component-journey-'));const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/components'});
 const values={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,IS_REACT_ACT_ENVIRONMENT:true,__loads:0,__failure:false,__queueFail:true,__hold:false,__resolvePreview:null,__lastMerge:null};const old=new Map(Object.keys(values).map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const api=`export const getSiteSettings=async()=>{globalThis.__loads++;return {settings:{catalogs:{componentBrands:[{id:'source',category:'HEAD_UNIT',name:'Old'},{id:'target',category:'HEAD_UNIT',name:'New'}],componentModels:[]}}}};
 export const getComponentCatalogRequests=async()=>{if(globalThis.__queueFail){globalThis.__queueFail=false;throw Error('Ошибка очереди')}return {items:[{id:'1',status:'PENDING',brand:'Old',model:'One',category:'HEAD_UNIT',createdAt:'2026-01-01'},{id:'2',status:'APPROVED',brand:'New',model:'Done',category:'HEAD_UNIT',createdAt:'2026-01-01'}]}};
 export const previewComponentBrandMerge=async()=>{const value={revision:'r',brands:1,models:1,collisions:1,moved:[{id:'m',category:'HEAD_UNIT',model:'One',collision:true}]};if(globalThis.__hold)return new Promise(resolve=>{globalThis.__resolvePreview=()=>resolve(value)});return value};export const mergeComponentBrands=async(body)=>{globalThis.__lastMerge=body;if(globalThis.__failure)throw Error('Конфликт');return {success:true}};export const updateSiteSettings=async()=>({}),approveComponentCatalogRequest=async()=>({}),rejectComponentCatalogRequest=async()=>({}),retryComponentCatalogRequestEmail=async()=>({});`;
 try{for(const [k,v] of Object.entries(values))Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:v});const outfile=path.join(scratch,'journey.mjs');await build({entryPoints:[path.join(base,'fixtures/component-journey.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',plugins:[{name:'api',setup(b){b.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:api}))}}]});await (await import(pathToFileURL(outfile).href)).run()}finally{dom.window.close();for(const [k,v] of old){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k]}await rm(scratch,{recursive:true,force:true})}
});
