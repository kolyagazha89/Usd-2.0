import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {
 makeVenueReturnSnapshot,signVenueReturnSnapshot,
 encryptVenueReturn,openVenueReturn,
} from './venue-return-package.mjs';

const stage='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const baseline='a'.repeat(64);
const now=Date.parse('2026-11-12T04:00:00.000Z');
const passphrase='Venue-USB!Strong#2026';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const publicPem=publicKey.export({type:'spki',format:'pem'}).toString();
const privatePem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
const fingerprint=createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex');
// Static fingerprint is rebuilt in assertions independently.

const event={
 sequence:1,previousHash:'0'.repeat(64),hash:'f'.repeat(64),
 payload:{
  sequence:1,stageId:stage,table:'Result',recordId:'b610f672-79f7-44eb-8173-2a8ff94b1c0e',
  operation:'INSERT',before:null,
  after:{id:'b610f672-79f7-44eb-8173-2a8ff94b1c0e',value:'152.345',notes:'private note',unit:'DB'},
  recordedAt:new Date(now-2000).toISOString(),
 },
};
const snapshot=(events=[event])=>makeVenueReturnSnapshot({
 stageId:stage,baselineSha256:baseline,events,generatedAt:new Date(now).toISOString(),
});
function envelope(){
 const signed=signVenueReturnSnapshot(snapshot(),privatePem);
 return encryptVenueReturn(signed,passphrase);
}
const expected={stageId:stage,baselineSha256:baseline,trustedFingerprint:fingerprint,now};

test('returns a sealed encrypted package without participant data, scores or stage UUID in plaintext',()=>{
 const sealed=envelope();
 assert.equal(sealed.purpose,'USD_VENUE_RETURN_ENCRYPTED');
 assert.equal(sealed.encryption.algorithm,'AES-256-GCM');
 const visible=JSON.stringify(sealed);
 for(const privateText of ['private note','152.345',stage,baseline,'Result']){
  assert.ok(!visible.includes(privateText));
 }
 const verified=openVenueReturn(sealed,passphrase,publicPem,expected);
 assert.deepEqual(verified.events,[event]);
 assert.equal(verified.eventCount,1);
 assert.equal(verified.journalEndHash,'f'.repeat(64));
});
test('wrong password, ciphertext tampering, wrong trusted key, wrong stage and baseline are refused',()=>{
 const sealed=envelope();
 assert.throws(()=>openVenueReturn(sealed,'Wrong-Passphrase#2026',publicPem,expected));
 const char=sealed.ciphertext[15]==='A'?'B':'A';
 assert.throws(()=>openVenueReturn({
  ...sealed,ciphertext:sealed.ciphertext.slice(0,15)+char+sealed.ciphertext.slice(16),
 },passphrase,publicPem,expected));
 const other=generateKeyPairSync('ed25519');
 assert.throws(()=>openVenueReturn(sealed,passphrase,other.publicKey.export({type:'spki',format:'pem'}).toString(),expected));
 assert.throws(()=>openVenueReturn(sealed,passphrase,publicPem,{...expected,stageId:'dfe5a37d-4d3c-40d8-a7b4-70b509012346'}));
 assert.throws(()=>openVenueReturn(sealed,passphrase,publicPem,{...expected,baselineSha256:'b'.repeat(64)}));
 assert.throws(()=>openVenueReturn(sealed,passphrase,publicPem,{...expected,trustedFingerprint:'c'.repeat(64)}));
});
test('the envelope and signed data refuse unintended extra fields, truncation and expiry',()=>{
 const sealed=envelope();
 assert.throws(()=>openVenueReturn({...sealed,participant:'ALICE'},passphrase,publicPem,expected));
 assert.throws(()=>openVenueReturn(sealed,passphrase,publicPem,{...expected,now:now+92*24*60*60*1000}),/expired|срок/i);
 assert.throws(()=>makeVenueReturnSnapshot({
  stageId:stage,baselineSha256:baseline,events:[event],generatedAt:'not-a-date',
 }));
});
test('cross-stage, account credentials, broken sequence/chain and malformed records are rejected',()=>{
 const badStage=structuredClone(event);badStage.payload.stageId='dfe5a37d-4d3c-40d8-a7b4-70b509012346';
 assert.throws(()=>snapshot([badStage]),/этап|stage/i);
 const badTable=structuredClone(event);badTable.payload.table='User';
 assert.throws(()=>snapshot([badTable]),/таблиц|table|запрещ/i);
 const secret=structuredClone(event);secret.payload.extra='passwordHash';
 assert.throws(()=>snapshot([secret]),/полей|field/i);
 const badBefore=structuredClone(event);badBefore.payload.before={id:'other'};
 assert.throws(()=>snapshot([badBefore]),/INSERT|операц/i);
 const second=structuredClone(event);second.sequence=2;
 second.payload.sequence=2;second.previousHash='a'.repeat(64);
 assert.throws(()=>snapshot([event,second]),/цепочк|hash|предыдущ/i);
});
test('first empty journal is supported, but cannot have a fabricated non-genesis hash',()=>{
 const s=snapshot([]);
 assert.equal(s.eventCount,0);
 assert.equal(s.journalEndHash,'0'.repeat(64));
 const sealed=encryptVenueReturn(signVenueReturnSnapshot(s,privatePem),passphrase);
 assert.equal(openVenueReturn(sealed,passphrase,publicPem,expected).events.length,0);
});

test('full-return package carries audited link coverage; legacy v1 cannot claim full synchronization',()=>{
 const coverage={fromSequence:0,tables:[
  'CarAmplifierComponent','CarAudioComponent','CarAmplifier','CarBattery','CarConfiguration',
  'CarConfigurationVersion','CarGenerator','CarHeadUnit','Car','Disqualification',
  'Inspection','Participant','ParticipantStageInspection','RegistrationClassInspection',
  'RegistrationClass','RegistrationNumber','Registration','Result','Stage',
 ].sort()};
 const v2=makeVenueReturnSnapshot({
  stageId:stage,baselineSha256:baseline,events:[],
  generatedAt:new Date(now).toISOString(),journalCoverage:coverage,
 });
 assert.equal(v2.format,2);
 const encrypted=encryptVenueReturn(signVenueReturnSnapshot(v2,privatePem),passphrase);
 const opened=openVenueReturn(encrypted,passphrase,publicPem,expected);
 assert.deepEqual(opened.journalCoverage,coverage);
 assert.throws(()=>makeVenueReturnSnapshot({
  stageId:stage,baselineSha256:baseline,events:[],
  generatedAt:new Date(now).toISOString(),journalCoverage:{...coverage,fromSequence:7},
 }),/cover|покры|журнал/i);
 assert.equal(snapshot([]).format,1);
});
