#!/usr/bin/env node
/** Safe, temporary USD VENUE DEMO data generator. Nothing from the central
 * database is accessed. It creates a synthetic one-stage signed packet and
 * exports ONLY its public trust key. The ephemeral private signing key is
 * never written to disk. The DEMO must never be reconciled to production.
 */
import {createHash,generateKeyPairSync,randomUUID,sign} from 'node:crypto';
import {mkdir,writeFile,chmod} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyVenueStageHandoff} from './verify-stage-package.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const DATE_MS=72*60*60*1000;

export function createVenueDemo(now=new Date()){
 if(!(now instanceof Date)||!Number.isFinite(now.getTime()))
  throw new Error('Некорректное время ноутбука');
 const stageId=randomUUID(),seasonId=randomUUID(),participantId=randomUUID();
 const carId=randomUUID(),registrationId=randomUUID();
 const versionId=randomUUID(),numberId=randomUUID();
 const directions=['SPL','BFSPL','BassRace','BDW SPL','Storm Wall'].map((name,sortOrder)=>({
  id:randomUUID(),name,sortOrder,isActive:true,
 }));
 const names=['Limited 2.0','Gate 1','BassRace 139.9','BDW SPL','Storm Wall'];
 const classes=directions.map((direction,sortOrder)=>({
  id:randomUUID(),code:'VENUE_DEMO_'+(sortOrder+1),name:names[sortOrder],
  unit:'DB',sortOrder,isActive:true,direction,
 }));
 const stageClasses=classes.map(cl=>({
  id:randomUUID(),stageId,classId:cl.id,sortOrder:cl.sortOrder,isActive:true,
  participantLimit:null,customName:null,description:null,settings:null,class:cl,
 }));
 const registrationClasses=classes.slice(0,2).map(cl=>({
  id:randomUUID(),classId:cl.id,numberId,
  class:{id:cl.id,code:cl.code,name:cl.name,directionId:cl.direction.id},
  inspection:null,
 }));
 const legal={
  legalApproved:true,legalVersion:'DEMO-1',
  ipName:'USD — ТОЛЬКО ТЕСТ',
  operatorAddress:'ДЕМО, НЕ НАСТОЯЩИЙ АДРЕС',
  personalDataEmail:'privacy@demo.invalid',
  privacyText:'ДЕМО: не вводите настоящие персональные данные.',
  consentText:'ДЕМО: проверка работы интерфейса без реальных участников.',
  termsText:'ДЕМО: эти условия не предназначены для настоящего этапа.',
 };
 const snapshot={
  format:1,purpose:'USD_VENUE_STAGE_READONLY',stageId,
  generatedAt:now.toISOString(),expiresAt:new Date(now.getTime()+DATE_MS).toISOString(),
  stage:{
   id:stageId,seasonId,stageNumber:1,name:'USD ДЕМО · НЕ ДЛЯ ОФИЦИАЛЬНЫХ ПРОТОКОЛОВ',
   city:'ТЕСТОВАЯ ПЛОЩАДКА',date:now.toISOString(),
   venue:'Тестовый Wi-Fi',address:null,status:'PUBLISHED',
   registrationOpen:true,registrationStartsAt:null,registrationEndsAt:null,
   resultsPublishedAt:null,rulesSnapshot:{demo:true,revisionId:'DEMO-1'},
   season:{id:seasonId,name:'USD ДЕМО',year:now.getUTCFullYear(),status:'ACTIVE'},
   stageClasses,
  },
  venuePolicy:{
   legal,contactEmail:'organizer@demo.invalid',
   rulesPublished:{id:'DEMO-1',blocks:[{type:'paragraph',text:'ДЕМО: только вымышленные данные. Нельзя использовать для официальных результатов.'}]},
  },
  registrations:[{
   id:registrationId,stageId,participantId,carId,
   configurationVersionId:versionId,configurationSnapshot:{configurationPending:true},
   participantNumber:1,source:'ON_SITE',status:'ACTIVE',
   registeredAt:now.toISOString(),teamIdAtInspection:null,teamNameAtInspection:null,
   participant:{
    id:participantId,firstName:'Тестовый',lastName:'Участник',middleName:null,
    city:'Демо',team:null,isPublic:true,
   },
   car:{
    id:carId,participantId,brand:'Lada',model:'Vesta',
    registrationCountry:'RU',registrationNumber:'А123ВС77',
    color:null,isPublic:true,isActive:true,
   },
   numbers:[{id:numberId,number:1,isPrimary:true}],
   classes:registrationClasses,
   inspection:{id:randomUUID(),status:'PASSED',checkedAt:now.toISOString(),notes:null},
   stageInspection:null,
   results:[{
    id:randomUUID(),registrationClassId:registrationClasses[1].id,
    value:'140.000',unit:'DB',place:1,isBest:false,verificationStatus:'NOT_REQUIRED',
   }],
  }],
 };
 const {privateKey,publicKey}=generateKeyPairSync('ed25519');
 const publicPem=publicKey.export({type:'spki',format:'pem'}).toString();
 const fingerprint=sha(publicKey.export({type:'spki',format:'der'}));
 const data=Buffer.from(JSON.stringify(snapshot));
 const signed={
  snapshot,integrity:{
   algorithm:'Ed25519',sha256:sha(data),publicKeyFingerprint:fingerprint,
   signature:sign(null,data,privateKey).toString('base64url'),
  },
 };
 verifyVenueStageHandoff(signed,publicPem,now.getTime());
 return {signed,publicPem,stageId,fingerprint};
}

/** Refuse existing output directory to prevent accidentally mixing two
 * separate test stages and their independent trusted signing fingerprints.
 */
export async function writeVenueDemo(directory,now=new Date()){
 if(typeof directory!=='string'||!directory.trim()||directory==='/'||directory==='.')
  throw new Error('Укажите новую папку для демонстрационного этапа');
 const prepared=createVenueDemo(now);
 await mkdir(directory,{mode:0o700});
 try{
  const files=[
   ['usd-venue-demo-stage.json',JSON.stringify(prepared.signed)+'\n'],
   ['signing-public.pem',prepared.publicPem],
   ['demo-info.txt',[
    'USD VENUE DEMO — NOT FOR REAL PARTICIPANTS',
    'VENUE_STAGE_ID='+prepared.stageId,
    'VENUE_SIGNING_KEY_FINGERPRINT='+prepared.fingerprint,
    'PACKAGE=usd-venue-demo-stage.json',
    'PUBLIC_KEY=signing-public.pem',
    'Use a dedicated EMPTY usd-venue DB/volume. Never return this demo to Ubuntu.',
    '',
   ].join('\n')],
  ];
  for(const [name,data] of files)
   await writeFile(resolve(directory,name),data,{flag:'wx',mode:0o600});
  await chmod(directory,0o700);
  return {stageId:prepared.stageId,fingerprint:prepared.fingerprint,directory:resolve(directory)};
 }catch(error){
  // Keep partial files visible rather than destroying a directory we did not
  // create with confidence; the operator can discard the unused demo safely.
  throw error;
 }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [directory,...extra]=process.argv.slice(2);
 if(!directory||extra.length){
  console.error('Usage: node make-demo-stage.mjs NEW_DIRECTORY');
  process.exitCode=2;
 }else{
  try{
   const info=await writeVenueDemo(directory);
   console.log('USD VENUE DEMO SIGNED — SYNTHETIC DATA ONLY');
   console.log('Directory: '+info.directory);
   console.log('VENUE_STAGE_ID='+info.stageId);
   console.log('VENUE_SIGNING_KEY_FINGERPRINT='+info.fingerprint);
   console.log('No private signing key was saved. Configure venue-only .env and import this package.');
  }catch{
   console.error('USD VENUE DEMO REFUSED: output folder exists or invalid filesystem state');
   process.exitCode=1;
  }
 }
}
