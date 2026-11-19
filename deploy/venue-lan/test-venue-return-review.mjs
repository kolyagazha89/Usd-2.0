import test from 'node:test';
import assert from 'node:assert/strict';
import {collectVenueReturnConflicts,validateVenueReviewDecisions,venueResolutionHash} from '../../backend/scripts/venue-sync/venue-return-review.mjs';
const person='e510f672-79f7-44eb-8173-2a8ff94b1c0e',car='b610f672-79f7-44eb-8173-2a8ff94b1c0e';
const existing='8b596264-15dd-46d8-92aa-c4e1c50c0205';
const snap={stageId:'c510f672-79f7-44eb-8173-2a8ff94b1c0e',journalEndHash:'a'.repeat(64),events:[
 {payload:{table:'Participant',operation:'INSERT',recordId:person,after:{id:person,firstName:'  Алёна ',lastName:' ИВАНЁВА',middleName:null}}},
 {payload:{table:'Car',operation:'INSERT',recordId:car,after:{id:car,participantId:person,registrationCountry:'RU',registrationNumber:'A123BC181',brand:'Lada',model:'Vesta'}}},
]};
test('signed return discovers all current central FIO and plate candidates',()=>{
 const rows=collectVenueReturnConflicts(snap,{participants:[{id:existing,firstName:'алена',lastName:'иванева',middleName:'Ивановна'}],
 cars:[{id:existing,participantId:person,registrationCountry:'RU',registrationNumber:'А123ВС181',brand:'Lada',model:'Vesta'}]});
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(x=>x.key),['Car:'+car,'Participant:'+person]);
 assert.equal(rows[1].candidates[0].id,existing);
 assert.equal(rows[0].candidates[0].id,existing);
});
test('ADMIN must explicitly explain LINK, NEW or DEFER and cannot select a forged profile',()=>{
 const [c]=collectVenueReturnConflicts({...snap,events:snap.events.slice(0,1)},{
  participants:[{id:existing,firstName:'Алёна',lastName:'Иванёва'}]});
 assert.throws(()=>validateVenueReviewDecisions([c],[{key:c.key,action:'LINK',targetId:person,reason:'Проверил исходный профиль'}]),/target/);
 const linked=validateVenueReviewDecisions([c],[{key:c.key,action:'LINK',targetId:existing,reason:'Проверил заявку и историю'}]);
 assert.equal(linked[0].candidateIds[0],existing);
 assert.match(venueResolutionHash(linked),/^[a-f0-9]{64}$/);
 assert.throws(()=>validateVenueReviewDecisions([c],[{key:c.key,action:'NEW',reason:'нет'}]),/distinct/);
 assert.equal(validateVenueReviewDecisions([c],[{key:c.key,action:'DEFER',reason:''}])[0].action,'DEFER');
});
test('review refuses unsigned-looking IDs, duplicate local identities and omitted decisions',()=>{
 assert.throws(()=>collectVenueReturnConflicts({...snap,stageId:'incorrect'},{}),/UNTRUSTED/);
 const duplicate={...snap,events:[snap.events[0],{payload:{...snap.events[0].payload,recordId:car,after:{...snap.events[0].payload.after,id:car}}}]};
 assert.throws(()=>collectVenueReturnConflicts(duplicate,{}),/duplicate identities/);
 const conflicts=collectVenueReturnConflicts(snap,{participants:[{id:existing,firstName:'Алёна',lastName:'Иванёва'}]});
 assert.throws(()=>validateVenueReviewDecisions(conflicts,[]),/all conflicts/);
});

test('wrong offline FIO still offers the central owner via matching car plate',()=>{
 const changed=structuredClone(snap);
 changed.events[0].payload.after.firstName='Ошибочное';
 const rows=collectVenueReturnConflicts(changed,{
  participants:[{id:existing,firstName:'Алёна',lastName:'Иванёва'}],
  cars:[{id:existing,participantId:existing,registrationCountry:'RU',registrationNumber:'А123ВС181',brand:'Lada',model:'Vesta'}],
 });
 const participantCase=rows.find(x=>x.table==='Participant');
 assert.equal(participantCase.candidates[0].id,existing);
});
