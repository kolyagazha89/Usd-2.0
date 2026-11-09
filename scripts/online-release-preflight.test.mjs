import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectOnlineRelease} from './online-release-preflight.mjs';

const REVISION='942f5d9c6f7c418a9d3c2ea7fe602f184aca51fa';
const season='085da2f9-c8ac-4f34-8374-f438f75250c9';
const stage='f551ebf5-42db-446b-acdf-a644252ebded';
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const image=()=>new Response(new Uint8Array([137,80,78,71]),{status:200,headers:{'content-type':'image/png'}});
const happy=(url)=>{
 const p=new URL(url);
 if(p.pathname==='/usd-release.json'||p.pathname==='/release')return response({revision:REVISION});
 if(p.pathname==='/seasons')return response([{id:season,year:2026}]);
 if(p.pathname==='/stages/public')return response([{id:stage,seasonId:season}]);
 if(p.pathname==='/directions')return response([{name:'SPL'}]);
 if(p.pathname==='/records/current')return response([{id:'record-1'}]);
 if(p.pathname==='/teams/public')return response([{id:'team-1'}]);
 if(p.pathname==='/site-settings/public')return response({success:true,settings:{}});
 if(p.pathname==='/teams/public/standings')return response({scope:{type:'SEASON',id:season},teams:[]});
 if(p.pathname==='/statistics/overview')return response({message:'Unauthorized'},401);
 if(p.pathname.startsWith('/media/public-file/SITE_ASSET/'))return image();
 throw new Error('Unexpected URL '+url);
};

test('release gate checks exactly identical SHA, public data, poster and anonymous ADMIN denial',async()=>{
 const calls=[];
 const report=await inspectOnlineRelease({expectedSha:REVISION,request:async(url,opts)=>{
  calls.push({url,opts});return happy(url);
 }});
 assert.equal(report.ok,true,JSON.stringify(report));
 assert.equal(report.revisions.frontend,REVISION);
 assert.equal(report.revisions.api,REVISION);
 assert.ok(report.checks.length>=10);
 assert.ok(report.checks.every(c=>c.ok));
 assert.ok(calls.some(c=>c.url.endsWith('/records/current')));
 assert.ok(calls.some(c=>c.url.includes('/teams/public/standings?seasonId=')));
 assert.ok(calls.some(c=>c.url.includes('/stage-poster-'+stage)));
 assert.ok(calls.some(c=>c.url.endsWith('/statistics/overview')));
 for(const {url,opts} of calls){
  assert.ok(url.startsWith('https://app.usd-russia.ru/')||url.startsWith('https://api.usd-russia.ru/'));
  assert.equal(opts.method,'GET');assert.equal(opts.redirect,'manual');
  assert.equal(opts.credentials,'omit');
  assert.ok(!('authorization' in opts.headers));
 }
});

test('mismatch of deployed frontend or API revision blocks acceptance',async()=>{
 for(const target of ['/usd-release.json','/release']){
  const report=await inspectOnlineRelease({expectedSha:REVISION,request:(url)=>{
   if(new URL(url).pathname===target)return Promise.resolve(response({revision:'a'.repeat(40)}));
   return Promise.resolve(happy(url));
  }});
  assert.equal(report.ok,false);
  assert.ok(report.checks.some(c=>!c.ok&&c.name.includes('revision')));
 }
});

test('missing stage poster or failing records read blocks release',async()=>{
 for(const target of ['stage-poster-','/records/current']){
  const report=await inspectOnlineRelease({expectedSha:REVISION,request:async(url)=>{
   if(url.includes(target))return response({message:'not found'},404);
   return happy(url);
  }});
  assert.equal(report.ok,false);
  assert.ok(report.checks.some(c=>!c.ok));
 }
});

test('ADMIN endpoints must reject anonymous readers with 401 or 403',async()=>{
 const report=await inspectOnlineRelease({expectedSha:REVISION,request:async(url)=>{
  if(url.endsWith('/statistics/overview'))return response({secret:true});
  return happy(url);
 }});
 assert.equal(report.ok,false);
 assert.ok(report.checks.some(c=>c.name==='admin-access-control'&&!c.ok));
});

test('malformed JSON, redirect, huge payload and incorrect media MIME are blocking',async()=>{
 const cases=[
  (url)=>url.endsWith('/stages/public')?new Response('<html/>',{headers:{'content-type':'text/html'}}):happy(url),
  (url)=>url.endsWith('/stages/public')?new Response(null,{status:302,headers:{location:'https://usd-russia.ru/'}}):happy(url),
  (url)=>url.endsWith('/records/current')?new Response('[]',{headers:{'content-type':'application/json','content-length':'5000000'}}):happy(url),
  (url)=>url.includes('/stage-poster-')?new Response('<html/>',{headers:{'content-type':'text/html'}}):happy(url),
 ];
 for(const special of cases){
  const report=await inspectOnlineRelease({expectedSha:REVISION,request:async url=>special(url)});
  assert.equal(report.ok,false,JSON.stringify(report));
 }
});

test('invalid requested SHA fails locally before any network call',async()=>{
 let calls=0;
 await assert.rejects(inspectOnlineRelease({expectedSha:'latest',request:async()=>{calls++;return happy('')}}),/40/);
 assert.equal(calls,0);
});

test('reports never echo public participant names or request payloads',async()=>{
 const report=await inspectOnlineRelease({expectedSha:REVISION,request:async url=>{
  if(url.endsWith('/records/current'))return response([{id:'id1',participant:{name:'Private Example Name',email:'private@example.test'}}]);
  return happy(url);
 }});
 assert.equal(report.ok,true);
 assert.doesNotMatch(JSON.stringify(report),/Private Example Name|private@example.test/);
});
