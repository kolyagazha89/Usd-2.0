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
 const receipt=new Map(),overrides=[];let begin=0;
 const stage={id:ids.stage,status:'PUBLISHED',isDeleted:false,
  resultsPublishedAt:published?'2026-11-11':null};
 return {
  rows,receipt,overrides,stage,
  transaction:async (cb,{readOnly=false}={})=>{
   begin++;
   const working=new Map([...rows].map(([t,items])=>
    [t,new Map([...items].map(([id,row])=>[id,structuredClone(row)]))]));
   const receipts=new Map(receipt),pendingOverrides=[];
   const adapter={
    stage:async()=>stage,
    listReceipts:async()=>[...receipts.values()].filter(x=>x.action==='VENUE_FULL_EVENT_IMPORTED'),
    getRow:async (table,id)=>structuredClone(working.get(table)?.get(id)??null),
    canonical:async (_table,row)=>structuredClone(row),
    stageClassAllowed:async()=>true,
    participantEligible:async()=>true,
    resultAdmission:async()=>true,
    participantIdentityCandidates:async()=>[...(working.get('Participant')?.values()??[])],
    carPlateCandidates:async()=>[...(working.get('Car')?.values()??[])],
    numberOwner:async (_stage,number)=>[...(working.get('RegistrationNumber')?.values()??[])].find(r=>r.number===number)??null,
    findStageSlot:async (table,row,_stageId)=>{
     const sameSlot=(existing)=>{
      if(table==='Result')return existing.registrationId===row.registrationId&&
       existing.registrationClassId===row.registrationClassId;
      if(table==='Inspection')return existing.registrationId===row.registrationId;
      if(table==='ParticipantStageInspection')return existing.participantId===row.participantId&&
       existing.stageId===row.stageId;
      if(table==='RegistrationClassInspection')
       return existing.registrationClassId===row.registrationClassId;
      throw Error('unsupported slot');
     };
     return structuredClone([...(working.get(table)?.values()??[])].find(sameSlot)??null);
    },
    removeStageSlot:async (table,displaced)=>{working.get(table)?.delete(displaced.id)},
    auditOverride:async record=>{pendingOverrides.push(structuredClone(record))},
    write:async (table,op,row,before)=>{
     if(failAt&&Number(op.eventSequence)===failAt)throw Error('simulated db failure');
     if(!working.has(table))working.set(table,new Map());
     const dest=working.get(table);
     if(op.kind==='INSERT')dest.set(row.id,structuredClone(row));
     else if(op.kind==='UPDATE')dest.set(row.id,structuredClone(row));
     else if(op.kind==='DELETE')dest.delete(before.id);
    },
    auditResolution:async record=>{receipts.set('decision:'+record.sourceId,record)},
    receipt:async record=>{receipts.set(record.eventHash,record)},
    linkedIds:async()=>({participants:new Set(),cars:new Set(),configurations:new Set(),versions:new Set()}),
  };
   const value=await cb(adapter);
   if(!readOnly){
    rows.clear();for(const [t,entries] of working)rows.set(t,entries);
    receipt.clear();for(const [id,entry] of receipts)receipt.set(id,entry);
    overrides.push(...pendingOverrides);
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
test('signed on-site profile and car left unregistered at gate do not poison the entire return',async()=>{
 const db=memoryDb();
 const report=await applyCompleteVenueJournal(packet([
  event(1,'Participant','INSERT',participant),
  event(2,'Car','INSERT',car),
 ]),db,opts);
 assert.equal(report.appliedEvents,2);
 assert.equal(db.rows.get('Participant').get(ids.participant).id,ids.participant);
 assert.equal(db.rows.get('Car').get(ids.car).participantId,ids.participant);
 assert.equal(db.receipt.size,2);
});
test('published protocol blocks mixed intake atomically; same journal succeeds after unpublishing',async()=>{
 const newcomer={...participant,id:'ea10f672-79f7-44eb-8173-2a8ff94b1c0e',firstName:'Новый'};
 const newcomerCar={...car,id:'ba10f672-79f7-44eb-8173-2a8ff94b1c0e',participantId:newcomer.id};
 const db=memoryDb({published:true,existing:{Participant:[participant],Car:[car]}});
 const journal=packet([
  event(1,'CarConfiguration','INSERT',config),
  event(2,'CarConfigurationVersion','INSERT',version),
  event(3,'Registration','INSERT',reg),
  event(4,'RegistrationNumber','INSERT',number),
  event(5,'RegistrationClass','INSERT',cls),
  event(6,'Participant','INSERT',newcomer),
  event(7,'Car','INSERT',newcomerCar),
  event(8,'Inspection','INSERT',insp),
  event(9,'Result','INSERT',result),
  event(10,'Result','UPDATE',{...result,value:'154.100'},result),
 ]);
 await assert.rejects(()=>applyCompleteVenueJournal(journal,db,opts),{code:'RESULTS_ALREADY_PUBLISHED'});
 assert.equal(db.receipt.size,0);
 assert.equal(db.rows.get('Registration'),undefined);
 assert.equal(db.rows.get('Participant').size,1);
 db.stage.resultsPublishedAt=null;
 const outcome=await applyCompleteVenueJournal(journal,db,opts);
 assert.equal(outcome.appliedEvents,10);
 assert.equal(db.receipt.size,10);
 assert.deepEqual(db.rows.get('Participant').get(ids.participant),participant);
 assert.equal(db.rows.get('Registration').get(ids.reg).participantId,ids.participant);
 assert.equal(db.rows.get('Car').get(newcomerCar.id).participantId,newcomer.id);
 assert.equal(db.rows.get('Result').get(ids.result).value,'154.100');
 assert.equal((await applyCompleteVenueJournal(journal,db,opts)).alreadyApplied,true);
});
test('new car for an existing central profile is returned even before its stage registration',async()=>{
 const db=memoryDb({existing:{Participant:[participant]}});
 const report=await applyCompleteVenueJournal(packet([
  event(1,'Car','INSERT',car),
 ]),db,opts);
 assert.equal(report.appliedEvents,1);
 assert.equal(db.rows.get('Car').get(ids.car).participantId,ids.participant);
 assert.equal(db.receipt.size,1);
});
test('adding a car alone never authorizes changes to an unregistered central identity',async()=>{
 const db=memoryDb({existing:{Participant:[participant]}});
 await assert.rejects(()=>applyCompleteVenueJournal(packet([
  event(1,'Car','INSERT',car),
  event(2,'Participant','UPDATE',{...participant,firstName:'Подмена'},participant),
 ]),db,opts),/unregistered central identity|outside this stage/i);
 assert.equal(db.receipt.size,0);
 assert.equal(db.rows.get('Participant').get(ids.participant).firstName,'Анна');
});
test('a stray unpaired participant INSERT cannot escape the stage-scoped journal',async()=>{
 const db=memoryDb();
 await assert.rejects(()=>applyCompleteVenueJournal(packet([
  event(1,'Participant','INSERT',participant),
 ]),db,opts),/unpaired|car/i);
 assert.equal(db.receipt.size,0);
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
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,opts),{code:'START_NUMBER_TAKEN'});
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

test('a new offline UUID with the same normalized FIO as a central account is MANUAL_REVIEW, never duplicated',async()=>{
 const db=memoryDb({existing:{Participant:[{
  id:'8b596264-15dd-46d8-92aa-c4e1c50c0205',
  firstName:'  АННА ',lastName:' Тестовая ',middleName:null,
 }]}});
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,opts),/MANUAL_REVIEW.*DUPLICATE_PARTICIPANT_NAME/);
 assert.equal(db.rows.get('Participant').size,1);
 assert.equal(db.rows.get('Registration'),undefined);
 assert.equal(db.rows.get('Result'),undefined);
 assert.equal(db.receipt.size,0);
});
test('a newly created onsite entrant whose name matches a centrally created participant while WAN is down is not duplicated',async()=>{
 const db=memoryDb({existing:{Participant:[{
  id:'8b596264-15dd-46d8-92aa-c4e1c50c0205',
  firstName:'Анна',lastName:'Тестовая',middleName:'  ',
 }]}});
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,{...opts,apply:false}),/MANUAL_REVIEW.*DUPLICATE_PARTICIPANT_NAME/);
 assert.equal(db.rows.get('Participant').size,1);
 assert.equal(db.receipt.size,0);
});
test('true namesakes are not merged; another spelling of the name with distinct middle names is safe to import',async()=>{
 const db=memoryDb({existing:{Participant:[{
  id:'8b596264-15dd-46d8-92aa-c4e1c50c0205',
  firstName:'Анна',lastName:'Тестовая',middleName:'Мария',
 }]}});
 const changed=full();changed.events[0].payload.after.middleName='Павловна';
 const report=await applyCompleteVenueJournal(changed,db,{...opts,apply:false});
 assert.equal(report.readyEvents,9);
 assert.equal(db.rows.get('Participant').size,1);
});

test('same Russian plate with Latin lookalikes and a misspelled FIO blocks duplicate car and preserves all results',async()=>{
 const preexistingOwner='9b596264-15dd-46d8-92aa-c4e1c50c0205';
 const preexistingCar='9b596264-15dd-46d8-92aa-c4e1c50c0206';
 const db=memoryDb({existing:{
  Participant:[{id:preexistingOwner,firstName:'Антон',lastName:'Тестов',middleName:null}],
  Car:[{id:preexistingCar,participantId:preexistingOwner,brand:'Lada',model:'Vesta',
   registrationCountry:'RU',registrationNumber:'А123АА181'}],
 }});
 const candidate=full();
 candidate.events[0].payload.after.firstName='Андрей';
 candidate.events[1].payload.after.registrationCountry='RU';
 candidate.events[1].payload.after.registrationNumber='A123AA181';
 await assert.rejects(()=>applyCompleteVenueJournal(candidate,db,opts),/MANUAL_REVIEW.*DUPLICATE_(CAR_PLATE|PARTICIPANT_BY_PLATE)/);
 assert.equal(db.rows.get('Participant').size,1);
 assert.equal(db.rows.get('Car').size,1);
 assert.equal(db.rows.get('Registration'),undefined);
 assert.equal(db.rows.get('Result'),undefined);
 assert.equal(db.receipt.size,0);
});

const centralPerson='8b596264-15dd-46d8-92aa-c4e1c50c0205';
const centralCar='8b596264-15dd-46d8-92aa-c4e1c50c0206';
const reviewer='8b596264-15dd-46d8-92aa-c4e1c50c0207';
const reviewId='8b596264-15dd-46d8-92aa-c4e1c50c0208';
const approved=decisions=>({
 ...opts,reviewId,approvedBy:reviewer,
 resolutions:Object.fromEntries(Object.entries(decisions).map(([key,value])=>{
  const [table,sourceId]=key.split(':');
  return [key,{...value,key,table,sourceId}];
 })),
});
const personDecision=(action,targetId=null)=>({action,targetId,candidateIds:[centralPerson],reason:'Проверил документы и историю выступлений'});
const carDecision=(action,targetId=null)=>({action,targetId,candidateIds:[centralCar],reason:'Проверил госномер и владельца автомобиля'});

test('admin LINK preserves central profile UUID and links all new registrations and results',async()=>{
 const central={...participant,id:centralPerson,firstName:'  АННА  ',lastName:'Тестовая',middleName:null};
 const db=memoryDb({existing:{Participant:[central]}});
 const approvedOptions=approved({['Participant:'+ids.participant]:personDecision('LINK',centralPerson)});
 const applied=await applyCompleteVenueJournal(full(),db,approvedOptions);
 assert.equal(applied.databaseSynchronized,true);
 assert.equal(db.rows.get('Participant').size,1);
 assert.equal(db.rows.get('Car').get(ids.car).participantId,centralPerson);
 assert.equal(db.rows.get('Registration').get(ids.reg).participantId,centralPerson);
 assert.equal(db.rows.get('Result').get(ids.result).value,'153.200');
 assert.equal(db.receipt.size,10,'all original receipts plus audited link');
 const replay=await applyCompleteVenueJournal(full(),db,approvedOptions);
 assert.equal(replay.alreadyApplied,true);
 assert.equal(db.rows.get('Participant').size,1);
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,approved({['Participant:'+ids.participant]:personDecision('NEW')})),/resolution|decision|CONFLICT/i);
});

test('admin LINK may reuse central matching car only when it belongs to selected participant',async()=>{
 const existingPerson={...participant,id:centralPerson};
 const existingCar={...car,id:centralCar,participantId:centralPerson,registrationCountry:'RU',registrationNumber:'А123АА181'};
 const signed=full();signed.events[1].payload.after.registrationCountry='RU';
 signed.events[1].payload.after.registrationNumber='A123AA181';
 const db=memoryDb({existing:{Participant:[existingPerson],Car:[existingCar]}});
 const decisions={
  ['Participant:'+ids.participant]:personDecision('LINK',centralPerson),
  ['Car:'+ids.car]:carDecision('LINK',centralCar),
 };
 const report=await applyCompleteVenueJournal(signed,db,approved(decisions));
 assert.equal(report.appliedEvents,9);
 assert.equal(db.rows.get('Car').size,1);
 assert.equal(db.rows.get('CarConfiguration').get(ids.config).carId,centralCar);
 assert.equal(db.rows.get('Registration').get(ids.reg).carId,centralCar);
 assert.equal(db.rows.get('Result').get(ids.result).value,'153.200');
 assert.equal((await applyCompleteVenueJournal(signed,db,approved(decisions))).alreadyApplied,true);
});

test('distinct namesakes require explicit NEW with reason and exact candidate set',async()=>{
 const central={...participant,id:centralPerson};
 const db=memoryDb({existing:{Participant:[central]}});
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,opts),/DUPLICATE_PARTICIPANT_NAME/);
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,approved({
  ['Participant:'+ids.participant]:{...personDecision('NEW'),reason:'нет'}
 })),/reason|CONFLICT/i);
 const outcome=await applyCompleteVenueJournal(full(),db,approved({
  ['Participant:'+ids.participant]:personDecision('NEW'),
 }));
 assert.equal(outcome.appliedEvents,9);
 assert.equal(db.rows.get('Participant').size,2);
 assert.equal(db.rows.get('Registration').get(ids.reg).participantId,ids.participant);
 assert.equal(db.receipt.size,10);
});

test('DEFER never mutates a journal and cannot be bypassed by mismatched candidates',async()=>{
 const db=memoryDb({existing:{Participant:[{...participant,id:centralPerson}]}});
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,approved({
  ['Participant:'+ids.participant]:personDecision('DEFER'),
 })),/MANUAL_REVIEW|DEFER/i);
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,approved({
  ['Participant:'+ids.participant]:{...personDecision('LINK',centralPerson),candidateIds:[]},
 })),/candidate|review|CONFLICT/i);
 assert.equal(db.rows.get('Registration'),undefined);
 assert.equal(db.receipt.size,0);
});

test('central disqualification on a linked profile still blocks entire return',async()=>{
 const db=memoryDb({existing:{Participant:[{...participant,id:centralPerson}]}});
 const original=db.transaction;
 db.transaction=(cb,options)=>original(async tx=>{tx.participantEligible=async id=>id!==centralPerson;return cb(tx)},options);
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,approved({
  ['Participant:'+ids.participant]:personDecision('LINK',centralPerson),
 })),/DISQUALIFIED/);
 assert.equal(db.receipt.size,0);
 assert.equal(db.rows.get('Car'),undefined);
});

test('signed offline inspection and result updates win over divergent central values with an audit backup',async()=>{
 const original=full();
 const updatedInspection={...insp,status:'FAILED',notes:'Судья исправил инспекцию'};
 const updatedResult={...result,value:'154.250',notes:'Окончательный замер'};
 const centralInspection={...insp,status:'FAILED',notes:'Предварительное решение онлайн'};
 const centralResult={...result,value:'149.100',notes:'Ввод онлайн'};
 const db=memoryDb({existing:{
  Participant:[participant],Car:[car],CarConfigurationVersion:[version],
  Registration:[reg],RegistrationNumber:[number],RegistrationClass:[cls],
  Inspection:[centralInspection],Result:[centralResult],
 }});
 const events=packet([
  event(1,'Inspection','UPDATE',updatedInspection,insp),
  event(2,'Result','UPDATE',updatedResult,result),
 ]);
 const changes=[];
 const wrap=db.transaction;
 db.transaction=(cb,options)=>wrap(async tx=>{
  tx.linkedIds=async()=>({participants:new Set([ids.participant]),cars:new Set([ids.car]),
   registrations:new Set([ids.reg]),classes:new Set([ids.cls]),
   configurations:new Set([ids.config]),versions:new Set([ids.version])});
  const prior=tx.auditOverride;
  tx.auditOverride=async data=>{changes.push(data);if(prior)await prior(data)};
  return cb(tx);
 },options);
 const report=await applyCompleteVenueJournal(events,db,opts);
 assert.equal(report.appliedEvents,2);
 assert.equal(db.rows.get('Inspection').get(ids.insp).notes,'Судья исправил инспекцию');
 assert.equal(db.rows.get('Result').get(ids.result).value,'154.250');
 assert.equal(changes.length,2);
 assert.deepEqual(changes.map(x=>x.before.notes),['Предварительное решение онлайн','Ввод онлайн']);
 assert.equal((await applyCompleteVenueJournal(events,db,opts)).alreadyApplied,true);
});
test('central registration configuration and legal consents stay intact when offline updates its stage status',async()=>{
 const online={...reg,configurationVersionId:ids.version,
  configurationSnapshot:{amplifiers:['real-online'],configurationPending:false},
  privacyConsentVersion:'privacy-v9',termsVersion:'terms-v9',status:'ACTIVE'};
 const offlineBefore={...reg,configurationSnapshot:{configurationPending:true},
  privacyConsentVersion:null,termsVersion:null,status:'ACTIVE'};
 const offlineAfter={...offlineBefore,status:'CANCELLED'};
 const db=memoryDb({existing:{Participant:[participant],Car:[car],
  Registration:[online]}});
 const changed=packet([event(1,'Registration','UPDATE',offlineAfter,offlineBefore)]);
 await applyCompleteVenueJournal(changed,db,opts);
 const actual=db.rows.get('Registration').get(reg.id);
 assert.equal(actual.status,'CANCELLED');
 assert.deepEqual(actual.configurationSnapshot,online.configurationSnapshot);
 assert.equal(actual.privacyConsentVersion,'privacy-v9');
 assert.equal(actual.termsVersion,'terms-v9');
});
test('no offline changes to participant car or equipment may override their central values',async()=>{
 const central={...car,model:'Vesta Online'};
 const db=memoryDb({existing:{Car:[central]}});
 const change=packet([event(1,'Car','UPDATE',{...car,model:'Vesta Offline'},car)]);
 const baseTransaction=db.transaction;
 db.transaction=(cb,options)=>baseTransaction(async tx=>{
  tx.linkedIds=async()=>({participants:new Set([ids.participant]),cars:new Set([ids.car]),
   registrations:new Set([ids.reg]),classes:new Set(),configurations:new Set(),versions:new Set()});
  return cb(tx);
 },options);
 await assert.rejects(()=>applyCompleteVenueJournal(change,db,opts),/central changed/i);
 assert.equal(db.rows.get('Car').get(ids.car).model,'Vesta Online');
 assert.equal(db.receipt.size,0);
});
test('central-only registration numbers remain guarded when the offline journal uses the same sticker',async()=>{
 const db=memoryDb({existing:{RegistrationNumber:[{id:'c310f672-79f7-44eb-8173-2a8ff94b1c0e',
  stageId:ids.stage,registrationId:'e310f672-79f7-44eb-8173-2a8ff94b1c0e',number:19}]}});
 await assert.rejects(()=>applyCompleteVenueJournal(full(),db,opts),/номер занят/i);
 assert.equal(db.rows.get('Participant'),undefined);
 assert.equal(db.receipt.size,0);
});

test('offline result INSERT replaces a provisional online score with a different UUID and audits the old row',async()=>{
 const provisionalId='a810f672-79f7-44eb-8173-2a8ff94b1c0e';
 const offline=packet([event(1,'Result','INSERT',result)]);
 const db=memoryDb({existing:{Registration:[reg],RegistrationClass:[cls],
  Inspection:[insp],Result:[{...result,id:provisionalId,value:'149.000'}]}});
 const scopeDb=db.transaction;
 db.transaction=(fn,options)=>scopeDb(async tx=>{
  tx.linkedIds=async()=>({participants:new Set([ids.participant]),cars:new Set([ids.car]),
   registrations:new Set([ids.reg]),classes:new Set([ids.cls]),
   configurations:new Set([ids.config]),versions:new Set([ids.version])});
  return fn(tx);
 },options);
 const report=await applyCompleteVenueJournal(offline,db,opts);
 assert.equal(report.appliedEvents,1);
 assert.equal(db.rows.get('Result').size,1);
 assert.equal(db.rows.get('Result').get(ids.result).value,'153.200');
 assert.equal(db.rows.get('Result').has(provisionalId),false);
 assert.equal(db.overrides.length,1);
 assert.equal(db.overrides[0].reason,'OFFLINE_STAGE_SLOT_REPLACED');
 assert.equal(db.overrides[0].before.value,'149.000');
 assert.equal((await applyCompleteVenueJournal(offline,db,opts)).alreadyApplied,true);
});
test('signed deletion overrides a centrally edited result and replays without resurrecting the old result',async()=>{
 const offline=packet([event(1,'Result','DELETE',result,result)]);
 const db=memoryDb({existing:{Registration:[reg],RegistrationClass:[cls],
  Result:[{...result,value:'143.000'}]}});
 const scopeDb=db.transaction;
 db.transaction=(fn,options)=>scopeDb(async tx=>{
  tx.linkedIds=async()=>({participants:new Set([ids.participant]),cars:new Set([ids.car]),
   registrations:new Set([ids.reg]),classes:new Set([ids.cls]),
   configurations:new Set([ids.config]),versions:new Set([ids.version])});
  return fn(tx);
 },options);
 assert.equal((await applyCompleteVenueJournal(offline,db,opts)).appliedEvents,1);
 assert.equal(db.rows.get('Result').has(ids.result),false);
 assert.equal(db.overrides.length,1);
 assert.equal(db.overrides[0].before.value,'143.000');
 assert.equal((await applyCompleteVenueJournal(offline,db,opts)).alreadyApplied,true);
});
test('dry-run reports overridden stage result without changing the online row or writing audit',async()=>{
 const offline=packet([event(1,'Result','UPDATE',{...result,value:'155.000'},result)]);
 const db=memoryDb({existing:{Registration:[reg],RegistrationClass:[cls],
  Result:[{...result,value:'141.000'}]}});
 const scopeDb=db.transaction;
 db.transaction=(fn,options)=>scopeDb(async tx=>{
  tx.linkedIds=async()=>({participants:new Set([ids.participant]),cars:new Set([ids.car]),
   registrations:new Set([ids.reg]),classes:new Set([ids.cls]),
   configurations:new Set([ids.config]),versions:new Set([ids.version])});
  return fn(tx);
 },options);
 const preview=await applyCompleteVenueJournal(offline,db,{...opts,apply:false});
 assert.equal(preview.readyEvents,1);
 assert.equal(db.rows.get('Result').get(ids.result).value,'141.000');
 assert.equal(db.overrides.length,0);
 assert.equal(db.receipt.size,0);
});

test('offline UPDATE restores a centrally deleted result even if another online UUID occupies the class',async()=>{
 const differentId='a810f672-79f7-44eb-8173-2a8ff94b1c0e';
 const offline=packet([event(1,'Result','UPDATE',{...result,value:'156.000'},result)]);
 const db=memoryDb({existing:{Registration:[reg],RegistrationClass:[cls],
  Inspection:[insp],Result:[{...result,id:differentId,value:'145.000'}]}});
 const base=db.transaction;
 db.transaction=(callback,options)=>base(async tx=>{
  tx.linkedIds=async()=>({participants:new Set([ids.participant]),cars:new Set([ids.car]),
   registrations:new Set([ids.reg]),classes:new Set([ids.cls]),
   configurations:new Set([ids.config]),versions:new Set([ids.version])});
  return callback(tx);
 },options);
 const applied=await applyCompleteVenueJournal(offline,db,opts);
 assert.equal(applied.appliedEvents,1);
 assert.equal(db.rows.get('Result').size,1);
 assert.equal(db.rows.get('Result').get(ids.result).value,'156.000');
 assert.equal(db.rows.get('Result').has(differentId),false);
 assert.equal(db.overrides[0].reason,'OFFLINE_STAGE_SLOT_REPLACED');
 assert.equal((await applyCompleteVenueJournal(offline,db,opts)).alreadyApplied,true);
});
