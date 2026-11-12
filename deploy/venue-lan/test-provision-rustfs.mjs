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
test('existing app user or policy cannot be silently overwritten by installer',async()=>{
 const fetcher=async(url,init)=>{
  if(url.includes('user-info?'))return {status:200,ok:true,text:async()=>JSON.stringify({accessKey:cfg.VENUE_S3_APP_ACCESS})};
  return {status:200,ok:true,text:async()=>''};
 };
 await assert.rejects(()=>provisionVenueMedia(cfg,{fetcher,endpoint}),/существ|уже/i);
});
test('provisioning refuses root/app reuse and external storage target',async()=>{
 await assert.rejects(()=>provisionVenueMedia({...cfg,VENUE_S3_APP_ACCESS:cfg.VENUE_S3_ROOT_ACCESS},
  {fetcher:()=>{throw Error('should not call')},endpoint}),/root|совпад|разные/i);
 await assert.rejects(()=>provisionVenueMedia(cfg,{endpoint:'https://s3.amazonaws.com',
  fetcher:()=>{throw Error('should not call')}}),/локальн|RustFS/);
});
