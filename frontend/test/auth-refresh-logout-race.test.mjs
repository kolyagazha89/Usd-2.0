import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

test('a delayed refresh cannot restore credentials after explicit logout',async()=>{
  const base=path.dirname(fileURLToPath(import.meta.url));
  const scratch=await mkdtemp(path.join(base,'.auth-race-'));
  const dom=new JSDOM('',{url:'https://usd.test/participant'});
  const previous=new Map([['fetch',Object.getOwnPropertyDescriptor(globalThis,'fetch')]]);
  const globals={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,
    location:dom.window.location,navigator:dom.window.navigator,Event:dom.window.Event};
  for(const [key,value]of Object.entries(globals)){
    previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
    Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  }
  try{
    const outfile=path.join(scratch,'api.mjs');
    await build({entryPoints:[path.join(base,'../src/api.ts')],bundle:true,platform:'node',format:'esm',outfile,
      define:{'import.meta.env':'{"VITE_API_URL":"https://api.example.test"}'}});
    const api=await import(pathToFileURL(outfile).href);
    localStorage.setItem('usd_refresh_token','initial-token');
    let releaseRefresh;
    const pendingRefresh=new Promise(resolve=>{releaseRefresh=resolve});
    let releaseLogout;
    const pendingLogout=new Promise(resolve=>{releaseLogout=resolve});
    const calls=[];
    globalThis.fetch=async(url,init)=>{
      calls.push({url,init});
      if(url.endsWith('/auth/refresh'))return pendingRefresh;
      if(url.endsWith('/auth/logout'))return pendingLogout;
      throw Error('Unexpected API request: '+url);
    };
    const refreshing=api.refresh();
    const loggingOut=api.logout();
    assert.equal(localStorage.getItem('usd_refresh_token'),null,'logout must clear the token before waiting for the network');
    releaseRefresh(new Response(JSON.stringify({accessToken:'stale-access',refreshToken:'stale-refresh',user:{id:'u',role:'PARTICIPANT'}}),{status:200,headers:{'Content-Type':'application/json'}}));
    assert.equal(await refreshing,null,'stale refresh must be discarded');
    assert.equal(localStorage.getItem('usd_refresh_token'),null,'stale refresh cannot re-create local credentials');
    releaseLogout(new Response(JSON.stringify({success:true}),{status:200,headers:{'Content-Type':'application/json'}}));
    await loggingOut;
    assert.equal(localStorage.getItem('usd_refresh_token'),null);
    assert.equal(calls.filter(c=>c.url.endsWith('/auth/refresh')).length,1);
    assert.equal(calls.filter(c=>c.url.endsWith('/auth/logout')).length,1);

    // An old refresh must not block a new session from refreshing after logout.
    localStorage.setItem('usd_refresh_token','new-login-token');
    let releaseSecondRefresh;
    const secondRefresh=new Promise(resolve=>{releaseSecondRefresh=resolve});
    globalThis.fetch=async(url,init)=>{
      calls.push({url,init});
      if(url.endsWith('/auth/refresh'))return secondRefresh;
      throw Error('Unexpected request: '+url);
    };
    const newSessionRefresh=api.refresh();
    assert.equal(calls.at(-1).init.body,JSON.stringify({refreshToken:'new-login-token'}));
    releaseSecondRefresh(new Response(JSON.stringify({accessToken:'fresh-access',refreshToken:'fresh-refresh',user:{id:'u2',role:'PARTICIPANT'}}),{status:200,headers:{'Content-Type':'application/json'}}));
    assert.equal((await newSessionRefresh).accessToken,'fresh-access');
    assert.equal(localStorage.getItem('usd_refresh_token'),'fresh-refresh');
  }finally{
    for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
    dom.window.close();
    await rm(scratch,{recursive:true,force:true});
  }
});
