import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('stage edits and import resolution preserve filters and scroll',async()=>{
 const base=path.dirname(fileURLToPath(import.meta.url));
 const scratch=await mkdtemp(path.join(base,'.workflow-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/stages'});
 const names=['window','document','location','history','sessionStorage','HTMLElement','IS_REACT_ACT_ENVIRONMENT','requestAnimationFrame','cancelAnimationFrame','ResizeObserver'];
 const previous=new Map(names.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 try {
  for(const k of names.slice(0,6))globalThis[k]=dom.window[k];
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  let y=0;Object.defineProperty(window,'scrollY',{get:()=>y});
  window.scrollTo=({top})=>{y=top;window.dispatchEvent(new window.Event('scroll'))};
  globalThis.requestAnimationFrame=fn=>setTimeout(fn,0);globalThis.cancelAnimationFrame=clearTimeout;
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  sessionStorage.setItem('usd:view:/stages:season','"2025"');
  sessionStorage.setItem('usd:view:/stages:search','"Волгоград"');
  sessionStorage.setItem('usd:view:/stages:status','"ACTIVE"');
  const outfile=path.join(scratch,'workflow.mjs');
  await build({entryPoints:[path.join(base,'fixtures/resource-workflow.tsx')],bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',plugins:[{name:'mock-api',setup(build){
   build.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents: `const stages=[{id:'a',name:'Волгоград',status:'PUBLISHED',season:{year:2025}},{id:'b',name:'Москва',status:'PUBLISHED',season:{year:2026}}];
 const job={id:'job1',stageId:'a',status:'PREVIEW',metadata:{historicalResults:true},rows:Array.from({length:150},(_,i)=>({id:'r'+(i+1),rowNumber:i+1,status:'WARNING',type:'RESULT',rawData:{'ФИО':'Иванов Иван'},normalizedData:{participantNumber:i+1},resolution:{participant:{action:'USE_EXISTING',participantId:'p1'},registration:{action:'CREATE',participantNumber:i+1},classId:'bdw'}}))};
 export const apiGet=async p=>p==='/stages'?stages:p==='/imports/job1'?{importJob:job}:p.endsWith('/latest')?null:p.endsWith('/preflight')?{possiblePeople:[],aliasesAcrossStages:[]}:[];
 export const apiPatch=async()=>{globalThis.__importSaves=(globalThis.__importSaves??0)+1;return {}};
 export const apiPost=async()=>({});export const listData=x=>x;
 export const getSiteSettings=async()=>({});export const getGoogleStatus=async()=>({connected:false});
 export const connectGoogle=async()=>({});export const getGoogleSheetValues=async()=>({});export const getGoogleSpreadsheet=async()=>({});export const getGoogleSpreadsheets=async()=>({});export const prepareHistoricalImport=async()=>({});`}))
  }}]});
  const workflow=await import(pathToFileURL(outfile).href);
  await workflow.runWorkflow();await workflow.runImportWorkflow();delete globalThis.__importSaves;
 } finally {
  dom.window.close();for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
  await rm(scratch,{recursive:true,force:true});
 }
});
