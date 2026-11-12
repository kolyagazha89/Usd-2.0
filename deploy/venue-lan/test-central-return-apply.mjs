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
  insertResult:async row=>{stored={...row,notes:null,isHistorical:false,verificationStatus:'NOT_REQUIRED'};operations.push('INSERT')},
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
 assert.equal(first.centralReleaseAccepted,false);
 assert.equal(first.derivedRankingsRebuilt,false);
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
test('unreconciled registration edit blocks all score imports for this stage',async()=>{
 const db=fakeDb();
 const unrelated={...event('Registration'),hash:'c'.repeat(64),sequence:2};
 const report=await applyVenueReturnSnapshot(packet([event(),unrelated]),db,options);
 assert.equal(report.counts.APPLIED,0);
 assert.equal(report.counts.PENDING_MANUAL,2);
 assert.equal(report.complete,false);
 assert.equal(report.pending,2);
 assert.deepEqual(db.operations,[]);
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

test('a venue correction introducing private notes stays pending for human review',async()=>{
 const db=fakeDb();
 const updated={...event('Result','UPDATE',score()),hash:'c'.repeat(64),sequence:2};
 updated.payload.before=score();
 updated.payload.after={...score(),value:'153.000',notes:'private note'};
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

test('on-site passed inspection of an existing entrant may be inserted before its result',async()=>{
 const participant='e510f672-79f7-44eb-8173-2a8ff94b1c0e';
 const inspection='d510f672-79f7-44eb-8173-2a8ff94b1c0e';
 const row={id:inspection,stageId:stage,participantId:participant,status:'PASSED',
  notes:null,checkedByName:'Judge 1',checkedAt:'2026-11-12T12:00:00.000Z'};
 const prior=event('ParticipantStageInspection','INSERT',row);
 prior.payload.recordId=inspection;
 const reading={...event(),sequence:2,hash:'c'.repeat(64)};
 const db=fakeDb({valid:false});
 db.transaction=async callback=>{
  let savedInspection=null,recorded=false;
  const tx={
   stage:async()=>({id:stage,status:'PUBLISHED',isDeleted:false,resultsPublishedAt:null}),
   stageInspection:async()=>({byId:savedInspection,byParticipant:savedInspection}),
   inspectionContext:async()=>({total:1,unlinked:1}),
   insertStageInspection:async saved=>{savedInspection=saved},
   recordReceipt:async()=>{recorded=true},
   receipt:async()=>recorded,
   result:async()=>({byId:null,byClass:null}),
   context:async()=>({stageId:stage,registrationStatus:'ACTIVE',classId:cls,unit:'DB',
    inspectionStatus:savedInspection?.status??null}),
   insertResult:async()=>{},
  };
  return callback(tx);
 };
 const report=await applyVenueReturnSnapshot({...packet([prior,reading]),journalEndHash:reading.hash},db,options);
 assert.equal(report.counts.APPLIED,2);
 assert.equal(report.pending,0);
});
test('inspection with later local correction is never imported mid-history',async()=>{
 const participant='e510f672-79f7-44eb-8173-2a8ff94b1c0e';
 const inspection='d510f672-79f7-44eb-8173-2a8ff94b1c0e';
 const first=event('ParticipantStageInspection','INSERT',{
  id:inspection,stageId:stage,participantId:participant,status:'FAILED',
  notes:'Предписание',checkedByName:'Judge 1',checkedAt:'2026-11-12T12:00:00.000Z',
 });
 first.payload.recordId=inspection;
 const next={...first,hash:'c'.repeat(64),sequence:2,payload:{
  ...first.payload,operation:'UPDATE',
  before:first.payload.after,after:{...first.payload.after,status:'PASSED'},
 }};
 const db=fakeDb();
 const report=await applyVenueReturnSnapshot({...packet([first,next]),journalEndHash:next.hash},db,options);
 assert.equal(report.counts.PENDING_MANUAL,2);
 assert.equal(report.counts.APPLIED,0);
});

test('normal local ranking UPDATE after INSERT imports only final score and receipts both journal events',async()=>{
 const db=fakeDb();
 const created=event();
 const corrected={...event('Result','UPDATE',{...score(),place:2}),hash:'c'.repeat(64),sequence:2};
 corrected.payload.before=score();
 const pack={...packet([created,corrected]),journalEndHash:corrected.hash};
 const first=await applyVenueReturnSnapshot(pack,db,options);
 assert.equal(first.counts.APPLIED,2);
 assert.equal(db.result.place,2);
 assert.equal(db.operations.filter(x=>x==='INSERT').length,1);
 assert.equal(db.receipts.length,2);
 const replay=await applyVenueReturnSnapshot(pack,db,options);
 assert.equal(replay.counts.ALREADY_APPLIED,2);
});
test('central re-ranking may change place but signed receipt remains idempotent',async()=>{
 const db=fakeDb();
 await applyVenueReturnSnapshot(packet(),db,options);
 db.result.place=3;db.result.isBest=true;
 const replay=await applyVenueReturnSnapshot(packet(),db,options);
 assert.equal(replay.counts.ALREADY_APPLIED,1);
 assert.equal(db.operations.filter(x=>x==='INSERT').length,1);
});
test('broken local result history never imports and never acknowledges',async()=>{
 const db=fakeDb();
 const created=event();
 const edited={...event('Result','UPDATE',{...score(),value:'155.000'}),hash:'c'.repeat(64),sequence:2};
 edited.payload.before={...score(),value:'140.000'};
 const report=await applyVenueReturnSnapshot({...packet([created,edited]),journalEndHash:edited.hash},db,options);
 assert.equal(report.counts.PENDING_MANUAL,2);
 assert.deepEqual(db.operations,[]);
});

test('changed registrations prevent falsely importing other measurements from stale central roster',async()=>{
 const db=fakeDb();
 const altered={sequence:2,hash:'c'.repeat(64),payload:{
  table:'RegistrationClass',operation:'UPDATE',recordId:cls,
  before:{id:cls},after:{id:cls},
 }};
 const report=await applyVenueReturnSnapshot({
  ...packet([event(),altered]),journalEndHash:altered.hash,
 },db,options);
 assert.equal(report.counts.APPLIED,0);
 assert.equal(report.counts.PENDING_MANUAL,2);
 assert.equal(report.rows[0].reason,'UNRECONCILED_VENUE_DEPENDENCIES');
 assert.deepEqual(db.operations,[]);
 assert.equal(report.complete,false);
});
test('no journal events is not evidence of an accepted stage release',async()=>{
 const db=fakeDb();
 const report=await applyVenueReturnSnapshot({
  ...packet([]),journalEndHash:'0'.repeat(64),
 },db,options);
 assert.equal(report.applied,false);
 assert.equal(report.complete,false);
 assert.equal(report.centralReleaseAccepted,false);
});
