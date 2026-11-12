import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('stage list keeps two actions and card owns confirmed administrative actions',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url));
 const scratch=await mkdtemp(path.join(base,'.stage-actions-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/stages'});
 const names=['window','document','location','history','sessionStorage','HTMLElement','IS_REACT_ACT_ENVIRONMENT','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'];
 const previous=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try{
  for(const k of names.slice(0,6))globalThis[k]=dom.window[k];
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  window.scrollTo=()=>{};
  globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);
  globalThis.cancelAnimationFrame=clearTimeout;
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  const outfile=path.join(scratch,'workflow.mjs');
  await build({entryPoints:[path.join(base,'fixtures/stage-card-actions.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},plugins:[{name:'stage-api',setup(build){
   build.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:`
    const stage={id:'stage-11',stageNumber:11,name:'USD Winter Cup Краснодар',city:'Краснодар',date:'2026-11-28T12:00:00',status:'PUBLISHED',registrationOpen:true,seasonId:'season',season:{year:2026},resultsPublishedAt:null};
    export const apiGet=async p=>p==='/stages'?[{...stage}]:p==='/seasons'?[{id:'season',year:2026}]:p.startsWith('/admin/permanent-deletion/')?{label:stage.name,fingerprint:'preview',counts:{registrations:2,results:1},linkedAccount:null}:[];
    export const apiPatch=async(p,body)=>{if(globalThis.__stageFail)throw Error('Изменение недоступно');globalThis.__stageCalls.push({method:'PATCH',path:p,body});Object.assign(stage,body);return {...stage}};
    export const apiPost=async(p,body)=>{globalThis.__stageCalls.push({method:'POST',path:p,body});if(p.endsWith('/results-publication'))stage.resultsPublishedAt=body.published?'2026-11-12T12:00:00Z':null;return {...stage}};
    export const apiDelete=async p=>{globalThis.__stageCalls.push({method:'DELETE',path:p});stage.status='CANCELLED';stage.registrationOpen=false;return {...stage}};
    export const apiPut=async()=>({});export const listData=x=>x;
    export const getSiteSettings=async()=>({settings:{}});export const updateSiteSettings=async()=>({});export const uploadSiteAsset=async()=>({});
   `}));
  }}]});
  globalThis.__stageCalls=[];
  const workflow=await import(pathToFileURL(outfile).href);
  await workflow.runStageCardActions();
 }finally{
  dom.window.close();for(const [k,d] of previous){if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k]}
  delete globalThis.__stageCalls;delete globalThis.__stageFail;
  await rm(scratch,{recursive:true,force:true});
 }
});
