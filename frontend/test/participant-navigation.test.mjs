import test from 'node:test';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('participant navigation and three-step registration preserve choices and submit the selected configuration',async()=>{
  const base=path.dirname(fileURLToPath(import.meta.url));
  const scratch=await mkdtemp(path.join(base,'.participant-navigation-'));
  const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/participant'});
  const values={
    window:dom.window,document:dom.window.document,location:dom.window.location,history:dom.window.history,
    localStorage:dom.window.localStorage,sessionStorage:dom.window.sessionStorage,HTMLElement:dom.window.HTMLElement,
    addEventListener:dom.window.addEventListener.bind(dom.window),removeEventListener:dom.window.removeEventListener.bind(dom.window),
    requestAnimationFrame:fn=>setTimeout(fn,0),cancelAnimationFrame:clearTimeout,
    IS_REACT_ACT_ENVIRONMENT:true,
    __accountUser:{id:'fixture-user',email:'fixture@example.test',role:'PARTICIPANT',participantId:'p1'},__postAction:null,__clearedSessions:0,__getPublic:null,
  };
  const previous=new Map(Object.keys(values).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value] of Object.entries(values))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    dom.window.scrollTo=()=>{};
    const apiSource=await readFile(path.join(base,'../src/api.ts'),'utf8');
    const names=[...apiSource.matchAll(/export (?:async )?function (\w+)/g)].map(match=>match[1]);
    const implementations={
      refresh:'async()=>({user:globalThis.__accountUser})',
      apiGet:'async path=>globalThis.__getPublic(path)',
      getPublicSiteAsset:'async()=>({})',
      apiPost:'async(path,body)=>globalThis.__postAction(path,body)',
      clearAuthSession:'()=>{globalThis.__clearedSessions++;globalThis.__accountUser=null}',
      listData:'value=>Array.isArray(value)?value:[]',
    };
    const mockApi=names.map(name=>'export const '+name+'='+(implementations[name]??'async()=>({})')+';').join('\n');
    const outfile=path.join(scratch,'participant-navigation.mjs');
    await build({
      entryPoints:[path.join(base,'fixtures/participant-navigation.tsx')],bundle:true,platform:'node',format:'esm',
      jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},
      plugins:[{name:'mock-account-api',setup(builder){builder.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:mockApi}))}}],
    });
    const workflow=await import(pathToFileURL(outfile).href);
    await workflow.runParticipantNavigation();
    await workflow.runRegistrationJourney();
    await workflow.runDashboardAvailability();
    await workflow.runFullyRegisteredStage();
  }finally{
    dom.window.close();
    for(const [key,descriptor] of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
    await rm(scratch,{recursive:true,force:true});
  }
});
