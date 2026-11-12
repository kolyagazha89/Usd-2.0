import test from 'node:test';
import assert from 'node:assert/strict';
import {assertVenueIp,assertFreshDemoInstall,makeDemoEnv,scopedMediaPolicy,signedRustfsRequest} from './one-click-core.mjs';

const stageId='c510f672-79f7-44eb-8173-2a8ff94b1c0e',fingerprint='a'.repeat(64);
test('setup accepts only RFC1918 laptop IPs and rejects public/loopback',()=>{
 for(const good of ['10.2.3.4','172.20.20.2','192.168.50.10'])
  assert.equal(assertVenueIp(good),good);
 for(const bad of ['0.0.0.0','127.0.0.1','1.1.1.1','100.64.0.1',
  '192.168.50.255','192.168.1.0','','::1'])
  assert.throws(()=>assertVenueIp(bad));
});
test('setup generates independent random passwords and pinned private DB',()=>{
 const a=makeDemoEnv({ip:'192.168.50.10',stageId,fingerprint});
 const b=makeDemoEnv({ip:'192.168.50.10',stageId,fingerprint});
 assert.notEqual(a.content,b.content);
 assert.match(a.settings.VENUE_IMAGE_TAG,/^[a-f0-9]{40}$/);
 assert.equal(new URL(a.settings.VENUE_DATABASE_URL).hostname,'db');
 assert.equal(a.settings.VENUE_DB_PASSWORD.length,64);
 assert.notEqual(a.settings.VENUE_DB_ROOT_PASSWORD,a.settings.VENUE_DB_PASSWORD);
 assert.notEqual(a.settings.VENUE_S3_ROOT_SECRET,a.settings.VENUE_S3_APP_SECRET);
 assert.doesNotMatch(a.content,/api\.usd-russia\.ru|prod-db/);
});
test('scoped IAM never grants another bucket or administration',()=>{
 const policy=JSON.stringify(scopedMediaPolicy());
 assert.match(policy,/usd-venue-media/);
 assert.doesNotMatch(policy,/s3:\*|arn:aws:s3:::\*|admin:/);
});
test('SigV4 signer authenticates localhost-only RustFS requests',()=>{
 const r=signedRustfsRequest({
  method:'PUT',path:'/rustfs/admin/v3/add-service-account',
  body:{accessKey:'user',policy:scopedMediaPolicy()},
  accessKey:'root',secretKey:'SECRET',date:new Date('2026-11-12T10:00:00Z'),
 });
 assert.equal(r.url,'http://127.0.0.1:19000/rustfs/admin/v3/add-service-account');
 assert.match(r.headers.authorization,/AWS4-HMAC-SHA256 Credential=root\/20261112\/us-east-1\/s3\/aws4_request/);
 assert.match(r.headers['x-amz-content-sha256'],/^[a-f0-9]{64}$/);
 assert.ok(!r.url.includes('SECRET'));
 assert.throws(()=>signedRustfsRequest({method:'PUT',path:'http://evil.example',accessKey:'x',secretKey:'y'}));
});
test('never overwrite existing venue volume, container or partial install',()=>{
 const fresh={envExists:false,demoExists:false,volumeNames:[],containerIds:''};
 assert.doesNotThrow(()=>assertFreshDemoInstall(fresh));
 for(const extra of [{envExists:true},{demoExists:true},{volumeNames:['usd-venue_venue_db']},
  {volumeNames:['usd-venue_venue_media']},{containerIds:'existing-container'}])
  assert.throws(()=>assertFreshDemoInstall({...fresh,...extra}));
});
