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
    assert.deepEqual(calls.filter(c=>c.url.endsWith('/auth/logout')).map(c=>JSON.parse(c.init.body).refreshToken).sort(),
      ['initial-token','stale-refresh'],'logout must revoke the captured session and the discarded rotated token');

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
    // If the network fails while signing out, local credentials stay cleared.
    globalThis.fetch=async(url)=>{
      if(url.endsWith('/auth/logout'))throw Error('Network offline');
      throw Error('Unexpected request: '+url);
    };
    await api.logout();
    assert.equal(localStorage.getItem('usd_refresh_token'),null,'offline logout must remain local logout');
    // A protected response that arrives after logout must not be accepted as
    // data belonging to the next user, even if the old HTTP request succeeded.
    let releaseProtected;
    const pendingProtected=new Promise(resolve=>{releaseProtected=resolve});
    globalThis.fetch=async(url,init)=>{
      if(url.endsWith('/auth/me'))return pendingProtected;
      if(url.endsWith('/auth/logout'))return new Response('{}',{status:200});
      throw Error('Unexpected request: '+url);
    };
    const oldMe=api.me();
    await api.logout();
    releaseProtected(new Response(JSON.stringify({id:'old-user',email:'old@example.test',role:'ADMIN'}),{status:200,headers:{'Content-Type':'application/json'}}));
    await assert.rejects(oldMe,/Сеанс завершён/,'a stale successful response must not be exposed after logout');
    // Private image downloads are also authenticated and must not expose
    // a previous account's media after a session switch.
    let releaseMedia;
    const pendingMedia=new Promise(resolve=>{releaseMedia=resolve});
    globalThis.fetch=async(url)=>{
      if(url.endsWith('/auth/login'))return new Response(JSON.stringify({accessToken:'media-access',refreshToken:'media-token',user:{id:'old-user',role:'PARTICIPANT'}}),{status:200,headers:{'Content-Type':'application/json'}});
      if(url.includes('/media/private-file/'))return pendingMedia;
      if(url.endsWith('/auth/logout'))return new Response('{}',{status:200});
      throw Error('Unexpected request: '+url);
    };
    await api.login('media@example.test','test-password');
    const staleMedia=api.getPrivateMediaObjectUrl('PARTICIPANT_PHOTO','old-user');
    await api.logout();
    releaseMedia(new Response(new Blob(['old-photo']),{status:200}));
    await assert.rejects(staleMedia,/Сеанс завершён/,'private media from a logged-out account must be rejected');
    // An unauthorized request must never retry under a different session.
    let releaseUnauthorized;
    const unauthorized=new Promise(resolve=>{releaseUnauthorized=resolve});
    let protectedRequests=0;
    globalThis.fetch=async(url)=>{
      if(url.endsWith('/auth/me')){protectedRequests++;return unauthorized;}
      if(url.endsWith('/auth/logout'))return new Response('{}',{status:200});
      if(url.endsWith('/auth/refresh'))throw Error('Unexpected refresh of old account');
      throw Error('Unexpected request: '+url);
    };
    const oldUnauthorized=api.me();
    await api.logout();
    releaseUnauthorized(new Response(JSON.stringify({message:'Unauthorized'}),{status:401,headers:{'Content-Type':'application/json'}}));
    await assert.rejects(oldUnauthorized,/Сеанс завершён/);
    assert.equal(protectedRequests,1,'no protected retry may cross a logout boundary');

  }finally{
    for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
    dom.window.close();
    await rm(scratch,{recursive:true,force:true});
  }
});
