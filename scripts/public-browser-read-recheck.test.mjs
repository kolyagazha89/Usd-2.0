import test from 'node:test';
import assert from 'node:assert/strict';
import {recheckFailedPublicReads} from './public-browser-read-recheck.mjs';

const media='https://api.usd-russia.ru/media/public-file/SITE_ASSET/stage-poster-test';
const records='https://api.usd-russia.ru/records/current';
const request=(url,reason='read failed')=>({method:'GET',url,reason});
const image=()=>new Response(new Uint8Array([137,80,78,71]),{
  headers:{'content-type':'image/png'},
});

test('one network-cancelled image is recovered by a fresh safe GET',async()=>{
 let calls=0,options;
 const result=await recheckFailedPublicReads([request(media)],async (_url,opts)=>{
   calls++;options=opts;return image();
 });
 assert.equal(calls,1);
 assert.equal(options.method,'GET');
 assert.equal(options.redirect,'manual');
 assert.deepEqual(result.unresolved,[]);
 assert.equal(result.recovered.length,1);
});

test('isolated read retries transient 503, then verifies JSON list',async()=>{
 let calls=0;
 const result=await recheckFailedPublicReads([request(records)],async()=>{
   calls++;
   return calls===1?new Response('',{status:503}):
     new Response('[]',{headers:{'content-type':'application/json'}});
 });
 assert.equal(calls,2);
 assert.deepEqual(result.unresolved,[]);
 assert.equal(result.recovered[0].attempts,2);
});

test('repeated read failure remains release-blocking',async()=>{
 let attempts=0;
 const result=await recheckFailedPublicReads([request(media)],async()=>{
   attempts++;throw new Error('socket closed');
 });
 assert.equal(attempts,2);
 assert.equal(result.unresolved.length,1);
 assert.deepEqual(result.recovered,[]);
});

test('never follows 302, never accepts 404, never treats HTML as JSON',async()=>{
 for(const response of [
   new Response('',{status:302,headers:{location:'https://usd-russia.ru/'}}),
   new Response('',{status:404}),
   new Response('<html>wrong</html>',{headers:{'content-type':'text/html'}}),
 ]){
   let calls=0;
   const result=await recheckFailedPublicReads([request(records)],async(_url,opts)=>{
     assert.equal(opts.redirect,'manual');calls++;return response;
   });
   assert.equal(calls,1);
   assert.equal(result.unresolved.length,1);
 }
});

test('does not issue any request for foreign host, primary domain or mutation',async()=>{
 const input=[
   request('https://usd-russia.ru/records/current'),
   {method:'POST',url:records,reason:'read failed'},
   request('http://api.usd-russia.ru/records/current'),
 ];
 let calls=0;
 const result=await recheckFailedPublicReads(input,async()=>{calls++;return image()});
 assert.equal(calls,0);
 assert.equal(result.unresolved.length,3);
});

test('deduplicates repeated cancelled subrequests, keeps literal redirects fatal',async()=>{
 let calls=0;
 const result=await recheckFailedPublicReads([
   request(media),request(media),
   {method:'GET',url:records,reason:'redirect'},
 ],async()=>{calls++;return image()});
 assert.equal(calls,1);
 assert.equal(result.recovered.length,1);
 assert.deepEqual(result.unresolved,[]);
});

test('empty successful response is not treated as a healthy image',async()=>{
 const result=await recheckFailedPublicReads([request(media)],async()=>
   new Response('',{headers:{'content-type':'image/webp'}}));
 assert.equal(result.recovered.length,0);
 assert.equal(result.unresolved.length,1);
});
