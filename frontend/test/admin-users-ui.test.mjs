import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('user role change requires confirmation and search remains recoverable',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url));
 const scratch=await mkdtemp(path.join(base,'.user-operator-ux-'));
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://usd.test/admin/users'});
 const originals=new Map();
 const initial={
  window:dom.window,document:dom.window.document,location:dom.window.location,history:dom.window.history,
  sessionStorage:dom.window.sessionStorage,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,
  IS_REACT_ACT_ENVIRONMENT:true,requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
  ResizeObserver:class{observe(){}disconnect(){}},
  __userPatches:[],__userRecords:[{id:'usr1',email:'participant@usd.test',role:'PARTICIPANT',
   customRoleId:null,customRole:null,isActive:true,createdAt:'2026-01-01T12:00:00Z'}],
 };
 try{
  for(const [key,value] of Object.entries(initial)){
   originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
   Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  dom.window.scrollTo=()=>{};
  const outfile=path.join(scratch,'users.mjs');
  await build({entryPoints:[path.join(base,'fixtures/admin-users-usability.tsx')],bundle:true,platform:'node',
   format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},
   plugins:[{name:'user-api',setup(b){
    b.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:"export const apiGet=async p=>{if(p==='/auth/admin/roles')return [{id:'judge',name:'Судья'}];if(p.startsWith('/auth/admin/users')){const query=new URL(p,'https://usd.test').searchParams;return globalThis.__userRecords.filter(u=>(!query.get('search')||u.email.toLowerCase().includes(query.get('search').toLowerCase()))&&(!query.get('role')||u.role===query.get('role'))).map(u=>({...u}))}return []};export const apiPatch=async(p,body)=>{globalThis.__userPatches.push({path:p,body});const u=globalThis.__userRecords.find(u=>p.includes('/'+u.id+'/'));if(p.endsWith('/role'))u.role=body.role;if(p.endsWith('/custom-role'))u.customRoleId=body.customRoleId;if(p.endsWith('/active'))u.isActive=body.active;return {...u}};export const apiPost=async()=>({});export const listData=x=>x;"}));
    b.onLoad({filter:/[\\/]AdminEntityLink\.tsx$/},()=>({loader:'tsx',contents:"import {useState} from 'react';export const useAdminDetail=()=>useState(null);export const AdminEntityLink=({children})=><>{children}</>;"}));
    b.onLoad({filter:/[\\/]view-state\.ts$/},()=>({loader:'ts',contents:"import {useState} from 'react';export const useEditorScroll=()=>{};export const useViewState=(key,fallback)=>useState(fallback);"}));
    b.onLoad({filter:/[\\/]PermanentDeletionDialog\.tsx$/},()=>({loader:'tsx',contents:"export const PermanentDeletionDialog=()=>null;"}));
   }}]});
  const fixture=await import(pathToFileURL(outfile).href);
  await fixture.runAdminUserUsability();
 }finally{
  for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  dom.window.close();
  await rm(scratch,{recursive:true,force:true});
 }
});
