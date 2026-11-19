import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {
  venueMediaPolicy,signRustfsRequest,provisionVenueMedia,
} from './provision-rustfs.mjs';

const cfg={
  VENUE_S3_ROOT_ACCESS:'venue-root-example',
  VENUE_S3_ROOT_SECRET:'root-secret-12345678901234567890123456789',
  VENUE_S3_APP_ACCESS:'usd-venue-app-123456',
  VENUE_S3_APP_SECRET:'venue-app-secret-12345678901234567890123456789',
};
const endpoint='http://rustfs:9000';
test('bucket IAM policy grants only the isolated media bucket and no admin rights',()=>{
 const policy=venueMediaPolicy();
 assert.equal(policy.Version,'2012-10-17');
 const json=JSON.stringify(policy);
 assert.match(json,/usd-venue-media/);
 assert.doesNotMatch(json,/usd-home|arn:aws:s3:::\*|admin:\*|s3:\*/);
 assert.ok(policy.Statement.every(row=>row.Effect==='Allow'
  &&row.Resource.every(resource=>resource==='arn:aws:s3:::usd-venue-media'
   ||resource==='arn:aws:s3:::usd-venue-media/*')));
 assert.ok(!json.includes('s3:ListAllMyBuckets'));
 assert.equal(policy.Statement.some(row=>row.Resource.includes('arn:aws:s3:::usd-venue-media/*')),true);
 assert.equal(policy.Statement.some(row=>row.Resource.includes('arn:aws:s3:::usd-venue-media')),true);
});
test('AWS SigV4 is deterministic and body-bound; no raw secret leaves headers',()=>{
 const body='{"secretKey":"private"}';
 const date=new Date('2026-11-12T10:30:00Z');
 const a=signRustfsRequest({method:'PUT',endpoint,path:'/rustfs/admin/v3/add-user',
  query:{accessKey:'usd-venue'},body,accessKey:cfg.VENUE_S3_ROOT_ACCESS,
  secretKey:cfg.VENUE_S3_ROOT_SECRET,now:date});
 const b=signRustfsRequest({method:'PUT',endpoint,path:'/rustfs/admin/v3/add-user',
  query:{accessKey:'usd-venue'},body,accessKey:cfg.VENUE_S3_ROOT_ACCESS,
  secretKey:cfg.VENUE_S3_ROOT_SECRET,now:date});
 assert.equal(a.url,b.url);assert.deepEqual(a.headers,b.headers);
 assert.match(a.headers.Authorization,/AWS4-HMAC-SHA256/);
 assert.match(a.headers['x-amz-content-sha256'],/^[a-f0-9]{64}$/);
 assert.equal(a.headers['x-amz-content-sha256'],createHash('sha256').update(body).digest('hex'));
 assert.ok(!JSON.stringify(a.headers).includes(cfg.VENUE_S3_ROOT_SECRET));
 assert.notEqual(a.headers.Authorization,signRustfsRequest({method:'PUT',endpoint,
  path:'/rustfs/admin/v3/add-user',query:{accessKey:'usd-venue'},body:body+'x',
  accessKey:cfg.VENUE_S3_ROOT_ACCESS,secretKey:cfg.VENUE_S3_ROOT_SECRET,now:date}).headers.Authorization);
 assert.throws(()=>signRustfsRequest({method:'GET',endpoint:'https://public.example.com',
  path:'/',accessKey:'a',secretKey:'b'}),/RustFS|локальн/);
});
test('first provisioning creates private bucket, policy and app account with restricted access',async()=>{
 const requests=[];
 const fetcher=async(url,init)=>{
  requests.push({url,init});
  if(url.endsWith('/usd-venue-media')&&init.method==='HEAD')return {status:404,ok:false,text:async()=>''};
  if(url.includes('info-canned-policy?'))return {status:404,ok:false,text:async()=>''};
  if(url.includes('user-info?'))return {status:404,ok:false,text:async()=>''};
  if(url.endsWith('/usd-venue-media')&&init.method==='PUT')return {status:200,ok:true,text:async()=>''};
  if(url.includes('/rustfs/admin/v3/list-users')&&init.method==='GET'){
   const root=init.headers.Authorization.includes('Credential=venue-root-example/');
   return {status:root?200:403,ok:root,text:async()=>''};
  }
  if(url.includes('/rustfs/admin/v3/')&&init.method==='PUT')return {status:200,ok:true,text:async()=>''};
  if(url.endsWith('/usd-venue-media')&&init.method==='GET')return {status:200,ok:true,text:async()=>''};
  if(url.endsWith('/')&&init.method==='GET'){
   const root=init.headers.Authorization.includes('Credential=venue-root-example/');
   return {status:root?200:403,ok:root,text:async()=>''};
  }
  return {status:200,ok:true,text:async()=>''};
 };
 const result=await provisionVenueMedia(cfg,{fetcher,endpoint,now:new Date('2026-11-12T10:30:00Z')});
 assert.equal(result.bucket,'usd-venue-media');
 assert.equal(result.restricted,true);
 assert.ok(requests.some(x=>x.url.includes('/rustfs/admin/v3/add-user')));
 assert.ok(requests.some(x=>x.url.includes('/add-canned-policy')));
 assert.ok(requests.some(x=>x.url.includes('/set-user-or-group-policy')));
 assert.ok(requests.some(x=>x.url.endsWith('/usd-venue-media')&&x.init.method==='PUT'));
 assert.ok(!JSON.stringify(requests).includes(cfg.VENUE_S3_APP_SECRET)||
  requests.some(x=>x.init.body?.includes(cfg.VENUE_S3_APP_SECRET)));
});
test('unknown existing IAM user cannot be overwritten and reports safe inspection stage',async()=>{
 const fetcher=async(url,init)=>{
  if(init.method==='PUT')throw new Error('Unexpected mutation of existing IAM');
  if(url.includes('user-info?'))return {status:200,ok:true,text:async()=>JSON.stringify({accessKey:cfg.VENUE_S3_APP_ACCESS})};
  return {status:200,ok:true,text:async()=>''};
 };
 await assert.rejects(()=>provisionVenueMedia(cfg,{fetcher,endpoint}),/USD VENUE MEDIA FAILED AT inspect-user/);
});
test('provisioning refuses root/app reuse and external storage target',async()=>{
 await assert.rejects(()=>provisionVenueMedia({...cfg,VENUE_S3_APP_ACCESS:cfg.VENUE_S3_ROOT_ACCESS},
  {fetcher:()=>{throw Error('should not call')},endpoint}),/root|совпад|разные/i);
 await assert.rejects(()=>provisionVenueMedia(cfg,{endpoint:'https://s3.amazonaws.com',
  fetcher:()=>{throw Error('should not call')}}),/локальн|RustFS/);
});

const mockResponse=(status,body='')=>({status,ok:status>=200&&status<300,
 text:async()=>typeof body==='string'?body:JSON.stringify(body)});
function resumedRustfsFetcher({userPolicy='usd-venue-media-only',policy=venueMediaPolicy(),userPresent=true,bucketPresent=true}={}){
 const writes=[];
 const fetcher=async(url,init)=>{
  const isRoot=init.headers.Authorization.includes('Credential=venue-root-example/');
  if(init.method==='PUT'){writes.push(url);return mockResponse(200)}
  if(url.endsWith('/rustfs/admin/v3/user-info?accessKey='+cfg.VENUE_S3_APP_ACCESS))
   return userPresent?mockResponse(200,{status:'enabled',policyName:userPolicy}):mockResponse(404);
  if(url.includes('/rustfs/admin/v3/info-canned-policy?'))
   return policy?mockResponse(200,{policy:JSON.stringify(policy)}):mockResponse(404);
  if(url.endsWith('/usd-venue-media')&&init.method==='HEAD')return mockResponse(bucketPresent?200:404);
  if(url.endsWith('/usd-venue-media')&&init.method==='GET')return mockResponse(200);
  if(url.includes('/rustfs/admin/v3/list-users'))return mockResponse(isRoot?200:403);
  if(url.endsWith('/'))return mockResponse(isRoot?200:403);
  throw new Error('unexpected test route');
 };
 return {fetcher,writes};
}
test('re-run on an already fully provisioned media volume is read-only and verifies permissions',async()=>{
 const {fetcher,writes}=resumedRustfsFetcher();
 const result=await provisionVenueMedia(cfg,{fetcher,endpoint});
 assert.deepEqual(result,{bucket:'usd-venue-media',restricted:true});
 assert.equal(writes.length,0,'existing IAM identities and storage must not be overwritten');
});
test('resume after bucket and policy were created: create missing app user and narrow binding only',async()=>{
 const {fetcher,writes}=resumedRustfsFetcher({userPresent:false});
 await provisionVenueMedia(cfg,{fetcher,endpoint});
 assert.equal(writes.length,2);
 assert.ok(writes.some(url=>url.includes('/add-user?')));
 assert.ok(writes.some(url=>url.includes('/set-user-or-group-policy?')));
 assert.ok(!writes.some(url=>url.endsWith('/usd-venue-media')||url.includes('/add-canned-policy?')));
});
test('resume after new app user was created before IAM assignment',async()=>{
 const {fetcher,writes}=resumedRustfsFetcher({userPolicy:''});
 await provisionVenueMedia(cfg,{fetcher,endpoint});
 assert.equal(writes.length,1);
 assert.ok(writes[0].includes('/set-user-or-group-policy?'));
});
test('never reuse broader stored IAM policy and never mutate conflicting identities',async()=>{
 for(const state of [
  {policy:{...venueMediaPolicy(),Statement:[...venueMediaPolicy().Statement,{Effect:'Allow',Action:['s3:*'],Resource:['*']}]}},
  {userPolicy:'admin'}
 ]){
  const {fetcher,writes}=resumedRustfsFetcher(state);
  await assert.rejects(()=>provisionVenueMedia(cfg,{fetcher,endpoint}),/USD VENUE MEDIA FAILED AT inspect-(policy|user)/);
  assert.equal(writes.length,0);
 }
});
test('waits for the actual RustFS readiness endpoint before authenticating during slow first boot',async()=>{
 const {fetcher}=resumedRustfsFetcher();
 let readinessChecks=0,rootChecks=0;
 const slowFirstBoot=async(url,init)=>{
  if(url.endsWith('/health/ready')){
   readinessChecks++;
   return mockResponse(readinessChecks<36?503:200,{ready:readinessChecks>=36});
  }
  if(url.endsWith('/')&&init.method==='GET')rootChecks++;
  return fetcher(url,init);
 };
 const result=await provisionVenueMedia(cfg,{
  fetcher:slowFirstBoot,endpoint,sleep:async()=>{},startupTimeoutMs:180000,
 });
 assert.deepEqual(result,{bucket:'usd-venue-media',restricted:true});
 assert.equal(readinessChecks,36,'installer must wait through RustFS startup instead of racing the first boot');
 assert.equal(rootChecks,1,'root authentication starts only after RustFS reports ready');
});
test('root auth or failed IAM write reports step and HTTP code without printing secrets',async()=>{
 const unauthorized=async()=>mockResponse(403);
 await assert.rejects(()=>provisionVenueMedia(cfg,{fetcher:unauthorized,endpoint}),/USD VENUE MEDIA FAILED AT root-readiness \[HTTP 403\]/);
 const {fetcher}=resumedRustfsFetcher({userPresent:false});
 const failWrite=async(url,init)=>{
  if(url.includes('/add-user?'))return mockResponse(503,'private-credential-cannot-leak');
  return fetcher(url,init);
 };
 await assert.rejects(()=>provisionVenueMedia(cfg,{fetcher:failWrite,endpoint}),err=>{
  assert.match(err.message,/FAILED AT create-user \[HTTP 503\]/);
  assert.doesNotMatch(err.message,/private-credential|root-secret|VENUE_S3/);
  return true;
 });
});
