import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {JSDOM} from 'jsdom';

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return {promise,resolve}};
const auth=(id='new')=>new Response(JSON.stringify({accessToken:id+'-access',refreshToken:id+'-refresh',user:{id,role:'PARTICIPANT'}}),{headers:{'Content-Type':'application/json'}});
async function withApi(run){
  const base=path.dirname(fileURLToPath(import.meta.url));
  const scratch=await mkdtemp(path.join(base,'.auth-boundaries-'));
  const dom=new JSDOM('',{url:'https://usd.test/participant'});
  const globals={window:dom.window,document:dom.window.document,localStorage:dom.window.localStorage,navigator:dom.window.navigator,Event:dom.window.Event,fetch:undefined};
  const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  try{
    for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
    const outfile=path.join(scratch,'api.mjs');
    await build({entryPoints:[path.join(base,'../src/api.ts')],bundle:true,platform:'node',format:'esm',outfile,define:{'import.meta.env':'{"VITE_API_URL":"https://api.example.test"}'}});
    await run(await import(pathToFileURL(outfile).href));
  }finally{
    for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}
    dom.window.close();await rm(scratch,{recursive:true,force:true});
  }
}

test('anonymous public data survives a failed initial cookie refresh',()=>withApi(async api=>{
  const response=deferred();
  globalThis.fetch=async url=>url.endsWith('/auth/refresh')?new Response('{}',{status:401}):response.promise;
  const publicData=api.apiGet('/stages/public');
  // Keep the promise observed while the deliberately delayed body is pending.
  const observed=publicData.then(value=>({value}),error=>({error}));
  assert.equal(await api.refresh(),null);
  response.resolve(new Response(JSON.stringify([{id:'public-stage'}])));
  const result=await observed;
  assert.equal(result.error,undefined,'guest boot refresh failure must not invalidate unauthenticated public data');
  assert.deepEqual(result.value,[{id:'public-stage'}]);
}));

test('new login waits for pending logout cookie cleanup and duplicate logout shares the request',()=>withApi(async api=>{
  const cleanup=deferred();const calls=[];
  globalThis.fetch=async url=>{calls.push(url);if(url.endsWith('/auth/logout'))return cleanup.promise;if(url.endsWith('/auth/login'))return auth();throw Error(url)};
  localStorage.setItem('usd_refresh_token','old-refresh');
  const loggingOut=api.logout();const duplicate=api.logout();
  const loggingIn=api.login('new@example.test','synthetic-password');
  await Promise.resolve();
  const beforeCleanup=[...calls];
  cleanup.resolve(new Response('{}'));
  await Promise.all([loggingOut,duplicate,loggingIn]);
  assert.equal(beforeCleanup.filter(url=>url.endsWith('/auth/logout')).length,1,'duplicate sign-out must share cookie cleanup');
  assert.equal(beforeCleanup.filter(url=>url.endsWith('/auth/login')).length,0,'new login cannot race old Set-Cookie cleanup');
  assert.equal(localStorage.getItem('usd_refresh_token'),'new-refresh');
}));

test('delayed login response cannot restore credentials after logout',()=>withApi(async api=>{
  const response=deferred();
  const calls=[];
  globalThis.fetch=async(url,init)=>{calls.push({url,init});return url.endsWith('/auth/login')?response.promise:new Response('{}')};
  const loggingIn=api.login('old@example.test','synthetic-password');
  const rejected=assert.rejects(loggingIn,/Сеанс.*завершён/);
  const loggingOut=api.logout();
  assert.equal(localStorage.getItem('usd_refresh_token'),null);
  await Promise.resolve();
  const beforeResponse=calls.filter(call=>call.url.endsWith('/auth/logout')).length;
  response.resolve(auth('old'));await rejected;await loggingOut;
  assert.equal(beforeResponse,0,'remote cleanup must follow the login Set-Cookie response');
  assert.ok(calls.some(call=>call.url.endsWith('/auth/logout')&&JSON.parse(call.init.body??'{}').refreshToken==='old-refresh'),'cleanup must revoke the discarded login session too');
  assert.equal(localStorage.getItem('usd_refresh_token'),null);
}));

test('protected response body resolving after logout is rejected',()=>withApi(async api=>{
  const body=deferred();const reading=deferred();
  globalThis.fetch=async url=>url.endsWith('/auth/login')?auth('old'):url.endsWith('/auth/me')?{status:200,ok:true,json:()=>{reading.resolve();return body.promise}}:new Response('{}');
  await api.login('old@example.test','synthetic-password');
  const request=api.me();const rejected=assert.rejects(request,/Сеанс завершён/);
  await reading.promise;await api.logout();body.resolve({id:'old-user'});await rejected;
}));

test('private media blob resolving after logout is rejected before object URL creation',()=>withApi(async api=>{
  const blob=deferred();const reading=deferred();
  globalThis.fetch=async url=>{
    if(url.endsWith('/auth/login'))return auth('old');
    if(url.includes('/media/private-file/'))return {status:200,ok:true,blob:()=>{reading.resolve();return blob.promise}};
    if(url.endsWith('/auth/logout'))return new Response('{}');throw Error(url);
  };
  await api.login('old@example.test','synthetic-password');
  const request=api.getPrivateMediaObjectUrl('PARTICIPANT_PHOTO','old-user');const rejected=assert.rejects(request,/Сеанс завершён/);
  await reading.promise;await api.logout();blob.resolve(new Blob(['synthetic-old-photo']));await rejected;
}));

test('failed preflight refresh stops a private media request',()=>withApi(async api=>{
  const calls=[];
  globalThis.fetch=async url=>{calls.push(url);if(url.endsWith('/auth/refresh'))return new Response('{"message":"expired"}',{status:401});return new Response(new Blob(['forbidden-photo']))};
  await assert.rejects(api.getPrivateMediaObjectUrl('PARTICIPANT_PHOTO','old-user'),/Сеанс завершён|необходимо войти/);
  assert.equal(calls.filter(url=>url.includes('/media/private-file/')).length,0);
}));

test('logout during private media preflight does not issue a stale download',()=>withApi(async api=>{
  const refreshing=deferred();const calls=[];
  globalThis.fetch=async url=>{calls.push(url);if(url.endsWith('/auth/refresh'))return refreshing.promise;return new Response('{}')};
  const request=api.getPrivateMediaObjectUrl('PARTICIPANT_PHOTO','old-user');const rejected=assert.rejects(request,/Сеанс завершён/);
  const loggingOut=api.logout();refreshing.resolve(auth('old'));await rejected;await loggingOut;
  assert.equal(calls.filter(url=>url.includes('/media/private-file/')).length,0);
}));

test('a stale protected 401 cannot refresh or retry using the next account',()=>withApi(async api=>{
  const response=deferred();const calls=[];
  globalThis.fetch=async url=>{
    calls.push(url);
    if(url.endsWith('/auth/me'))return response.promise;
    if(url.endsWith('/auth/login'))return auth();
    if(url.endsWith('/auth/logout'))return new Response('{}');
    throw Error('Unexpected request: '+url);
  };
  const oldRequest=api.me();const rejected=assert.rejects(oldRequest,/Сеанс завершён/);
  await api.logout();await api.login('new@example.test','synthetic-password');
  response.resolve(new Response('{}',{status:401}));await rejected;
  assert.equal(calls.filter(url=>url.endsWith('/auth/me')).length,1);
  assert.equal(calls.filter(url=>url.endsWith('/auth/refresh')).length,0);
  assert.equal(localStorage.getItem('usd_refresh_token'),'new-refresh');
}));

test('logout waits for a pending refresh failure before allowing the next account',()=>withApi(async api=>{
  const response=deferred();let expired=0;
  window.addEventListener('usd:session-expired',()=>expired++);
  globalThis.fetch=async url=>{
    if(url.endsWith('/auth/refresh'))return response.promise;
    if(url.endsWith('/auth/login'))return auth();
    if(url.endsWith('/auth/logout'))return new Response('{}');throw Error(url);
  };
  const oldRefresh=api.refresh();const loggingOut=api.logout();
  response.resolve(new Response('{}',{status:401}));
  assert.equal(await oldRefresh,null);
  await loggingOut;await api.login('new@example.test','synthetic-password');
  assert.equal(expired,0);
  assert.equal(localStorage.getItem('usd_refresh_token'),'new-refresh');
}));

test('remote logout waits for the pending refresh body and revokes its rotated token',()=>withApi(async api=>{
  const body=deferred();const reading=deferred();const calls=[];
  globalThis.fetch=async(url,init)=>{
    calls.push({url,init});
    if(url.endsWith('/auth/refresh'))return {status:200,ok:true,json:()=>{reading.resolve();return body.promise}};
    if(url.endsWith('/auth/logout'))return new Response('{}');throw Error(url);
  };
  localStorage.setItem('usd_refresh_token','old-refresh');
  const refreshing=api.refresh();await reading.promise;
  const loggingOut=api.logout();
  await Promise.resolve();
  const beforeBody=calls.filter(call=>call.url.endsWith('/auth/logout')).length;
  const duringLogout=api.refresh();
  body.resolve({accessToken:'stale-access',refreshToken:'rotated-refresh',user:{id:'old',role:'PARTICIPANT'}});
  assert.equal(await refreshing,null);await loggingOut;
  assert.equal(beforeBody,0,'Set-Cookie and body must settle before cookie clearing starts');
  assert.equal(await duringLogout,null,'logout cannot start another cookie-bearing refresh');
  assert.equal(calls.filter(call=>call.url.endsWith('/auth/refresh')).length,1);
  assert.deepEqual(new Set(calls.filter(call=>call.url.endsWith('/auth/logout')).map(call=>JSON.parse(call.init.body).refreshToken)),new Set(['old-refresh','rotated-refresh']));
  assert.equal(localStorage.getItem('usd_refresh_token'),null);
}));

test('cookie cleanup precedes captured tokens after an auth body fails',()=>withApi(async api=>{
  const response=deferred();let cookie='old-refresh';
  const active=new Set(['old-refresh','discarded-login-refresh']);const cleanup=[];
  localStorage.setItem('usd_refresh_token','old-refresh');
  globalThis.fetch=async(url,init)=>{
    if(url.endsWith('/auth/login'))return response.promise;
    if(url.endsWith('/auth/logout')){
      const explicit=JSON.parse(init.body??'{}').refreshToken;
      cleanup.push(explicit??null);
      active.delete(explicit??cookie);cookie=null;
      return new Response('{}');
    }
    throw Error(url);
  };
  const loggingIn=api.login('old@example.test','synthetic-password');
  const rejected=assert.rejects(loggingIn,/Сеанс.*завершён/);
  const loggingOut=api.logout();
  cookie='discarded-login-refresh';
  response.resolve({status:200,ok:true,json:async()=>{throw Error('Truncated auth response')}});
  await rejected;await loggingOut;
  assert.deepEqual([...active],[],'no family may survive merely because an earlier cleanup erased its cookie');
  assert.deepEqual(cleanup,[null,'old-refresh']);
  assert.equal(cookie,null);
}));
