#!/usr/bin/env node
/** Read-only venue handoff verification. This script NEVER connects to a
 * PostgreSQL database, central API, or writes a participant record. It must
 * be run on the laptop with the public Ed25519 key carried separately from
 * the signed stage package.
 */
import {createHash,createPublicKey,verify} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const MAX_BYTES=12*1024*1024;
const TTL=72*60*60*1000;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const fields=(value,keys,context)=>{
 if(!value||typeof value!=='object'||Array.isArray(value))
  throw new Error('Некорректная запись: '+context);
 const allowed=new Set(keys);
 if(Object.keys(value).some(key=>!allowed.has(key)))
  throw new Error('Лишние/личные поля в пакете: '+context);
};
export function verifyVenueStageHandoff(packageValue,publicPem,now=Date.now()){
 if(!packageValue||typeof packageValue!=='object'||Array.isArray(packageValue))
  throw new Error('Некорректный пакет площадки');
 const {snapshot,integrity}=packageValue;
 fields(packageValue,['snapshot','integrity'],'контейнер');
 fields(integrity,['algorithm','sha256','signature','publicKeyFingerprint'],'подпись');
 fields(snapshot,['format','purpose','stageId','generatedAt','expiresAt','stage','registrations','venuePolicy'],'снимок');
 if(snapshot.format!==1||snapshot.purpose!=='USD_VENUE_STAGE_READONLY'
  ||!uuid(snapshot.stageId)||integrity.algorithm!=='Ed25519'
  ||typeof integrity.signature!=='string'||!/^[A-Za-z0-9_-]{64,180}$/.test(integrity.signature)
  ||typeof integrity.sha256!=='string'||!/^[a-f0-9]{64}$/.test(integrity.sha256)
  ||typeof integrity.publicKeyFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(integrity.publicKeyFingerprint))
  throw new Error('Неподдерживаемый формат или подпись пакета');
 const created=Date.parse(String(snapshot.generatedAt));
 const expiry=Date.parse(String(snapshot.expiresAt));
 if(!Number.isFinite(now)||!Number.isFinite(created)||!Number.isFinite(expiry)
  ||expiry-created>TTL||expiry<=created||now>expiry||now<created-5*60*1000)
  throw new Error('Пакет просрочен или время ноутбука неверно');
 const bytes=Buffer.from(JSON.stringify(snapshot),'utf8');
 if(bytes.length>MAX_BYTES||hash(bytes)!==integrity.sha256)
  throw new Error('Контрольная сумма пакета не совпадает');
 const key=createPublicKey(publicPem);
 if(key.asymmetricKeyType!=='ed25519')throw new Error('Нужен открытый ключ Ed25519');
 if(hash(key.export({type:'spki',format:'der'}))!==integrity.publicKeyFingerprint
  ||!verify(null,bytes,key,Buffer.from(integrity.signature,'base64url')))
  throw new Error('Цифровая подпись не подтверждена');
 if(snapshot.venuePolicy!==undefined){
  const policy=snapshot.venuePolicy;
  fields(policy,['legal','contactEmail','rulesPublished'],'политика регистрации');
  fields(policy.legal,['legalApproved','legalVersion','ipName','privacyText',
   'consentText','termsText','operatorAddress','personalDataEmail'],'законодательство');
  if(policy.legal.legalApproved!==true
   ||typeof policy.contactEmail!=='string'
   ||!/^\S+@\S+\.\S+$/.test(policy.contactEmail)
   ||Object.entries(policy.legal).some(([name,value])=>name!=='legalApproved'
    &&(typeof value!=='string'||!value.trim()||value.length>500000)))
   throw new Error('Некорректные юридические документы и контактный email');
  fields(policy.rulesPublished,['id','blocks'],'опубликованный регламент');
  if(typeof policy.rulesPublished.id!=='string'||!policy.rulesPublished.id.trim()
   ||!Array.isArray(policy.rulesPublished.blocks)||policy.rulesPublished.blocks.length===0
   ||policy.rulesPublished.blocks.length>300)
   throw new Error('Некорректный опубликованный регламент');
 }
 const stage=snapshot.stage;
 fields(stage,['id','seasonId','stageNumber','name','city','date','venue','address','status',
  'registrationOpen','registrationStartsAt','registrationEndsAt','resultsPublishedAt',
  'rulesSnapshot','season','stageClasses'],'этап');
 if(stage.id!==snapshot.stageId||!Array.isArray(stage.stageClasses)||stage.stageClasses.length>400)
  throw new Error('Состав этапа неверен');
 if(!Array.isArray(snapshot.registrations)||snapshot.registrations.length>2500)
  throw new Error('Превышен лимит участников');
 const classIds=new Set();
 for(const row of stage.stageClasses){
  fields(row,['id','stageId','classId','sortOrder','isActive','participantLimit',
   'customName','description','settings','class'],'класс этапа');
  if(!row.id||!row.classId||row.stageId!==snapshot.stageId||classIds.has(row.classId))
   throw new Error('Некорректная связь класса с этапом');
  classIds.add(row.classId);
 }
 const ids=new Set(),allNumbers=new Set();
 for(const r of snapshot.registrations){
  fields(r,['id','stageId','participantId','carId','configurationVersionId','configurationSnapshot',
   'participantNumber','source','status','registeredAt','teamIdAtInspection','teamNameAtInspection',
   'participant','car','numbers','classes','inspection','stageInspection','results'],'регистрация');
  if(!uuid(r.id)||ids.has(r.id)||r.stageId!==snapshot.stageId
   ||r.status!=='ACTIVE'||!Number.isSafeInteger(r.participantNumber)
   ||!Array.isArray(r.numbers)||!Array.isArray(r.classes)||!Array.isArray(r.results))
   throw new Error('Некорректная регистрация');
  ids.add(r.id);
  fields(r.participant,['id','firstName','lastName','middleName','city','team','isPublic'],'участник');
  if(r.participant.isPublic!==undefined&&typeof r.participant.isPublic!=='boolean')
   throw new Error('Некорректная приватность участника');
  fields(r.car,['id','participantId','brand','model','registrationCountry',
   'registrationNumber','color','isPublic','isActive'],'автомобиль');
  if((r.car.isPublic!==undefined&&typeof r.car.isPublic!=='boolean')
   ||(r.car.isActive!==undefined&&typeof r.car.isActive!=='boolean'))
   throw new Error('Некорректная приватность автомобиля');
  if(r.participant.id!==r.participantId||r.car.id!==r.carId||r.car.participantId!==r.participantId)
   throw new Error('Участник или автомобиль принадлежат другой записи');
  const localNumbers=new Set();
  for(const number of r.numbers){
   fields(number,['id','number','isPrimary'],'номер');
   if(!uuid(number.id)||!Number.isSafeInteger(number.number)||number.number<=0
    ||localNumbers.has(number.id)||allNumbers.has(number.number))
    throw new Error('Повтор или неверный номер на этапе');
   localNumbers.add(number.id);allNumbers.add(number.number);
  }
  for(const cl of r.classes){
   fields(cl,['id','classId','numberId','class','inspection'],'класс регистрации');
   if(!uuid(cl.id)||!classIds.has(cl.classId)||!localNumbers.has(cl.numberId))
    throw new Error('Класс или номер не принадлежат этапу');
  }
  for(const result of r.results){
   fields(result,['id','registrationClassId','value','unit','place',
    'isBest','verificationStatus'],'результат');
   if(!r.classes.some(cl=>cl.id===result.registrationClassId))
    throw new Error('Результат относится к чужому классу');
  }
 }
 return {stageId:snapshot.stageId,stageName:String(stage.name??''),
  registrations:snapshot.registrations.length,classes:stage.stageClasses.length,
  generatedAt:snapshot.generatedAt,expiresAt:snapshot.expiresAt,
  sha256:integrity.sha256,publicKeyFingerprint:integrity.publicKeyFingerprint};
}

export async function verifyVenueStageFile(file,keyFile){
 const [raw,key]=await Promise.all([readFile(file),readFile(keyFile,'utf8')]);
 if(raw.length>MAX_BYTES+256*1024)throw new Error('Файл превышает лимит 12 МиБ');
 return verifyVenueStageHandoff(JSON.parse(raw.toString('utf8')),key);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [file,publicKey]=process.argv.slice(2);
 if(!file||!publicKey){
  console.error('Usage: node verify-stage-package.mjs STAGE.json PUBLIC_KEY.pem');
  process.exitCode=2;
 }else{
  try{
   const summary=await verifyVenueStageFile(file,publicKey);
   console.log('USD VENUE STAGE PACKAGE VERIFIED — NO DATABASE WRITES');
   console.log(JSON.stringify(summary,null,2));
  }catch{
   // Do not print a file path, package data or participant name when invalid.
   console.error('USD VENUE PACKAGE REJECTED: integrity, expiry or stage references invalid');
   process.exitCode=1;
  }
 }
}
