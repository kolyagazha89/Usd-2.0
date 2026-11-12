import test from 'node:test';
import assert from 'node:assert/strict';
import {collectVenueJournal} from './export-venue-return.mjs';
import {readFile} from 'node:fs/promises';
const stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const baseline='a'.repeat(64);
const now=Date.parse('2026-11-12T05:00:00.000Z');
const env={
 USD_VENUE_LAN_MODE:'true',VENUE_STAGE_ID:stage,
 DATABASE_URL:'postgresql://usd_venue:local-secret@db:5432/usd_venue?schema=public',
 VENUE_DB_NAME:'usd_venue',VENUE_DB_USER:'usd_venue',VENUE_DB_PASSWORD:'local-secret',
};
const event={
 sequence:1,previousHash:'0'.repeat(64),hash:'b'.repeat(64),calculated:'b'.repeat(64),
 payload:{sequence:1,stageId:stage,table:'Result',
  recordId:'b610f672-79f7-44eb-8173-2a8ff94b1c0e',operation:'INSERT',
  before:null,after:{id:'b610f672-79f7-44eb-8173-2a8ff94b1c0e',value:'147.250'},
  recordedAt:new Date(now-1000).toISOString()},
};
function fakeDb({role=false,stages=[{id:stage}],audit={metadata:{sha256:baseline}},rows=[event]}={}){
 const tx={
  $queryRawUnsafe:async sql=>sql.includes('pg_roles')?[{rolsuper:role}]:rows,
  stage:{findMany:async()=>stages},
  auditLog:{findFirst:async()=>audit},
 };
 return {$transaction:async(callback,opts)=>{
  assert.equal(opts.isolationLevel,'RepeatableRead');
  return callback(tx);
 }};
}
test('read-only MVCC collector validates central signed baseline and root-owned journal chain',async()=>{
 const snapshot=await collectVenueJournal(fakeDb(),env,now);
 assert.equal(snapshot.stageId,stage);
 assert.equal(snapshot.baselineSha256,baseline);
 assert.equal(snapshot.eventCount,1);
 assert.equal(snapshot.events[0].hash,event.hash);
 assert.equal(snapshot.events[0].calculated,undefined);
});
test('reject unsafe old root database, different stage, absent original audit, tampered chain',async()=>{
 for(const opts of [
  {role:true},{stages:[{id:'other'}]},
  {stages:[{id:stage},{id:'other'}]},
  {audit:null},
  {rows:[{...event,calculated:'0'.repeat(64)}]},
  {rows:[{...event,previousHash:'c'.repeat(64)}]},
 ]){
  await assert.rejects(()=>collectVenueJournal(fakeDb(opts),env,now));
 }
 await assert.rejects(()=>collectVenueJournal(fakeDb(),{
  ...env,DATABASE_URL:'postgresql://user:pw@api.usd-russia.ru/prod',
 },now));
});
test('scripts keep the private key out of API service and central server',async()=>{
 const [shell,cli,verify]=await Promise.all([
  readFile(new URL('./export-venue-return.sh',import.meta.url),'utf8'),
  readFile(new URL('./export-venue-return.mjs',import.meta.url),'utf8'),
  readFile(new URL('./verify-venue-return.mjs',import.meta.url),'utf8'),
 ]);
 assert.match(shell,/read -r -s/);
 assert.match(shell,/private\.pem:ro|venue-return-signing-private\.pem:ro/);
 assert.match(shell,/printf '%s' "\$PASS"/);
 assert.match(cli,/open\(file,'wx',0o600\)/);
 assert.match(cli,/isolationLevel:'RepeatableRead'/);
 assert.match(verify,/READ ONLY, NOT APPLIED/);
 assert.doesNotMatch(cli,/fetch\(|https?:\/\//);
});
