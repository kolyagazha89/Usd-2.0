import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {applyCompleteVenueJournal} from './full-return-apply.mjs';
import {FULL_RETURN_COVERAGE_TABLES} from './venue-return-package.mjs';

const ids={
 stage:'c510f672-79f7-44eb-8173-2a8ff94b1c0e',
 participant:'e510f672-79f7-44eb-8173-2a8ff94b1c0e',
 car:'b610f672-79f7-44eb-8173-2a8ff94b1c0e',
 version:'c610f672-79f7-44eb-8173-2a8ff94b1c0e',
 config:'d610f672-79f7-44eb-8173-2a8ff94b1c0e',
 reg:'f610f672-79f7-44eb-8173-2a8ff94b1c0e',
 number:'a610f672-79f7-44eb-8173-2a8ff94b1c0e',
 cls:'bc10f672-79f7-44eb-8173-2a8ff94b1c0e',
 insp:'cd10f672-79f7-44eb-8173-2a8ff94b1c0e',
 result:'de10f672-79f7-44eb-8173-2a8ff94b1c0e',
};
const h=n=>n.toString(16).padStart(64,'0');
const baseline='a'.repeat(64);
function event(sequence,table,operation,row,before=null){
 const p={sequence,stageId:ids.stage,table,recordId:row.id,operation,
  before:operation==='INSERT'?null:structuredClone(before),after:operation==='DELETE'?null:structuredClone(row),recordedAt:'2026-11-12T10:00:00.000Z'};
 return {sequence,previousHash:h(sequence-1),hash:h(sequence),payload:p};
}
function packet(events){return {format:2,journalCoverage:{fromSequence:0,tables:FULL_RETURN_COVERAGE_TABLES},stageId:ids.stage,baselineSha256:baseline,
 journalEndHash:events.at(-1)?.hash??'0'.repeat(64),events};}
const participant={id:ids.participant,firstName:'Анна',lastName:'Тестовая',phone:null,photoUrl:null};
const car={id:ids.car,participantId:ids.participant,brand:'Lada',model:'Vesta',photoUrl:null};
const config={id:ids.config,carId:ids.car,name:'SPL 2026'};
const version={id:ids.version,configurationId:ids.config,version:1};
const reg={id:ids.reg,stageId:ids.stage,participantId:ids.participant,
 carId:ids.car,configurationVersionId:ids.version,participantNumber:19,status:'ACTIVE'};
const number={id:ids.number,stageId:ids.stage,registrationId:ids.reg,number:19,isPrimary:true};
const cls={id:ids.cls,registrationId:ids.reg,classId:'ab10f672-79f7-44eb-8173-2a8ff94b1c0e',numberId:ids.number};
const insp={id:ids.insp,registrationId:ids.reg,status:'PASSED',checkedByName:'Judge',
 checkedByUserId:'ca10f672-79f7-44eb-8173-2a8ff94b1c0e',notes:null};
const result={id:ids.result,registrationId:ids.reg,registrationClassId:ids.cls,
 value:'153.200',unit:'DB',isBest:false,place:1,notes:null,
 createdByUserId:'ca10f672-79f7-44eb-8173-2a8ff94b1c0e'};
const full=()=>packet([
 event(1,'Participant','INSERT',participant),
 event(2,'Car','INSERT',car),
 event(3,'CarConfiguration','INSERT',config),
 event(4,'CarConfigurationVersion','INSERT',version),
 event(5,'Registration','INSERT',reg),
 event(6,'RegistrationNumber','INSERT',number),
 event(7,'RegistrationClass','INSERT',cls),
 event(8,'Inspection','INSERT',insp),
 event(9,'Result','INSERT',result),
]);
function memoryDb({conflict=false,failAt=0,existing={},published=false}={}){
 const rows=new Map(Object.entries(existing).map(([table,records])=>
  [table,new Map(records.map(r=>[r.id,structuredClone(r)]))]));
 const receipt=new Map();let begin=0;
 return {
  rows,receipt,
  transaction:async (cb,{readOnly=false}={})=>{
   begin++;
   const working=new Map([...rows].map(([t,items])=>
    [t,new Map([...items].map(([id,row])=>[id,structuredClone(row)]))]));
   const receipts=new Map(receipt);
   const adapter={
    stage:async()=>({id:ids.stage,status:'PUBLISHED',isDeleted:false,
     resultsPublishedAt:published?'2026-11-11':null}),
    listReceipts:async()=>[...receipts.values()],
    getRow:async (table,id)=>structuredClone(working.get(table)?.get(id)??null),
    canonical:async (_table,row)=>structuredClone(row),
    stageClassAllowed:async()=>true,
    participantEligible:async()=>true,
    resultAdmission:async()=>true,
    numberOwner:async (_stage,number)=>[...(working.get('RegistrationNumber')?.values()??[])].find(r=>r.number===number)??null,
    write:async (table,op,row,before)=>{
     if(failAt&&Number(op.eventSequence)===failAt)throw Error('simulated db failure');
     if(!working.has(table))working.set(table,new Map());
     const dest=working.get(table);
     if(op.kind==='INSERT')dest.set(row.id,structuredClone(row));
     else if(op.kind==='UPDATE')dest.set(row.id,structuredClone(row));
     else if(op.kind==='DELETE')dest.delete(before.id);
    },
    receipt:async record=>{receipts.set(record.eventHash,record)},
    linkedIds:async()=>({participants:new Set(),cars:new Set(),configurations:new Set(),versions:new Set()}),
  };
   const value=await cb(adapter);
   if(!readOnly){
    rows.clear();for(const [t,entries] of working)rows.set(t,entries);
    receipt.clear();for(const [id,entry] of receipts)receipt.set(id,entry);
   }
   return value;
  },
  get begin(){return begin},
 };
}
const opts={stageId:ids.stage,baselineSha256:baseline,apply:true,operator:'USD admin'};

test('full disconnected entrant -> car -> configuration -> number -> inspection -> result is atomic',async()=>{
 const db=memoryDb();
 const outcome=await applyCompleteVenueJournal(full(),db,opts);
 assert.equal(outcome.databaseSynchronized,true);
 assert.equal(outcome.appliedEvents,9);
 assert.equal(db.rows.get('Registration').get(ids.reg).participantNumber,19);
 assert.equal(db.rows.get('Result').get(ids.result).value,'153.200');
 assert.equal(db.rows.get('Inspection').get(ids.insp).checkedByUserId,null);
 assert.equal(db.receipt.size,9);
 const retry=await applyCompleteVenueJournal(full(),db,opts);
 assert.equal(retry.alreadyApplied,true);
 assert.equal(db.receipt.size,9);
});
test('dry-run checks whole history and leaves no rows or receipts',async()=>{
 const db=memoryDb();
 const report=await applyCompleteVenueJournal(full(),db,{...opts,apply:false});
 assert.equal(report.readyEvents,9);
 assert.equal(report.databaseSynchronized,false);
 assert.equal(db.rows.size,0);
 assert.equal(db.receipt.size,0);
});
test('any conflicting stage sticker number aborts entire import before first insert',async()=>{
 const db=memoryDb({existing:{RegistrationNumber:[{
  id:'c310f672-79f7-44eb-8173-2a8ff94b1c0e',stageId:ids.stage,number:19,
 }]}});
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,opts),/CONFLICT|conflict|номер/i);
 assert.equal(db.rows.get('Participant'),undefined);
 assert.equal(db.receipt.size,0);
});
test('media uploaded to venue is not advertised as synchronized',async()=>{
 const db=memoryDb();
 const changed=full();
 changed.events[1].payload.after.photoUrl='https://10.10.0.2/venue-media/photo';
 await assert.rejects(()=>applyCompleteVenueJournal(changed,db,opts),/MEDIA|media|фото/i);
 assert.equal(db.receipt.size,0);
});
test('local change to disqualification or stage publication cannot be replayed automatically',async()=>{
 for(const table of ['Stage','Disqualification']){
  const db=memoryDb();
  await assert.rejects(()=>applyCompleteVenueJournal(packet([event(1,table,'UPDATE',{
   id:ids.stage,status:'PUBLISHED'}, {id:ids.stage,status:'DRAFT'})]),db,opts),/MANUAL|запрещ|ручн/i);
 }
});
test('malformed mutation cannot write unsupported fields or outside-stage registration',async()=>{
 for(const patch of [{unknownSecret:'oops'},{stageId:'a610f672-79f7-44eb-8173-2a8ff94b1c0e'}]){
  const db=memoryDb();
  const row={...reg,...patch};
  await assert.rejects(()=>applyCompleteVenueJournal(packet([event(1,'Registration','INSERT',row)]),db,opts));
  assert.equal(db.receipt.size,0);
 }
});
test('full stage crash after first insert rolls back all registrations, numbers and receipts',async()=>{
 const db=memoryDb({failAt:6});
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,opts),/failure/);
 assert.equal(db.rows.size,0);
 assert.equal(db.receipt.size,0);
});
test('later update of class assignment and cancellation is sequential and atomic',async()=>{
 const changed={...reg,status:'CANCELLED'};
 const db=memoryDb({existing:{Registration:[reg]}});
 const report=await applyCompleteVenueJournal(packet([
  event(1,'Registration','UPDATE',changed,reg)]),db,opts);
 assert.equal(report.databaseSynchronized,true);
 assert.equal(db.rows.get('Registration').get(reg.id).status,'CANCELLED');
});
test('unexpected stage reference and identity mismatch fail closed',async()=>{
 const db=memoryDb();
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,{...opts,stageId:ids.car}));
 await assert.rejects(()=>applyCompleteVenueJournal(packet([event(1,'Car','INSERT',{...car,id:ids.reg})]),db,opts));
 assert.equal(db.receipt.size,0);
});

test('a centrally disqualified entrant cannot be reintroduced through an offline package',async()=>{
 const db=memoryDb();
 const original=db.transaction;
 db.transaction=(fn,opts)=>original(async tx=>{
  tx.participantEligible=async()=>false;return fn(tx);
 },opts);
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,opts),/DISQUALIFIED|disqual/i);
 assert.equal(db.receipt.size,0);
});
test('offline class not configured for this stage is rejected atomically',async()=>{
 const db=memoryDb();
 const original=db.transaction;
 db.transaction=(fn,opts)=>original(async tx=>{
  tx.stageClassAllowed=async()=>false;return fn(tx);
 },opts);
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,opts),/class.*stage|класс/i);
 assert.equal(db.receipt.size,0);
});

test('signed amplifier-to-speaker linkage is transferred with new configuration',async()=>{
 const amplifier='a710f672-79f7-44eb-8173-2a8ff94b1c0e';
 const component='a810f672-79f7-44eb-8173-2a8ff94b1c0e';
 const hashId=createHash('md5').update(amplifier+'/'+component).digest('hex');
 const fixed=hashId.slice(0,12)+'5'+hashId.slice(13,16)+'8'+hashId.slice(17);
 const link=fixed.slice(0,8)+'-'+fixed.slice(8,12)+'-'+fixed.slice(12,16)+'-'+fixed.slice(16,20)+'-'+fixed.slice(20);
 const fixture=full();
 fixture.events.splice(4,0,
  event(5,'CarAmplifier','INSERT',{id:amplifier,versionId:ids.version,brand:'Taramps',model:'Bass 5K',direction:'SUB'}),
  event(6,'CarAudioComponent','INSERT',{id:component,versionId:ids.version,brand:'Pride',model:'Solo',type:'SUBWOOFER',direction:'SUB'}),
  event(7,'CarAmplifierComponent','INSERT',{id:link,amplifierId:amplifier,componentId:component,quantity:1})
 );
 fixture.events.forEach((e,index)=>{
  e.sequence=index+1;e.previousHash=h(index);e.hash=h(index+1);e.payload.sequence=index+1;
 });
 fixture.journalEndHash=fixture.events.at(-1).hash;
 const db=memoryDb();
 const result=await applyCompleteVenueJournal(fixture,db,opts);
 assert.equal(result.databaseSynchronized,true);
 assert.equal(db.rows.get('CarAmplifierComponent').get(link).quantity,1);
 assert.equal(db.receipt.size,12);
});

test('a changed central score cannot be accepted merely because its signed receipt exists',async()=>{
 const db=memoryDb();
 await applyCompleteVenueJournal(full(),db,opts);
 db.rows.get('Result').get(ids.result).value='110.000';
 await assert.rejects(
  ()=>applyCompleteVenueJournal(full(),db,opts),/CENTRAL_CHANGED/);
 assert.equal(db.receipt.size,9);
});
test('a centrally deleted participant prevents false replay acknowledgement',async()=>{
 const db=memoryDb();
 await applyCompleteVenueJournal(full(),db,opts);
 db.rows.get('Participant').delete(ids.participant);
 await assert.rejects(
  ()=>applyCompleteVenueJournal(full(),db,opts),/CENTRAL_CHANGED/);
});

test('offline return never wipes an existing central photo reference', async()=>{
 const prior={...participant,photoUrl:'https://central.example/profile-photo'};
 const changed={...prior,photoUrl:null};
 const db=memoryDb({existing:{Participant:[prior]}});
 const signed=full();
 signed.events[0]=event(1,'Participant','UPDATE',changed,prior);
 await assert.rejects(()=>applyCompleteVenueJournal(signed,db,opts),/MEDIA/);
 assert.equal(db.rows.get('Participant').get(prior.id).photoUrl,prior.photoUrl);
});
test('photo-free stage requires no media transfer despite having competition results',async()=>{
 const db=memoryDb();
 const report=await applyCompleteVenueJournal(full(),db,opts);
 assert.equal(report.mediaTransferRequired,false);
 assert.equal(report.mediaSynchronized,false);
 assert.equal(report.databaseSynchronized,true);
});
