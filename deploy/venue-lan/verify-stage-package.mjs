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
// Configuration graphs are signed, but the importer must validate their
// identity graph before the first local DB write. Reject unrelated cars,
// unknown fields, duplicated UUIDs and cross-version amplifier links.
export function validateVenueConfigurations(configurations,carIds,registeredVersions){
 if(configurations===undefined)return;
 if(!Array.isArray(configurations)||configurations.length>25000)
  throw new Error('Некорректный список конфигураций');
 const exact=(value,keys,label)=>{
  fields(value,keys,label);
  if(keys.some(key=>!Object.hasOwn(value,key)))throw new Error('Не хватает полей конфигурации: '+label);
 };
 const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
 const string=(value,max=1000)=>typeof value==='string'&&value.length<=max;
 const optional=(value,max=1000)=>value===null||string(value,max);
 const quantity=value=>Number.isSafeInteger(value)&&value>0&&value<=1000;
 const direction=value=>['SUB','FRONT','REAR'].includes(value);
 const configIds=new Set(),versionIds=new Map(),allIds=new Set();
 let totalRows=0;
 for(const config of configurations){
  exact(config,['id','carId','name','isActive','currentVersion','createdAt','updatedAt','versions'],'конфигурация');
  if(!uuid(config.id)||configIds.has(config.id)||!carIds.has(config.carId)
   ||!string(config.name,300)||!config.name.trim()||typeof config.isActive!=='boolean'
   ||!quantity(config.currentVersion)||!date(config.createdAt)||!date(config.updatedAt)
   ||!Array.isArray(config.versions)||!config.versions.length||config.versions.length>250)
   throw new Error('Неверная конфигурация или принадлежность автомобилю');
  configIds.add(config.id);
  const numbers=new Set();
  for(const version of config.versions){
   exact(version,['id','configurationId','version','vibrationIsolation','additionalDescription',
    'createdAt','amplifiers','audioComponents','headUnits','batteries','generators'],'версия конфигурации');
   if(!uuid(version.id)||versionIds.has(version.id)||version.configurationId!==config.id
    ||!quantity(version.version)||numbers.has(version.version)
    ||!optional(version.vibrationIsolation,4000)||!optional(version.additionalDescription,10000)
    ||!date(version.createdAt))
    throw new Error('Неверная версия конфигурации');
   numbers.add(version.version);versionIds.set(version.id,config.carId);
   const equipment=[
    ['amplifiers',['id','versionId','brand','catalogEntryId','model','quantity','direction','componentLinks']],
    ['audioComponents',['id','versionId','brand','catalogEntryId','model','quantity','type','direction']],
    ['headUnits',['id','versionId','brand','catalogEntryId','model','direction']],
    ['batteries',['id','versionId','brand','model','quantity']],
    ['generators',['id','versionId','brand','model','quantity']],
   ];
   const ampIds=new Set(),componentIds=new Set();
   for(const [table,keys] of equipment){
    const rows=version[table];
    if(!Array.isArray(rows)||rows.length>2000)throw new Error('Слишком много компонентов конфигурации');
    totalRows+=rows.length;
    if(totalRows>125000)throw new Error('Пакет оборудования слишком большой');
    for(const row of rows){
     exact(row,keys,'оборудование '+table);
     if(!uuid(row.id)||allIds.has(row.id)||row.versionId!==version.id
      ||!string(row.brand,300)||!string(row.model,500)
      ||(Object.hasOwn(row,'catalogEntryId')&&!optional(row.catalogEntryId,300))
      ||(Object.hasOwn(row,'quantity')&&!quantity(row.quantity))
      ||(Object.hasOwn(row,'direction')&&!direction(row.direction))
      ||(Object.hasOwn(row,'type')&&!['SUBWOOFER','MIDBASS','MIDRANGE','HORN','OTHER'].includes(row.type)))
      throw new Error('Повреждено оборудование конфигурации');
     allIds.add(row.id);
     if(table==='amplifiers')ampIds.add(row.id);
     if(table==='audioComponents')componentIds.add(row.id);
    }
   }
   const links=new Set();
   for(const amplifier of version.amplifiers){
    if(!Array.isArray(amplifier.componentLinks)||amplifier.componentLinks.length>2000)
     throw new Error('Неверные связи усилителя');
    for(const link of amplifier.componentLinks){
     exact(link,['amplifierId','componentId','quantity'],'связь усилителя с компонентом');
     const key=link.amplifierId+'/'+link.componentId;
     if(link.amplifierId!==amplifier.id||!ampIds.has(link.amplifierId)
      ||!componentIds.has(link.componentId)||!quantity(link.quantity)||links.has(key))
      throw new Error('Связь оборудования относится к чужой конфигурации');
     links.add(key);
    }
   }
  }
  if(!numbers.has(config.currentVersion))
   throw new Error('Текущая версия конфигурации отсутствует');
 }
 for(const [versionId,carId] of registeredVersions){
  if(versionIds.get(versionId)!==carId)
   throw new Error('Версия конфигурации регистрации отсутствует или принадлежит другому автомобилю');
 }
}

export function verifyVenueStageHandoff(packageValue,publicPem,now=Date.now()){
 if(!packageValue||typeof packageValue!=='object'||Array.isArray(packageValue))
  throw new Error('Некорректный пакет площадки');
 const {snapshot,integrity}=packageValue;
 fields(packageValue,['snapshot','integrity'],'контейнер');
 fields(integrity,['algorithm','sha256','signature','publicKeyFingerprint'],'подпись');
 fields(snapshot,['format','purpose','stageId','generatedAt','expiresAt','stage','registrations','venuePolicy','syncAuthorization','staffAccess','participantDirectory','disqualifications','configurations'],'снимок');
 if(snapshot.format!==1||snapshot.purpose!=='USD_VENUE_STAGE_READONLY'
  ||!uuid(snapshot.stageId)||integrity.algorithm!=='Ed25519'
  ||typeof integrity.signature!=='string'||!/^[A-Za-z0-9_-]{64,180}$/.test(integrity.signature)
  ||typeof integrity.sha256!=='string'||!/^[a-f0-9]{64}$/.test(integrity.sha256)
  ||typeof integrity.publicKeyFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(integrity.publicKeyFingerprint))
  throw new Error('Неподдерживаемый формат или подпись пакета');
 const bytes=Buffer.from(JSON.stringify(snapshot),'utf8');
 if(bytes.length>MAX_BYTES||hash(bytes)!==integrity.sha256)
  throw new Error('Контрольная сумма пакета не совпадает');
 const key=createPublicKey(publicPem);
 if(key.asymmetricKeyType!=='ed25519')throw new Error('Нужен открытый ключ Ed25519');
 if(hash(key.export({type:'spki',format:'der'}))!==integrity.publicKeyFingerprint
  ||!verify(null,bytes,key,Buffer.from(integrity.signature,'base64url')))
  throw new Error('Цифровая подпись не подтверждена');
 const created=Date.parse(String(snapshot.generatedAt));
 const expiry=Date.parse(String(snapshot.expiresAt));
 if(!Number.isFinite(created)||!Number.isFinite(expiry)||expiry-created>TTL||expiry<=created)
  throw Object.assign(new Error('Недопустимый срок действия пакета'),{venuePackageFailure:'PACKAGE_INVALID_WINDOW'});
 if(!Number.isFinite(now)||now<created-5*60*1000)
  throw Object.assign(new Error('Проверьте время ноутбука: пакет выпущен позже текущего времени'),{venuePackageFailure:'PACKAGE_NOT_YET_VALID'});
 if(now>expiry)
  throw Object.assign(new Error('Пакет просрочен по часам ноутбука'),{venuePackageFailure:'PACKAGE_EXPIRED'});
 if(snapshot.staffAccess!==undefined){
  const envelope=snapshot.staffAccess;
  fields(envelope,['format','algorithm','nonce','ciphertext','tag'],'шифр доступа сотрудников');
  if(envelope.format!==1||envelope.algorithm!=='AES-256-GCM'
   ||typeof envelope.nonce!=='string'||!/^[A-Za-z0-9_-]{16}$/.test(envelope.nonce)
   ||typeof envelope.tag!=='string'||!/^[A-Za-z0-9_-]{22}$/.test(envelope.tag)
   ||typeof envelope.ciphertext!=='string'||!/^[A-Za-z0-9_-]{10,130000}$/.test(envelope.ciphertext))
   throw new Error('Некорректный зашифрованный доступ сотрудников');
 }
 if(snapshot.syncAuthorization!==undefined){
  fields(snapshot.syncAuthorization,['token','expiresAt'],'права синхронизации');
  if(!/^[A-Za-z0-9_-]{43}$/.test(snapshot.syncAuthorization.token)
   ||Date.parse(snapshot.syncAuthorization.expiresAt)<=created
   ||Date.parse(snapshot.syncAuthorization.expiresAt)-created>31*86400000)
   throw new Error('Некорректные права синхронизации');
 }
 if(snapshot.venuePolicy!==undefined){
  const policy=snapshot.venuePolicy;
  fields(policy,['legal','contactEmail','rulesPublished'],'политика регистрации');
  fields(policy.legal,['legalApproved','legalVersion','ipName','privacyText',
   'consentText','termsText','operatorAddress','personalDataEmail','documents'],'законодательство');
  if(policy.legal.legalApproved!==true
   ||typeof policy.contactEmail!=='string'
   ||!/^\S+@\S+\.\S+$/.test(policy.contactEmail)
   ||Object.entries(policy.legal).some(([name,value])=>name!=='legalApproved'&&name!=='documents'
    &&(typeof value!=='string'||!value.trim()||value.length>500000)))
   throw new Error('Некорректные юридические документы и контактный email');
  const documents=policy.legal.documents;
  fields(documents,['officialProtocolConsent'],'юридические файлы');
  const protocol=documents.officialProtocolConsent;
  fields(protocol,['targetId','url','fileName','blocks'],'согласие на протокол');
  if(typeof protocol.targetId!=='string'||
   !/^legal-document-officialProtocolConsent-[A-Za-z0-9_-]+$/.test(protocol.targetId)||
   typeof protocol.url!=='string'||!protocol.url.trim()||
   typeof protocol.fileName!=='string'||protocol.fileName.length>255||
   !Array.isArray(protocol.blocks)||!protocol.blocks.length||
   protocol.blocks.length>1000||JSON.stringify(protocol.blocks).length>300000||
   protocol.blocks.some(block=>!block||typeof block!=='object'||!['heading','paragraph','list-item','table'].includes(block.type)))
   throw new Error('Недоступен утверждённый текст согласия на протоколы');
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
 if(snapshot.disqualifications!==undefined){
  if(!Array.isArray(snapshot.disqualifications)||snapshot.disqualifications.length>25000)
   throw new Error('Некорректный подписанный список дисквалификаций');
  const seenBans=new Set();
  for(const item of snapshot.disqualifications){
   fields(item,['id','participantId','scope','stageId','seasonId'],'дисквалификация');
   if(!uuid(item.id)||!uuid(item.participantId)||seenBans.has(item.id)
    ||item.scope==='FORMAT'&&(item.stageId!==null||item.seasonId!==null)
    ||item.scope==='SEASON'&&(item.stageId!==null||item.seasonId!==stage.seasonId)
    ||item.scope==='STAGE'&&(item.stageId!==snapshot.stageId||item.seasonId!==null)
    ||!['FORMAT','SEASON','STAGE'].includes(item.scope))
    throw new Error('Некорректная связь дисквалификации с этапом');
   seenBans.add(item.id);
  }
 }
 if(!Array.isArray(snapshot.registrations)||snapshot.registrations.length>2500)
  throw new Error('Превышен лимит участников');

 // The optional directory is a signed search-only snapshot. Never allow login
 // credentials, email, phone, birth date, account links or unrelated records.
 if(snapshot.participantDirectory!==undefined){
  if(!Array.isArray(snapshot.participantDirectory)||snapshot.participantDirectory.length>25000)
   throw new Error('Некорректный размер справочника участников');
  const people=new Set(),cars=new Set();
  for(const person of snapshot.participantDirectory){
   fields(person,['id','firstName','lastName','middleName','city','team','isPublic','cars'],'участник справочника');
   if(!uuid(person.id)||people.has(person.id)||typeof person.firstName!=='string'||typeof person.lastName!=='string'||typeof person.isPublic!=='boolean'
    ||!Array.isArray(person.cars)||person.cars.length>250)
    throw new Error('Повтор или повреждение участника справочника');
   people.add(person.id);
   for(const car of person.cars){
    fields(car,['id','participantId','brand','model','registrationCountry','registrationNumber',
     'color','isPublic','isActive'],'автомобиль справочника');
    if(!uuid(car.id)||cars.has(car.id)||car.participantId!==person.id
     ||typeof car.brand!=='string'||typeof car.model!=='string'
     ||typeof car.registrationNumber!=='string'||typeof car.isPublic!=='boolean'
     ||typeof car.isActive!=='boolean')
     throw new Error('Повтор или повреждение автомобиля справочника');
    cars.add(car.id);
   }
  }
 }
 const classIds=new Set();
 for(const row of stage.stageClasses){
  fields(row,['id','stageId','classId','sortOrder','isActive','participantLimit',
   'customName','description','settings','class'],'класс этапа');
  if(!row.id||!row.classId||row.stageId!==snapshot.stageId||classIds.has(row.classId))
   throw new Error('Некорректная связь класса с этапом');
  classIds.add(row.classId);
 }
 const ids=new Set(),allNumbers=new Set(),registrationNumbers=new Set();
 let activeRegistrations=0;
 for(const r of snapshot.registrations){
  fields(r,['id','stageId','participantId','carId','configurationVersionId','configurationSnapshot',
   'participantNumber','source','status','registeredAt','teamIdAtInspection','teamNameAtInspection',
   'participant','car','numbers','classes','inspection','stageInspection','results'],'регистрация');
  if(!uuid(r.id)||ids.has(r.id)||r.stageId!==snapshot.stageId
   ||!['ACTIVE','CANCELLED'].includes(r.status)||!Number.isSafeInteger(r.participantNumber)
   ||registrationNumbers.has(r.participantNumber)
   ||!Array.isArray(r.numbers)||!Array.isArray(r.classes)||!Array.isArray(r.results))
   throw new Error('Некорректная регистрация');
  ids.add(r.id);
  registrationNumbers.add(r.participantNumber);
  if(r.status==='CANCELLED'){
   if(r.participantNumber>=0||r.participantNumber<-2147483648||r.numbers.length||r.classes.length
    ||r.results.length||r.inspection||r.stageInspection)
    throw new Error('Отменённая регистрация не может занимать стартовый номер или содержать результаты');
  }else{activeRegistrations++}
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
 const allCarIds=new Set([
  ...(snapshot.participantDirectory??[]).flatMap(person=>person.cars.map(car=>car.id)),
  ...snapshot.registrations.map(registration=>registration.carId),
 ]);
 const registeredVersions=snapshot.registrations.map(registration=>
  [registration.configurationVersionId,registration.carId]);
 validateVenueConfigurations(snapshot.configurations,allCarIds,registeredVersions);
 return {stageId:snapshot.stageId,stageName:String(stage.name??''),
  registrations:activeRegistrations,classes:stage.stageClasses.length,
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
