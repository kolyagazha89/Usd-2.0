import test from 'node:test';
import assert from 'node:assert/strict';
import {applyVenueReturnSnapshot,planVenueResultEvent} from './central-return-apply.mjs';

const stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const reg='cf0328c0-609c-4503-b92b-3c058d72372a';
const cls='5a4b83a1-51f5-4c2f-81c7-a01b78bcb51f';
const result='b610f672-79f7-44eb-8173-2a8ff94b1c0e';
const baseline='a'.repeat(64),eventHash='b'.repeat(64);
const score=()=>({
 id:result,registrationId:reg,registrationClassId:cls,value:'152.345',
 unit:'DB',place:1,isBest:false,notes:null,isHistorical:false,verificationStatus:'NOT_REQUIRED',
});
const event=(table='Result',operation='INSERT',after=score())=>({
 hash:eventHash,sequence:1,payload:{table,operation,recordId:result,after,before:null},
});
const packet=(events=[event()])=>({stageId:stage,baselineSha256:baseline,
 journalEndHash:eventHash,events});
const options={apply:true,operator:'USD admin operator',stageId:stage,baselineSha256:baseline};

function fakeDb({published=false,valid=true}={}){
 let stored=null;
 const receipts=new Set(),operations=[];
 const tx={
  stage:async()=>({id:stage,status:'PUBLISHED',isDeleted:false,resultsPublishedAt:published?'2026-11-12T12:00:00Z':null}),
  result:async(id,classId)=>({
   byId:stored?.id===id?stored:null,byClass:stored?.registrationClassId===classId?stored:null,
  }),
  receipt:async(_stageId,hash)=>receipts.has(hash),
  context:async()=>valid?({stageId:stage,registrationStatus:'ACTIVE',classId:cls,unit:'DB',inspectionStatus:'PASSED'}):null,
  insertResult:async row=>{stored={...row};operations.push('INSERT')},
  recordReceipt:async receipt=>{receipts.add(receipt.eventHash);operations.push('RECEIPT')},
 };
 return {
  transaction:async fn=>fn(tx),operations,
  get result(){return stored},
  get receipts(){return [...receipts]},
 };
}

test('signed event is applied once, with an audit receipt, then replay is idempotent',async()=>{
 const db=fakeDb();
 const first=await applyVenueReturnSnapshot(packet(),db,options);
 assert.equal(first.counts.APPLIED,1);
 assert.deepEqual(db.operations,['INSERT','RECEIPT']);
 const retry=await applyVenueReturnSnapshot(packet(),db,options);
 assert.equal(retry.counts.ALREADY_APPLIED,1);
 assert.deepEqual(db.operations,['INSERT','RECEIPT']);
 assert.equal(db.receipts.length,1);
});
test('dry run does not write, never claims a synchronized result',async()=>{
 const db=fakeDb();
 const report=await applyVenueReturnSnapshot(packet(),db,{...options,apply:false});
 assert.equal(report.counts.READY,1);
 assert.equal(report.applied,false);
 assert.equal(report.complete,false);
 assert.equal(db.operations.length,0);
});
test('unrelated venue edits stay pending while an independent result can import',async()=>{
 const db=fakeDb();
 const unrelated={...event('Registration'),hash:'c'.repeat(64),sequence:2};
 const report=await applyVenueReturnSnapshot(packet([event(),unrelated]),db,options);
 assert.equal(report.counts.APPLIED,1);
 assert.equal(report.counts.PENDING_MANUAL,1);
 assert.equal(report.complete,false);
 assert.equal(report.pending,1);
});
test('missing central stage prerequisites leave local result pending',async()=>{
 const db=fakeDb({valid:false});
 const report=await applyVenueReturnSnapshot(packet(),db,options);
 assert.equal(report.counts.PENDING_MANUAL,1);
 assert.equal(db.operations.length,0);
});
test('published stage blocks every write, even if local score appears valid',async()=>{
 const db=fakeDb({published:true});
 await assert.rejects(()=>applyVenueReturnSnapshot(packet(),db,options),/опубликованы/);
 assert.equal(db.operations.length,0);
});
test('malformed score, private note and historical result must be manually reviewed',()=>{
 for(const changes of [{value:'NaN'},{value:'152.3456'},{notes:'private'}, {isHistorical:true},
  {verificationStatus:'VERIFIED'}, {place:0},{registrationClassId:'wrong'}]){
  const plan=planVenueResultEvent(event('Result','INSERT',{...score(),...changes}));
  assert.equal(plan.status,'PENDING_MANUAL');
 }
});
test('stage/baseline mismatches and unconfirmed operator refuse apply',async()=>{
 const db=fakeDb();
 await assert.rejects(()=>applyVenueReturnSnapshot(packet(),db,{...options,stageId:'wrong'}));
 await assert.rejects(()=>applyVenueReturnSnapshot(packet(),db,{...options,baselineSha256:'b'.repeat(64)}));
 await assert.rejects(()=>applyVenueReturnSnapshot(packet(),db,{...options,operator:''}));
 assert.equal(db.operations.length,0);
});
test('update/delete are never silently applied or marked acknowledged',async()=>{
 const db=fakeDb();
 const report=await applyVenueReturnSnapshot(packet([event('Result','UPDATE',score()),event('Result','DELETE',null)]),db,options);
 assert.equal(report.counts.PENDING_MANUAL,2);
 assert.equal(db.operations.length,0);
});

test('an INSERT followed by a venue correction stays pending, never imports stale reading',async()=>{
 const db=fakeDb();
 const updated={...event('Result','UPDATE',score()),hash:'c'.repeat(64),sequence:2};
 updated.payload.before=score();
 updated.payload.after={...score(),value:'153.000'};
 const report=await applyVenueReturnSnapshot(packet([event(),updated]),db,options);
 assert.equal(report.counts.PENDING_MANUAL,2);
 assert.equal(report.counts.APPLIED,0);
 assert.equal(db.operations.length,0);
});
test('two local result identities targeting the same class cannot be imported',async()=>{
 const db=fakeDb();
 const other={...event(),hash:'c'.repeat(64),sequence:2};
 other.payload={...other.payload,recordId:'a710f672-79f7-44eb-8173-2a8ff94b1c0e',
  after:{...score(),id:'a710f672-79f7-44eb-8173-2a8ff94b1c0e'}};
 const report=await applyVenueReturnSnapshot(packet([event(),other]),db,options);
 assert.equal(report.counts.PENDING_MANUAL,2);
 assert.deepEqual(db.operations,[]);
});
