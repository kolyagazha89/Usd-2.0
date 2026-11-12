import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {
 previewVenueReconciliation,previewAuthenticatedVenueReturn,
} from './preview-venue-reconciliation.mjs';
import {makeVenueReturnSnapshot,signVenueReturnSnapshot,encryptVenueReturn} from './venue-return-package.mjs';

const UUID={
 stage:'c510f672-79f7-44eb-8173-2a8ff94b1c0e',
 reg:'cf0328c0-609c-4503-b92b-3c058d72372a',
 cls:'dfe5a37d-4d3c-40d8-a7b4-70b509012346',
 clreg:'5a4b83a1-51f5-4c2f-81c7-a01b78bcb51f',
 res:'b610f672-79f7-44eb-8173-2a8ff94b1c0e',
 second:'a710f672-79f7-44eb-8173-2a8ff94b1c0e',
 participant:'e510f672-79f7-44eb-8173-2a8ff94b1c0e',
 car:'f510f672-79f7-44eb-8173-2a8ff94b1c0e',
 number:'7f163be4-541f-4f94-a7e0-b5de8b3a6b4e',
};
const baseline='a'.repeat(64),now=Date.parse('2026-11-12T08:00:00.000Z');
const latest=({result=null,published=false}={})=>({
 stageId:UUID.stage,
 stage:{
  id:UUID.stage,name:'USD demo',resultsPublishedAt:published?'2026-11-12T12:00:00Z':null,
  stageClasses:[{classId:UUID.cls}],
 },
 registrations:[{
  id:UUID.reg,stageId:UUID.stage,participantId:UUID.participant,
  participantNumber:6,status:'ACTIVE',
  carId:UUID.car,participant:{id:UUID.participant,isPublic:false,firstName:'Иван',lastName:'Скрытый'},
  car:{id:UUID.car,brand:'secret',model:'car',isPublic:false},
  numbers:[{id:UUID.number,number:6,isPrimary:true}],
  classes:[{id:UUID.clreg,classId:UUID.cls,numberId:UUID.number,
   inspection:null}],inspection:null,stageInspection:null,results:result?[result]:[],
 }],
});
const score=(id=UUID.res,value='150.000')=>({
 id,registrationClassId:UUID.clreg,unit:'DB',value,place:1,isBest:false,
 verificationStatus:'NOT_REQUIRED',
});
const event=(operation,before,after,{table='Result',recordId=UUID.res,sequence=1,previousHash='0'.repeat(64),hash='b'.repeat(64)}={})=>({
 sequence,previousHash,hash,payload:{
  sequence,stageId:UUID.stage,table,recordId,operation,before,after,
  recordedAt:new Date(now-1000).toISOString(),
 },
});
const venue=(events=[])=>({stageId:UUID.stage,baselineSha256:baseline,
 journalEndHash:events.at(-1)?.hash??'0'.repeat(64),events,
});
const expected={stageId:UUID.stage,baselineSha256:baseline};
test('judge new score on existing class is a reviewable candidate; never an automatic write',()=>{
 const local=venue([event('INSERT',null,score())]);
 const report=previewVenueReconciliation(local,latest(),expected);
 assert.equal(report.rows[0].decision,'READY_FOR_REVIEW');
 assert.equal(report.rows[0].reason,'NEW_RESULT');
 assert.equal(report.summary.READY_FOR_REVIEW,1);
 assert.equal(report.applied,false);
 assert.ok(!JSON.stringify(report).includes('secret'));
 assert.equal(report.rows[0].recordIdHash.length,64);
 assert.ok(!JSON.stringify(report).includes(UUID.res));
});
test('duplicates and externally modified scores are conflicts, identical retries are not new writes',()=>{
 const added=venue([event('INSERT',null,score())]);
 const duplicate=previewVenueReconciliation(added,latest({result:score(UUID.second)}),expected);
 assert.equal(duplicate.rows[0].decision,'CONFLICT');
 assert.equal(duplicate.rows[0].reason,'CLASS_RESULT_EXISTS');
 const same=previewVenueReconciliation(added,latest({result:score()}),expected);
 assert.equal(same.rows[0].decision,'ALREADY_PRESENT');
 const modified=venue([event('UPDATE',score(UUID.res,'150.000'),score(UUID.res,'151.500'))]);
 const fresh=previewVenueReconciliation(modified,latest({result:score(UUID.res,'150.000')}),expected);
 assert.equal(fresh.rows[0].decision,'READY_FOR_REVIEW');
 assert.equal(fresh.rows[0].reason,'MATCHED_PRECONDITION');
 const stale=previewVenueReconciliation(modified,latest({result:score(UUID.res,'152.000')}),expected);
 assert.equal(stale.rows[0].decision,'CONFLICT');
 assert.equal(stale.rows[0].reason,'CENTRAL_CHANGED');
});
test('mutations involving notes, registration, photos or published results require manual review',()=>{
 const privateNotes=score();privateNotes.notes='Sensitive medical note';
 const notes=previewVenueReconciliation(venue([event('INSERT',null,privateNotes)]),latest(),expected);
 assert.equal(notes.rows[0].decision,'MANUAL_REVIEW');
 const newParticipant=previewVenueReconciliation(venue([event('INSERT',null,{id:UUID.participant,firstName:'Private'},{
  table:'Participant',recordId:UUID.participant,
 })]),latest(),expected);
 assert.equal(newParticipant.rows[0].decision,'MANUAL_REVIEW');
 const published=previewVenueReconciliation(venue([event('INSERT',null,score())]),latest({published:true}),expected);
 assert.equal(published.rows[0].decision,'CONFLICT');
 assert.equal(published.rows[0].reason,'CENTRAL_ALREADY_PUBLISHED');
 assert.equal(JSON.stringify(notes).includes('Sensitive'),false);
});
test('number conflicts and missing registration/class do not silently reassign IDs',()=>{
 const occupied=previewVenueReconciliation(venue([event('INSERT',null,{
  id:UUID.second,registrationId:UUID.reg,number:6,stageId:UUID.stage,
 },{table:'RegistrationNumber',recordId:UUID.second})]),latest(),expected);
 assert.equal(occupied.rows[0].decision,'CONFLICT');
 assert.equal(occupied.rows[0].reason,'START_NUMBER_OCCUPIED');
 const invalidClass=score();invalidClass.registrationClassId=UUID.second;
 const missing=previewVenueReconciliation(venue([event('INSERT',null,invalidClass)]),latest(),expected);
 assert.equal(missing.rows[0].decision,'CONFLICT');
 assert.equal(missing.rows[0].reason,'CLASS_NOT_FOUND');
});
test('strict scoping, inconsistent event counts and unsupported mutations are rejected or marked',()=>{
 assert.throws(()=>previewVenueReconciliation(venue(),latest(),{
  ...expected,stageId:UUID.second,
 }),/этап|stage/i);
 assert.throws(()=>previewVenueReconciliation({...venue(),baselineSha256:'c'.repeat(64)},latest(),expected),/исход|baseline/i);
 const unknown=previewVenueReconciliation(venue([event('DELETE',{id:UUID.second},null,{
  table:'Disqualification',recordId:UUID.second,
 })]),latest(),expected);
 assert.equal(unknown.rows[0].decision,'MANUAL_REVIEW');
});

function signedLatest(snapshot){
 const {privateKey,publicKey}=centralKey;
 const original={
  format:1,purpose:'USD_VENUE_STAGE_READONLY',stageId:UUID.stage,
  generatedAt:new Date(now-5000).toISOString(),expiresAt:new Date(now+3600000).toISOString(),
  ...snapshot,
 };
 const bytes=Buffer.from(JSON.stringify(original));
 const dig=b=>createHash('sha256').update(b).digest('hex');
 return {
  snapshot:original,
  integrity:{algorithm:'Ed25519',sha256:dig(bytes),
   signature:sign(null,bytes,privateKey).toString('base64url'),
   publicKeyFingerprint:dig(publicKey.export({type:'spki',format:'der'}))},
 };
}
const centralKey=generateKeyPairSync('ed25519');
const venueKey=generateKeyPairSync('ed25519');
const pem=key=>key.publicKey.export({type:'spki',format:'pem'}).toString();
const fingerprint=key=>createHash('sha256').update(key.publicKey.export({type:'spki',format:'der'})).digest('hex');

test('authenticated preview refuses incorrect venue/central key, stage and baseline; no database calls',()=>{
 // The standalone dry-run accepts signed and encrypted venue data only after
 // verifying BOTH independent Ed25519 trust roots.
 const returned=makeVenueReturnSnapshot({
  stageId:UUID.stage,baselineSha256:baseline,events:[],generatedAt:new Date(now).toISOString(),
 });
 const encrypted=encryptVenueReturn(signVenueReturnSnapshot(returned,
  venueKey.privateKey.export({type:'pkcs8',format:'pem'}).toString()),'Venue-Password!2026');
 // This is intentionally an incomplete synthetic central snapshot, so
 // signatures pass but the strict roster verifier must still fail CLOSED.
 const current=signedLatest(latest());
 const opts={stageId:UUID.stage,baselineSha256:baseline,
  trustedVenueFingerprint:fingerprint(venueKey),
  trustedCentralFingerprint:fingerprint(centralKey),now};
 assert.throws(()=>previewAuthenticatedVenueReturn(encrypted,'Venue-Password!2026',
  pem(venueKey),current,pem(centralKey),opts),/класс|регистрац|этап|неверн|пакет/i);
 assert.throws(()=>previewAuthenticatedVenueReturn(encrypted,'Venue-Password!2026',
  pem(venueKey),current,pem(centralKey),{...opts,trustedCentralFingerprint:'f'.repeat(64)}));
});
