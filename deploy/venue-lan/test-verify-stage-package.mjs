import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {verifyVenueStageHandoff} from './verify-stage-package.mjs';
const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const {publicKey:wrongPublic}=generateKeyPairSync('ed25519');
const pem=publicKey.export({type:'spki',format:'pem'}).toString();
const now=Date.parse('2026-11-04T04:00:00Z');
const sid='c510f672-79f7-44eb-8173-2a8ff94b1c0e';
const classId='dfe5a37d-4d3c-40d8-a7b4-70b509012346';
const reg='cf0328c0-609c-4503-b92b-3c058d72372a';
const no='7f163be4-541f-4f94-a7e0-b5de8b3a6b4e';
const classRow='5a4b83a1-51f5-4c2f-81c7-a01b78bcb51f';
const base={
 format:1,purpose:'USD_VENUE_STAGE_READONLY',stageId:sid,
 generatedAt:new Date(now).toISOString(),expiresAt:new Date(now+72*60*60*1000).toISOString(),
 stage:{id:sid,seasonId:'season',stageNumber:2,name:'USD полевые тесты',city:'Омск',
  date:'2026-11-09',venue:null,address:null,status:'PUBLISHED',registrationOpen:true,
  registrationStartsAt:null,registrationEndsAt:null,resultsPublishedAt:null,
  rulesSnapshot:{version:'1'},season:{year:2026},
  stageClasses:[{id:'sc1',stageId:sid,classId,sortOrder:0,isActive:true,
   participantLimit:null,customName:null,description:null,settings:null,class:{id:classId,name:'SPL'}}]},
 registrations:[{id:reg,stageId:sid,participantId:'p1',carId:'car1',configurationVersionId:'cv1',
  configurationSnapshot:{state:'DRAFT'},participantNumber:6,source:'ON_SITE',status:'ACTIVE',
  registeredAt:'2026-11-04',teamIdAtInspection:null,teamNameAtInspection:null,
  participant:{id:'p1',firstName:'Иван',lastName:'Иванов',middleName:null,city:'Омск',team:null},
  car:{id:'car1',participantId:'p1',brand:'Lada',model:'Vesta',registrationCountry:'RU',
   registrationNumber:'А123ВС55',color:null},
  numbers:[{id:no,number:6,isPrimary:true}],
  classes:[{id:classRow,classId,numberId:no,class:{id:classId},inspection:null}],
  inspection:null,stageInspection:null,results:[{id:'r1',registrationClassId:classRow,
   value:'145.123',unit:'DB',place:1,isBest:true,verificationStatus:'NOT_REQUIRED'}]}],
};
const pack=snapshot=>{
 const bytes=Buffer.from(JSON.stringify(snapshot));
 const digest=b=>createHash('sha256').update(b).digest('hex');
 return {snapshot,integrity:{algorithm:'Ed25519',sha256:digest(bytes),
  publicKeyFingerprint:digest(publicKey.export({type:'spki',format:'der'})),
  signature:sign(null,bytes,privateKey).toString('base64url')}};
};
test('signed stage roster passes and returns only nonsecret summary',()=>{
 const result=verifyVenueStageHandoff(pack(base),pem,now);
 assert.equal(result.registrations,1);assert.equal(result.classes,1);
 assert.ok(!JSON.stringify(result).includes('Иванов'));
});
test('wrong trust key, tamper, expiry, clock skew are blocked',()=>{
 assert.throws(()=>verifyVenueStageHandoff(pack(base),wrongPublic.export({type:'spki',format:'pem'}).toString(),now),/подпись/);
 const altered=JSON.parse(JSON.stringify(pack(base)));
 altered.snapshot.registrations[0].car.registrationNumber='А999ВС55';
 assert.throws(()=>verifyVenueStageHandoff(altered,pem,now),/Контрольная/);
 assert.throws(()=>verifyVenueStageHandoff(pack(base),pem,now+72*60*60*1000+1),/просрочен/);
 assert.throws(()=>verifyVenueStageHandoff(pack(base),pem,now-6*60*1000),/время ноутбука/);
});
test('valid signature alone does not permit cross-stage numbers, classes or secret fields',()=>{
 const unsafe=structuredClone(base);
 unsafe.registrations[0].stageId='another';
 assert.throws(()=>verifyVenueStageHandoff(pack(unsafe),pem,now),/регистрация/);
 const wrongNumber=structuredClone(base);wrongNumber.registrations[0].classes[0].numberId='stranger';
 assert.throws(()=>verifyVenueStageHandoff(pack(wrongNumber),pem,now),/Класс или номер/);
 const secret=structuredClone(base);secret.registrations[0].participant.phone='+79999999999';
 assert.throws(()=>verifyVenueStageHandoff(pack(secret),pem,now),/Лишние\/личные поля/);
 const duplicate=structuredClone(base);duplicate.registrations.push(structuredClone(duplicate.registrations[0]));
 assert.throws(()=>verifyVenueStageHandoff(pack(duplicate),pem,now),/регистрация/);
});
test('signed privacy flags are allowed but malformed flags are rejected',()=>{
 const publicData=structuredClone(base);
 publicData.registrations[0].participant.isPublic=false;
 publicData.registrations[0].car.isPublic=false;
 publicData.registrations[0].car.isActive=false;
 assert.doesNotThrow(()=>verifyVenueStageHandoff(pack(publicData),pem,now));
 const invalid=structuredClone(publicData);
 invalid.registrations[0].participant.isPublic='false';
 assert.throws(()=>verifyVenueStageHandoff(pack(invalid),pem,now),/приватность/);
});
test('a signed, minimal approved venue policy is accepted; injected private fields rejected',()=>{
 const approved=structuredClone(base);
 approved.venuePolicy={legal:{legalApproved:true,legalVersion:'1',ipName:'USD',
  privacyText:'public privacy',consentText:'public consent',termsText:'public terms'},
  contactEmail:'contact@example.org',
  rulesPublished:{id:'rules-1',blocks:[{type:'paragraph',text:'public text'}]}};
 assert.doesNotThrow(()=>verifyVenueStageHandoff(pack(approved),pem,now));
 approved.venuePolicy.smtpPassword='secret';
 assert.throws(()=>verifyVenueStageHandoff(pack(approved),pem,now),/Лишние|личные/);
});
test('a signed result cannot be attached to a class outside the registration',()=>{
 const snapshot=structuredClone(base);
 snapshot.registrations[0].results[0].registrationClassId='not-here';
 assert.throws(()=>verifyVenueStageHandoff(pack(snapshot),pem,now),/чужому классу/);
});
