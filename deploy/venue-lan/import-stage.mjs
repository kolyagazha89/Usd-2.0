#!/usr/bin/env node
/** USD venue laptop: signed stage-only PostgreSQL import.
 *
 * Fail closed: this program is never an online importer.
 * --dry-run (default) does no DB work. --apply STAGE_UUID is explicit and
 * requires an isolated venue DB, same-origin signed package,
 * verified public key, and a pinned stage. No production credentials.
 *
 * Run INSIDE the isolated usd-venue API image after local Prisma migrations;
 * the importer and verifier scripts are mounted read-only from the reviewed
 * deploy/venue-lan checkout. NEVER mount a production volume here.
 */
import {randomUUID} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {verifyVenueStageHandoff} from './verify-stage-package.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_FILE=12*1024*1024+256*1024;
const isObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const assertUuid=(value,context)=>{
 if(typeof value!=='string'||!UUID.test(value))throw new Error('Некорректный UUID: '+context);
 return value;
};
const nonBlank=(value,context)=>{
 if(typeof value!=='string'||!value.trim())throw new Error('Отсутствует значение: '+context);
 return value;
};
const parsedDate=(value,context)=>{
 const time=Date.parse(String(value??''));
 if(!Number.isFinite(time))throw new Error('Некорректная дата: '+context);
 return new Date(time);
};
const requiredCount=(value,context)=>{
 if(!Number.isSafeInteger(value)||value<=0)throw new Error('Некорректный номер: '+context);
 return value;
};
function addUnique(target,id,label){
 if(target.has(id))throw new Error('Повтор идентификатора '+label);
 target.add(id);
}
function maybeDate(value,context){return value==null?undefined:parsedDate(value,context);}
function maybeJSON(value){return value==null?undefined:value;}

/** Never allow a caller or environment variable to redirect writes to Ubuntu. */
export function assertVenueImportEnvironment(env,stageId){
 if(env.USD_VENUE_LAN_MODE!=='true'||!UUID.test(env.VENUE_STAGE_ID??''))
  throw new Error('Импорт разрешён только на локальной площадке USD');
 if(env.VENUE_STAGE_ID!==stageId)
  throw new Error('UUID этапа не совпадает с закреплённым этапом площадки');
 let db;
 try{db=new URL(env.DATABASE_URL)}catch{
  throw new Error('Адрес локальной базы данных недопустим');
 }
 const dbName=env.VENUE_DB_NAME;
 const dbUser=env.VENUE_DB_USER;
 const safeName=/^usd_venue(?:_[a-z0-9]{1,20})?$/;
 if(!safeName.test(dbName??'')||!safeName.test(dbUser??'')
  ||db.hostname!=='db'||db.port!=='5432'
  ||!['postgresql:','postgres:'].includes(db.protocol)
  ||db.pathname!=='/'+dbName||decodeURIComponent(db.username)!==dbUser
  ||!env.VENUE_DB_PASSWORD||decodeURIComponent(db.password)!==env.VENUE_DB_PASSWORD
  ||(db.search!==''&&db.search!=='?schema=public')
  ||db.hash||db.searchParams.has('host')||db.searchParams.has('hostaddr'))
  throw new Error('Импорт в публичную или постороннюю базу запрещён');
}

/** Return a fully validated immutable operation plan without opening DB.
 * The full, signed payload is NEVER emitted to stdout/logs.
 */
export function planVenueStageImport(signed,publicPem,env,now=Date.now()){
 const verified=verifyVenueStageHandoff(signed,publicPem,now);
 assertVenueImportEnvironment(env,verified.stageId);
 if(!/^[a-f0-9]{64}$/.test(env.VENUE_SIGNING_KEY_FINGERPRINT??'')
  ||env.VENUE_SIGNING_KEY_FINGERPRINT!==verified.publicKeyFingerprint)
  throw new Error('Доверенный отпечаток ключа подписи не совпадает с пакетом');
 const snapshot=signed.snapshot,stage=snapshot.stage;
 const season=stage.season;
 if(!isObject(season)||assertUuid(stage.seasonId,'сезон')!==assertUuid(season.id,'сезон')
  ||!Number.isSafeInteger(season.year)||season.year<2000||season.year>2100)
  throw new Error('Неверная связь сезона');
 nonBlank(season.name,'сезон');
 if(season.status!==undefined&&!['ACTIVE','DRAFT','ARCHIVED'].includes(season.status))
  throw new Error('Неверный статус сезона');
 const policy=snapshot.venuePolicy;
 if(policy!==undefined){
  if(!isObject(policy)||!isObject(policy.legal)||policy.legal.legalApproved!==true
   ||!String(policy.legal.legalVersion??'').trim()
   ||!String(policy.legal.ipName??'').trim()
   ||!String(policy.legal.operatorAddress??'').trim()
   ||!String(policy.legal.personalDataEmail??'').trim()
   ||!String(policy.legal.privacyText??'').trim()
   ||!String(policy.legal.consentText??'').trim()
   ||!String(policy.legal.termsText??'').trim()
   ||!isObject(policy.legal.documents?.officialProtocolConsent)
   ||!/^legal-document-officialProtocolConsent-[A-Za-z0-9_-]+$/.test(String(policy.legal.documents.officialProtocolConsent.targetId??''))
   ||!String(policy.legal.documents.officialProtocolConsent.url??'').trim()
   ||!Array.isArray(policy.legal.documents.officialProtocolConsent.blocks)
   ||!policy.legal.documents.officialProtocolConsent.blocks.length
   ||JSON.stringify(policy.legal.documents.officialProtocolConsent.blocks).length>300000
   ||!/^\S+@\S+\.\S+$/.test(policy.contactEmail??'')
   ||!isObject(policy.rulesPublished)||!String(policy.rulesPublished.id??'').trim()
   ||!Array.isArray(policy.rulesPublished.blocks)||!policy.rulesPublished.blocks.length)
   throw new Error('Не утверждены юридические документы, контакт или регламент');
 }

 if(!Number.isSafeInteger(stage.stageNumber)||stage.stageNumber<1
  ||!['PUBLISHED','COMPLETED'].includes(stage.status))
  throw new Error('Неверный статус или номер этапа');
 nonBlank(stage.name,'этап');
 parsedDate(stage.date,'этап');
 const directionIds=new Set(),directionMap=new Map(),classIds=new Set(),stageClassIds=new Set();
 for(const sc of stage.stageClasses){
  assertUuid(sc.id,'класс этапа');addUnique(stageClassIds,sc.id,'класс этапа');
  assertUuid(sc.classId,'класс');addUnique(classIds,sc.classId,'класс');
  if(!isObject(sc.class)||sc.class.id!==sc.classId)throw new Error('Несовпадение класса этапа');
  const cl=sc.class,dir=cl.direction;
  assertUuid(dir?.id,'направление');
  nonBlank(dir?.name,'направление');
  if(!directionIds.has(dir.id)){directionIds.add(dir.id);directionMap.set(dir.id,dir);}
  else if(directionMap.get(dir.id)?.name!==dir.name)
   throw new Error('Конфликт справочника направлений');
  nonBlank(cl.code,'код класса');nonBlank(cl.name,'название класса');
  if(!Number.isSafeInteger(sc.sortOrder)||!Number.isSafeInteger(cl.sortOrder)
    ||!Number.isSafeInteger(dir.sortOrder))
   throw new Error('Порядок классов должен быть числом');
 }

 const directoryPeople=new Map(),directoryCars=new Map();
 if(snapshot.participantDirectory!==undefined){
  if(!Array.isArray(snapshot.participantDirectory)||snapshot.participantDirectory.length>25000)
   throw new Error('Некорректный размер справочника участников');
  const participantFields=new Set(['id','firstName','lastName','middleName','city','team','isPublic','cars']);
  const carFields=new Set(['id','participantId','brand','model','registrationCountry','registrationNumber','color','isPublic','isActive']);
  for(const person of snapshot.participantDirectory){
   if(!isObject(person)||Object.keys(person).some(k=>!participantFields.has(k))
    ||!UUID.test(person.id??'')||directoryPeople.has(person.id)
    ||typeof person.isPublic!=='boolean'||typeof person.firstName!=='string'
    ||typeof person.lastName!=='string'||!Array.isArray(person.cars)||person.cars.length>250)
    throw new Error('Лишние личные поля или повтор участника справочника');
   directoryPeople.set(person.id,person);
   for(const car of person.cars){
    if(!isObject(car)||Object.keys(car).some(k=>!carFields.has(k))
     ||!UUID.test(car.id??'')||directoryCars.has(car.id)||car.participantId!==person.id
     ||typeof car.brand!=='string'||typeof car.model!=='string'
     ||typeof car.registrationNumber!=='string'||typeof car.isPublic!=='boolean'
     ||typeof car.isActive!=='boolean')
     throw new Error('Автомобиль принадлежит другому участнику или содержит запрещённые поля');
    directoryCars.set(car.id,car);
   }
  }
 }
 const people=new Map(),cars=new Map(),versions=new Map(),registrations=new Set(),
  numbers=new Set(),numberIds=new Set(),registeredClassIds=new Set(),resultIds=new Set(),
  stageInspections=new Map();
 let resultCount=0;
 for(const reg of snapshot.registrations){
  addUnique(registrations,assertUuid(reg.id,'регистрация'),'регистрации');
  if(reg.stageId!==snapshot.stageId||reg.status!=='ACTIVE')throw new Error('Регистрация чужого этапа');
  requiredCount(reg.participantNumber,'участник');
  const person=reg.participant,car=reg.car;
  if(!isObject(person)||!isObject(car)||reg.participantId!==person.id||reg.carId!==car.id
    ||car.participantId!==person.id)
   throw new Error('Сломана связь участника и автомобиля');
  assertUuid(person.id,'участник');assertUuid(car.id,'автомобиль');
  nonBlank(person.lastName,'фамилия');nonBlank(person.firstName,'имя');
  nonBlank(car.brand,'марка автомобиля');nonBlank(car.model,'модель автомобиля');
  nonBlank(car.registrationNumber,'госномер автомобиля');
  if(people.has(person.id)&&JSON.stringify(people.get(person.id))!==JSON.stringify(person))
   throw new Error('Конфликт данных одного участника');
  people.set(person.id,person);
  if(cars.has(car.id))throw new Error('Повтор автомобиля в регистрациях одного этапа');
  cars.set(car.id,car);
  if(!UUID.test(reg.configurationVersionId??''))
   throw new Error('Неверная конфигурация автомобиля');
  if(!isObject(reg.configurationSnapshot))
   throw new Error('Нет неизменяемого снимка конфигурации');
  if(versions.has(reg.configurationVersionId))
   throw new Error('Повтор исходной версии конфигурации');
  versions.set(reg.configurationVersionId,car.id);
  parsedDate(reg.registeredAt,'регистрация');
  const localNumbers=new Set(),localClassIds=new Set();
  for(const no of reg.numbers){
   const noId=assertUuid(no.id,'номер');
   requiredCount(no.number,'стартовый номер');
   addUnique(numberIds,noId,'номера');addUnique(numbers,no.number,'стартового номера');
   localNumbers.add(noId);
  }
  for(const cl of reg.classes){
   const clId=assertUuid(cl.id,'класс регистрации');
   addUnique(registeredClassIds,clId,'класс регистрации');
   if(!classIds.has(cl.classId)||!localNumbers.has(cl.numberId)||!isObject(cl.class)
    ||cl.class.id!==cl.classId)
    throw new Error('Класс регистрации чужого этапа или номера');
   localClassIds.add(clId);
   if(cl.inspection)validateInspection(cl.inspection);
  }
  if(reg.inspection)validateInspection(reg.inspection);
  if(reg.stageInspection){
   validateInspection(reg.stageInspection);
   if(reg.stageInspection.stageId!==snapshot.stageId
    ||reg.stageInspection.participantId!==person.id)
    throw new Error('Неверная принадлежность инспекции этапа');
   const prior=stageInspections.get(person.id);
   if(prior&&JSON.stringify(prior)!==JSON.stringify(reg.stageInspection))
    throw new Error('Конфликт инспекций одного участника');
   stageInspections.set(person.id,reg.stageInspection);
  }
  for(const result of reg.results){
   assertUuid(result.id,'результат');addUnique(resultIds,result.id,'результата');
   if(!localClassIds.has(result.registrationClassId)
    ||!Number.isFinite(Number(result.value))||Number(result.value)<0)
    throw new Error('Неверный результат или чужой класс');
   if(result.place!=null&&(!Number.isSafeInteger(result.place)||result.place<1||result.place>999))
    throw new Error('Некорректное место');
   resultCount++;
  }
 }
 return {
  packageHash:signed.integrity.sha256,verifiedAt:new Date(now).toISOString(),
  snapshot,
  registrations:snapshot.registrations,
  participantDirectory:snapshot.participantDirectory,
  summary:{stageId:verified.stageId,registrations:registrations.size,
   classes:classIds.size,results:resultCount},
 };
}
/** TTL applies to first import, not to recovery of the exact committed
 * package. Only a database receipt created during the signed validity window
 * can supply the historical verification time; caller-provided time cannot.
 */
export async function planInstalledVenueStageImport(signed,pem,env,prisma,now=Date.now()){
 try{return planVenueStageImport(signed,pem,env,now)}catch(error){
  const expires=Date.parse(signed?.snapshot?.expiresAt);
  if(!Number.isFinite(expires)||now<=expires)throw error;
  assertVenueImportEnvironment(env,signed?.snapshot?.stageId);
  const receipt=await prisma.auditLog.findFirst({
   where:{action:'VENUE_STAGE_PACKAGE_IMPORTED',entity:'Stage',entityId:signed.snapshot.stageId},
   select:{metadata:true,createdAt:true},
  });
  const committed=receipt?.createdAt instanceof Date?receipt.createdAt.getTime():NaN;
  const imported=receipt?.metadata?.verifiedAt?Date.parse(receipt.metadata.verifiedAt):committed;
  if(receipt?.metadata?.sha256!==signed?.integrity?.sha256||!Number.isFinite(imported)||!Number.isFinite(committed)||imported>committed
   ||imported>expires||imported<Date.parse(signed.snapshot.generatedAt)-300000)throw error;
  return planVenueStageImport(signed,pem,env,imported);
 }
}
function validateInspection(inspection){
 assertUuid(inspection.id,'инспекция');
 if(!['PASSED','FAILED'].includes(inspection.status))
  throw new Error('Недопустимый статус инспекции');
 parsedDate(inspection.checkedAt,'инспекция');
 if(inspection.status==='FAILED'&&!String(inspection.notes??'').trim())
  throw new Error('При FAILED требуется причина инспекции');
}
const sortById=(a,b)=>a.id.localeCompare(b.id);

/** Never migrate or judge with the bootstrap PostgreSQL superuser.
 * A copied old venue_db volume may still have the unsafe historical owner.
 */
export async function assertVenueDatabaseRole(tx){
 const roles=await tx.$queryRawUnsafe('SELECT rolsuper FROM pg_roles WHERE rolname = current_user');
 if(!Array.isArray(roles)||roles.length!==1||roles[0].rolsuper!==false)
  throw new Error('Локальный API не имеет права работать с PostgreSQL superuser');
}

/** One SQL transaction, one stage, empty local domain. Never upsert source
 * history and never replace an existing venue snapshot or local judge edits.
 */
export async function applyVenueStageImport(plan,prisma,{shared=false}={}){
 if(!plan?.snapshot?.stage||!plan?.packageHash||!prisma?.$transaction)
  throw new Error('Некорректный проверенный план импорта');
 const stage=plan.snapshot.stage,regs=plan.registrations;
 return prisma.$transaction(async tx=>{
  // Static SQL, no input interpolation. Serialize repeated apply attempts.
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(1827726187)');
  if(shared){
   const roles=await tx.$queryRawUnsafe('SELECT current_user AS name, rolsuper FROM pg_roles WHERE rolname=current_user');
   if(roles.length!==1||roles[0].name!=='usd_venue_root'||roles[0].rolsuper!==true)
    throw new Error('Пополнение базы требует локального установщика USD');
   const existing=await tx.stage.findUnique({where:{id:stage.id}});
   if(existing){
    const receipt=await tx.auditLog.findFirst({where:{action:'VENUE_STAGE_PACKAGE_IMPORTED',entity:'Stage',entityId:stage.id},select:{metadata:true}});
    if(receipt?.metadata?.sha256!==plan.packageHash)
     throw new Error('Этап уже импортирован из другого пакета. Судейские данные сохранены.');
    return {...plan.summary,sha256:plan.packageHash,replayed:true};
   }
   // Only the short-lived root importer can bypass its own seed writes.
   // The API never receives this role/password; the flag ends at COMMIT.
   await tx.$executeRawUnsafe("SELECT set_config('usd_venue.importing','true',true)");
  }else{
   await assertVenueDatabaseRole(tx);
   const existing=await tx.stage.findUnique({where:{id:stage.id}});
   if(existing){
    const receipt=await tx.auditLog.findFirst({where:{action:'VENUE_STAGE_PACKAGE_IMPORTED',entity:'Stage',entityId:stage.id},select:{metadata:true}});
    if(receipt?.metadata?.sha256===plan.packageHash)
     return {...plan.summary,sha256:plan.packageHash,replayed:true};
    throw new Error('Этап уже импортирован из другого пакета. Судейские данные сохранены.');
   }
  }
  const createShared=async(model,data)=>{
   if(shared){
    const previous=await tx[model].findUnique({where:{id:data.id}});
    if(previous){
     if(model==='car'&&previous.participantId!==data.participantId)
      throw new Error('Автомобиль принадлежит другому участнику');
     if(model==='class'&&previous.directionId!==data.directionId)
      throw new Error('Класс принадлежит другому направлению');
     return previous;
    }
   }
   return tx[model].create({data});
  };
  const domain=['stage','season','direction','class','stageClass','participant','car',
   'registration','registrationNumber','registrationClass','result','inspection','participantStageInspection'];
  const counts=await Promise.all(domain.map(table=>tx[table].count()));
  if(!shared&&counts.some(x=>x!==0))throw new Error('Локальная база не пуста: импорт запрещён без ручной ревизии');
  await createShared('season',{id:stage.season.id,name:stage.season.name,
   year:stage.season.year,status:stage.season.status??'DRAFT'});
  const directions=new Map(),classes=[];
  for(const sc of stage.stageClasses){
   directions.set(sc.class.direction.id,sc.class.direction);
   classes.push(sc.class);
  }
  for(const d of [...directions.values()].sort(sortById))
   await createShared('direction',{id:d.id,name:d.name,sortOrder:d.sortOrder,isActive:d.isActive});
  for(const cl of classes.sort(sortById))
   await createShared('class',{
    id:cl.id,directionId:cl.direction.id,code:cl.code,name:cl.name,
    unit:cl.unit,sortOrder:cl.sortOrder,isActive:cl.isActive,
   });
  await tx.stage.create({data:{
   id:stage.id,seasonId:stage.seasonId,stageNumber:stage.stageNumber,name:stage.name,
   city:stage.city??null,date:parsedDate(stage.date,'этап'),venue:stage.venue??null,
   address:stage.address??null,status:stage.status,registrationOpen:stage.registrationOpen,
   registrationStartsAt:maybeDate(stage.registrationStartsAt,'начало регистрации'),
   registrationEndsAt:maybeDate(stage.registrationEndsAt,'завершение регистрации'),
   resultsPublishedAt:maybeDate(stage.resultsPublishedAt,'публикация результатов'),
   rulesSnapshot:maybeJSON(stage.rulesSnapshot),
  }});
  for(const sc of stage.stageClasses.sort(sortById))
   await tx.stageClass.create({data:{
    id:sc.id,stageId:stage.id,classId:sc.classId,sortOrder:sc.sortOrder,
    isActive:sc.isActive,participantLimit:sc.participantLimit??null,
    customName:sc.customName??null,description:sc.description??null,
    settings:maybeJSON(sc.settings),
   }});
  if(plan.snapshot.venuePolicy){
   const policy=plan.snapshot.venuePolicy;
   // The official Prisma migrations seed SiteSettings/default with component
   // catalogs. It is not participant/competition data and may already exist.
   // Preserve those catalogs, but never overwrite a previously approved
   // local/central legal policy or any other settings row.
   const settingsCount=await tx.siteSettings.count();
   if(settingsCount>1)throw new Error('Посторонние настройки в локальной базе');
   const current=await tx.siteSettings.findUnique({
    where:{id:'default'},select:{legal:true,contacts:true,registration:true},
   });
   if(settingsCount===1&&!current)
    throw new Error('Посторонний ID настроек в локальной базе');
   const currentLegal=current?.legal??{};
   if(currentLegal&&typeof currentLegal==='object'
    &&currentLegal.legalApproved===true&&!shared)
    throw new Error('Нельзя перезаписывать действующую юридическую политику');
   const update={
    legal:policy.legal,
    contacts:{...(current?.contacts??{}),email:policy.contactEmail},
    registration:{...(current?.registration??{}),
     enabled:true,rulesDocument:{published:policy.rulesPublished}},
   };
   if(current){
    await tx.siteSettings.update({where:{id:'default'},data:update});
   }else{
    await tx.siteSettings.create({data:{
     id:'default',branding:{},homepage:{},stream:{},liveResults:{},
     navigation:{items:[]},social:{},seo:{},footer:{},catalogs:{},
     partners:[],news:[],...update,
    }});
   }
  }
  if(shared&&!plan.snapshot.venuePolicy){
   const current=await tx.siteSettings.findUnique({where:{id:'default'},select:{legal:true,registration:true}});
   if(current)await tx.siteSettings.update({where:{id:'default'},data:{
    legal:{...(current.legal??{}),legalApproved:false},
    registration:{...(current.registration??{}),enabled:false,rulesDocument:{published:null}},
   }});
  }
  const people=new Map(),cars=new Map(),inspectMap=new Map();
  for(const person of plan.participantDirectory??[]){
   people.set(person.id,person);
   for(const car of person.cars)cars.set(car.id,car);
  }

  for(const r of regs){
   const existingPerson=people.get(r.participant.id);
   if(existingPerson&&[existingPerson.firstName,existingPerson.lastName].join('|')!==[r.participant.firstName,r.participant.lastName].join('|'))
    throw new Error('Несовпадение исходного профиля регистрации и справочника');
   const existingCar=cars.get(r.car.id);
   if(existingCar&&existingCar.participantId!==r.participant.id)
    throw new Error('Автомобиль регистрации принадлежит другому участнику');
   if(!existingPerson)people.set(r.participant.id,r.participant);
   if(!existingCar)cars.set(r.car.id,r.car);
   if(r.stageInspection)inspectMap.set(r.participant.id,r.stageInspection);
  }
  for(const person of [...people.values()].sort(sortById))
   await createShared('participant',{
    id:person.id,firstName:person.firstName,lastName:person.lastName,
    middleName:person.middleName??null,city:person.city??null,team:person.team??null,
    isPublic:person.isPublic===true,
   });
  for(const car of [...cars.values()].sort(sortById))
   await createShared('car',{
    id:car.id,participantId:car.participantId,brand:car.brand,model:car.model,
    registrationCountry:car.registrationCountry,registrationNumber:car.registrationNumber,
    color:car.color??null,isPublic:car.isPublic===true,isActive:car.isActive===true,
   });
  for(const r of regs){
   // A local FK placeholder, NOT a claim that the full historical equipment
   // graph was exported. Registration.configurationSnapshot is authoritative.
   const version=shared?await tx.carConfigurationVersion.findUnique({where:{id:r.configurationVersionId},include:{configuration:true}}):null;
   if(version&&version.configuration.carId!==r.carId)
    throw new Error('Версия конфигурации принадлежит другому автомобилю');
   if(!version){
   const configId=randomUUID();
   await tx.carConfiguration.create({data:{
    id:configId,carId:r.carId,name:'USD VENUE: снимок регистрации',
    isActive:false,
   }});
   await tx.carConfigurationVersion.create({data:{
    id:r.configurationVersionId,configurationId:configId,version:1,
    additionalDescription:'Только локальный FK. Источник оборудования: Registration.configurationSnapshot.',
   }});
   }
   await tx.registration.create({data:{
    id:r.id,stageId:r.stageId,participantId:r.participantId,carId:r.carId,
    configurationVersionId:r.configurationVersionId,
    configurationSnapshot:r.configurationSnapshot,participantNumber:r.participantNumber,
    source:r.source,status:'ACTIVE',registeredAt:parsedDate(r.registeredAt,'регистрация'),
    teamIdAtInspection:r.teamIdAtInspection??null,
    teamNameAtInspection:r.teamNameAtInspection??null,
   }});
   for(const n of r.numbers)
    await tx.registrationNumber.create({data:{
     id:n.id,stageId:stage.id,registrationId:r.id,number:n.number,isPrimary:n.isPrimary,
    }});
   for(const cl of r.classes)
    await tx.registrationClass.create({data:{
     id:cl.id,registrationId:r.id,classId:cl.classId,numberId:cl.numberId,
    }});
   if(r.inspection)await tx.inspection.create({data:{
    id:r.inspection.id,registrationId:r.id,status:r.inspection.status,
    checkedAt:parsedDate(r.inspection.checkedAt,'инспекция'),
    notes:r.inspection.notes??null,
   }});
  }
  for(const ins of [...inspectMap.values()].sort(sortById))
   await tx.participantStageInspection.create({data:{
    id:ins.id,participantId:ins.participantId,stageId:ins.stageId,
    status:ins.status,checkedAt:parsedDate(ins.checkedAt,'инспекция'),notes:ins.notes??null,
   }});
  for(const r of regs){
   if(r.stageInspection)
    await tx.registration.update({where:{id:r.id},
     data:{participantStageInspectionId:r.stageInspection.id}});
   for(const cl of r.classes){
    const ins=cl.inspection;
    if(ins)await tx.registrationClassInspection.create({data:{
     id:ins.id,registrationClassId:cl.id,status:ins.status,
     checkedAt:parsedDate(ins.checkedAt,'инспекция'),notes:ins.notes??null,
    }});
   }
   for(const score of r.results)
    await tx.result.create({data:{
     id:score.id,registrationId:r.id,registrationClassId:score.registrationClassId,
     value:String(score.value),unit:score.unit,place:score.place??null,
     isBest:score.isBest===true,verificationStatus:score.verificationStatus,
    }});
  }
  await tx.auditLog.create({data:{
   action:'VENUE_STAGE_PACKAGE_IMPORTED',entity:'Stage',entityId:stage.id,
   metadata:{sha256:plan.packageHash,registrationCount:regs.length,
    resultCount:plan.summary.results,createdAt:plan.snapshot.generatedAt,verifiedAt:plan.verifiedAt},
  }});
  if(shared){
   const changed=await tx.$executeRawUnsafe('UPDATE venue_private.active_stage SET stage_id=$1 WHERE singleton=true',stage.id);
   if(changed!==1)throw new Error('Не удалось выбрать активный этап: импорт отменён');
  }
  return {...plan.summary,sha256:plan.packageHash};
 },{isolationLevel:'Serializable',timeout:120000});
}


/** Extend an already installed stage with centrally signed reference identities.
 * Runs only in a short-lived local root importer, with judging paused.
 * Never touches Registration, Result, the original signed baseline or journal.
 * Every INSERT is into an existing central UUID, not a new local-generated ID.
 */
export async function applyVenueParticipantDirectory(plan,prisma,{stageId}={}){
 if(!plan?.packageHash||!prisma?.$transaction||!Array.isArray(plan.participantDirectory)
  ||plan.snapshot?.stageId!==stageId)
  throw new Error('Нет проверенного справочника для этого этапа');
 return prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(1827726187)');
  const role=await tx.$queryRawUnsafe('SELECT current_user AS name,rolsuper FROM pg_roles WHERE rolname=current_user');
  if(role.length!==1||role[0].name!=='usd_venue_root'||role[0].rolsuper!==true)
   throw new Error('Пополнение справочника разрешено только локальному root-установщику');
  const installed=await tx.stage.findUnique({where:{id:stageId}});
  if(!installed)throw new Error('Этот этап ещё не установлен');
  const receipts=await tx.auditLog.findFirst({
   where:{action:'VENUE_STAGE_PACKAGE_IMPORTED',entity:'Stage',entityId:stageId},
   select:{metadata:true},
  });
  if(!/^[a-f0-9]{64}$/.test(receipts?.metadata?.sha256??''))
   throw new Error('Нет исходной подписанной установки этапа');
  const active=await tx.$queryRawUnsafe('SELECT stage_id AS "stageId" FROM venue_private.active_stage WHERE singleton=true');
  if(active.length!==1||active[0].stageId!==stageId)
   throw new Error('Нельзя обновить исторический или неактивный этап');
  const already=await tx.auditLog.findFirst({
   where:{action:'VENUE_PARTICIPANT_DIRECTORY_IMPORTED',entity:'Stage',entityId:stageId},
   orderBy:{createdAt:'desc'},select:{metadata:true},
  });
  if(already?.metadata?.sha256===plan.packageHash)
   return {addedParticipants:0,addedCars:0,replayed:true};
  const lookalike={A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',P:'Р',C:'С',T:'Т',Y:'У',X:'Х'};
  const normalizedPlate=car=>{
   // Old centrally signed cars may legitimately have no plate assigned yet.
   // Empty identifiers are never evidence that two cars are identical.
   if(!String(car.registrationNumber??'').trim())return '';
   const value=String(car.registrationNumber).normalize('NFKC').toLocaleUpperCase('ru-RU')
    .replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
   const letters=car.registrationCountry==='RU'
    ?[...value].map(x=>lookalike[x]??x).join('').replace(/[|\s.\-_/\\]/g,'')
    :value.replace(/\s+/g,' ');
   return car.registrationCountry+':'+letters.replace(/[^\p{L}\p{N}]/gu,'');
  };
  const currentCars=await tx.car.findMany({select:{id:true,participantId:true,registrationNumber:true,registrationCountry:true}});
  const sourceCarIds=new Set(plan.participantDirectory.flatMap(person=>person.cars.map(car=>car.id)));
  const plates=new Map();
  for(const car of currentCars){
   const plate=normalizedPlate(car);
   if(!plate)continue;
   if(!plates.has(plate))plates.set(plate,new Set());
   plates.get(plate).add(car.id);
  }
  let addedParticipants=0,addedCars=0;
  // Identical plates on different centrally signed car IDs may be historical
  // data; retain both identities. A new local-only car with an occupied plate
  // needs manual review, never an automatic reassignment or overwrite.
  for(const person of plan.participantDirectory){
   for(const car of person.cars){
    const plate=normalizedPlate(car);
    if(!plate)continue;
    const owners=plates.get(plate)??new Set();
    if([...owners].some(id=>id!==car.id&&!sourceCarIds.has(id)))
     throw new Error('MANUAL_REVIEW: госномер уже занят локальным автомобилем под другим ID');
    owners.add(car.id);
    plates.set(plate,owners);
   }
  }
  await tx.$executeRawUnsafe("SELECT set_config('usd_venue.importing','true',true)");
  for(const person of plan.participantDirectory){
   const old=await tx.participant.findUnique({where:{id:person.id}});
   if(!old){
    await tx.participant.create({data:{
     id:person.id,firstName:person.firstName,lastName:person.lastName,
     middleName:person.middleName??null,city:person.city??null,
     team:person.team??null,isPublic:person.isPublic===true,
    }});
    addedParticipants++;
   }
   for(const car of person.cars){
    const prior=await tx.car.findUnique({where:{id:car.id}});
    if(prior){
     if(prior.participantId!==person.id)throw new Error('Автомобиль привязан к другому участнику');
     continue;
    }
    await tx.car.create({data:{
     id:car.id,participantId:person.id,brand:car.brand,model:car.model,
     registrationCountry:car.registrationCountry,registrationNumber:car.registrationNumber,
     color:car.color??null,isPublic:car.isPublic===true,isActive:car.isActive===true,
    }});
    addedCars++;
   }
  }
  await tx.auditLog.create({data:{
   action:'VENUE_PARTICIPANT_DIRECTORY_IMPORTED',entity:'Stage',entityId:stageId,
   metadata:{sha256:plan.packageHash,participantCount:plan.participantDirectory.length,
    addedParticipants,addedCars},
  }});
  return {addedParticipants,addedCars,replayed:false};
 },{isolationLevel:'Serializable',timeout:120000});
}

async function main(){
 const [file,keyFile,mode,confirmedId]=process.argv.slice(2);
 if(!file||!keyFile||!['--dry-run','--apply','--check-installed','--apply-directory'].includes(mode)
  ||(mode==='--apply'&&!confirmedId))
  throw new Error('Usage: import-stage.mjs STAGE.json PUBLIC_KEY.pem --dry-run OR --apply STAGE_UUID');
 if((await stat(file)).size>MAX_FILE)throw new Error('Пакет слишком большой');
 const [raw,key]=await Promise.all([readFile(file,'utf8'),readFile(keyFile,'utf8')]);
 const signed=JSON.parse(raw);
 if(mode==='--dry-run'){
  const plan=planVenueStageImport(signed,key,process.env);
  process.stdout.write('USD VENUE IMPORT DRY RUN — NO DATABASE CONNECTION\n');
  process.stdout.write(JSON.stringify({...plan.summary,sha256:plan.packageHash})+'\n');
  return;
 }
 assertVenueImportEnvironment(process.env,signed?.snapshot?.stageId);
 // Resolve Prisma dependencies ONLY AFTER security, signature and dry-run gates.
 const require=createRequire(import.meta.url);
 const {PrismaPg}=require('@prisma/adapter-pg');
 const {PrismaClient}=require('/app/dist/generated/prisma/client.js');
 const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 try{
  const plan=await planInstalledVenueStageImport(signed,key,process.env,prisma);
  if(mode==='--apply-directory'){
   const imported=await applyVenueParticipantDirectory(plan,prisma,{stageId:plan.snapshot.stageId});
   process.stdout.write('USD VENUE PARTICIPANT DIRECTORY IMPORTED — EXISTING IDS PRESERVED\n');
   process.stdout.write(JSON.stringify(imported)+'\n');
   return;
  }
  if(mode==='--check-installed'){
   process.stdout.write('USD VENUE PACKAGE VERIFIED — NO DATABASE WRITES\n');
   process.stdout.write(JSON.stringify(plan.summary)+'\n');
   return;
  }
  if(confirmedId!==plan.summary.stageId)throw new Error('UUID не совпадает с этапом');
  const result=await applyVenueStageImport(plan,prisma,{shared:process.env.VENUE_SHARED_IMPORT==='true'});
  process.stdout.write('USD VENUE STAGE IMPORTED INTO ISOLATED LOCAL DB\n');
  process.stdout.write(JSON.stringify(result)+'\n');
 }finally{await prisma.$disconnect()}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{
  // No private stage payload, file paths, SQL errors or credentials in stdout.
  console.error('USD VENUE IMPORT REFUSED: validate signature, local DB, source and stage scope');
  process.exitCode=1;
 });
}
