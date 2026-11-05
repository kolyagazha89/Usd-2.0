import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchWithPublicReadRetry} from '../src/public-read-retry.ts';

const endpoint='https://api.usd-russia.ru/records/current';
const fetchWith=(path,init,fetcher)=>fetchWithPublicReadRetry(path,endpoint,init,fetcher);

test('public records GET retries a transient 503 exactly once',async()=>{
 let calls=0;
 const result=await fetchWith('/records/current',{},async()=>{
  calls++;
  return calls===1?new Response('temporary',{status:503}):
   new Response('[]',{status:200,headers:{'content-type':'application/json'}});
 });
 assert.equal(calls,2);
 assert.equal(result.status,200);
});

test('network TypeError on a public read gets a single replay',async()=>{
 let calls=0;
 const result=await fetchWith('/stages/public',{},async()=>{
  if(++calls===1)throw new TypeError('socket closed');
  return new Response('[]',{status:200});
 });
 assert.equal(result.status,200);
 assert.equal(calls,2);
});

test('do not retry private GET, writes, failed authentication or 404',async()=>{
 for(const [path,init,status] of [
  ['/auth/me',{},503],['/records/current',{method:'POST'},503],
  ['/records/current',{},401],['/records/current',{},404],
  ['/media/public-file/SITE_ASSET/poster',{},503],
 ]){
  let calls=0;
  const result=await fetchWith(path,init,async()=>{calls++;return new Response('',{status})});
  assert.equal(result.status,status);
  assert.equal(calls,1,path);
 }
});

test('two consecutive transient failures stop instead of looping',async()=>{
 let calls=0;
 const result=await fetchWith('/site-settings/public',{},async()=>{
  calls++;return new Response('',{status:502});
 });
 assert.equal(result.status,502);
 assert.equal(calls,2);
});

test('request cancellation never causes another request',async()=>{
 const controller=new AbortController();
 let calls=0;
 await assert.rejects(fetchWith('/records/current',{signal:controller.signal},async()=>{
  calls++;controller.abort();
  throw new DOMException('cancelled','AbortError');
 }),error=>error.name==='AbortError');
 assert.equal(calls,1);
});

test('only transport errors are replayed',async()=>{
 let calls=0;
 await assert.rejects(fetchWith('/records/current',{},async()=>{
  calls++;throw new Error('unrelated failure');
 }),/unrelated failure/);
 assert.equal(calls,1);
});
