#!/usr/bin/env node
/** USD venue laptop: signed stage-only PostgreSQL import.
 *
 * Fail closed: this program is never an online or incremental importer.
 * --dry-run (default) does no DB work. --apply STAGE_UUID is explicit and
 * requires a pristine independent venue DB, same-origin signed package,
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
  packageHash:signed.integrity.sha256,
  snapshot,
  registrations:snapshot.registrations,
  summary:{stageId:verified.stageId,registrations:registrations.size,
   classes:classIds.size,results:resultCount},
 };
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

/** Initial import remains strictly empty-DB. Subsequent imports run only in a
 * one-shot isolated database root session with the live API stopped. Shared
 * source IDs are reused but never updated; all new stage rows are committed
 * with the root-owned active-stage selector in ONE serializable transaction.
 */
export async function applyVenueStageImport(plan,prisma,{append=false}={}){
 if(!plan?.snapshot?.stage||!plan?.packageHash||!prisma?.$transaction)
  throw new Error('Некорректный проверенный план импорта');
 const stage=plan.snapshot.stage,regs=plan.registrations;
 return prisma.$transaction(async tx=>{
  // Static SQL, no input interpolation. Serialize repeated apply attempts.
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(1827726187)');
  if(append){
   // Never allow the normal API (which is non-root) to bypass the immutable
   // journal by claiming an incremental baseline. This is a separate one-shot
   // PostgreSQL root session. No root secret is present in the running API.
   const session=await tx.$queryRawUnsafe('SELECT session_user AS "sessionUser"');
   if(session?.length!==1||session[0].sessionUser!=='usd_venue_root')
    throw new Error('Повторный импорт разрешён только из отдельной root-сессии');
   const active=await tx.$queryRawUnsafe(
    'SELECT stage_id AS "stageId" FROM venue_private.active_stage FOR UPDATE');
   if(active?.length!==1||active[0].stageId===stage.id)
    throw new Error('Текущий этап не подтверждён или новый этап уже активен');
   const present=await tx.stage.findUnique({where:{id:stage.id}});
   if(present)throw new Error('Этот этап уже существует: повторный импорт запрещён');
   // Only the root SESSION may set the trusted maintenance flag. The
   // root-owned journal trigger independently verifies session_user.
   await tx.$executeRawUnsafe("SELECT set_config('usd_venue.signed_import','on',true)");
  }else{
   await assertVenueDatabaseRole(tx);
   const domain=['stage','season','direction','class','stageClass','participant','car',
    'registration','registrationNumber','registrationClass','result','inspection','participantStageInspection'];
   const counts=await Promise.all(domain.map(table=>tx[table].count()));
   if(counts.some(x=>x!==0))throw new Error('Локальная база не пуста: импорт запрещён без ручной ревизии');
  }
  const saveShared=async(model,data,verify=()=>true,options={})=>{
   const existing=append?await tx[model].findUnique({where:{id:data.id},...options}):null;
   if(existing){
    if(!verify(existing,data))throw new Error('Конфликт исторических данных: '+model+' '+data.id);
    return;
   }
   await tx[model].create({data});
  };
  await saveShared('season',{id:stage.season.id,name:stage.season.name,
   year:stage.season.year,status:stage.season.status??'DRAFT'},
   (old,fresh)=>old.year===fresh.year);
  const directions=new Map(),classes=[];
  for(const sc of stage.stageClasses){
   directions.set(sc.class.direction.id,sc.class.direction);
   classes.push(sc.class);
  }
  for(const d of [...directions.values()].sort(sortById))
   await saveShared('direction',{id:d.id,name:d.name,sortOrder:d.sortOrder,isActive:d.isActive},
    (old,fresh)=>old.name===fresh.name);
  for(const cl of classes.sort(sortById))
   await saveShared('class',{
    id:cl.id,directionId:cl.direction.id,code:cl.code,name:cl.name,
    unit:cl.unit,sortOrder:cl.sortOrder,isActive:cl.isActive,
   },(old,fresh)=>old.directionId===fresh.directionId&&old.code===fresh.code);
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
    &&currentLegal.legalApproved===true){
    // Same approved policy is retained without changing prior history;
    // a different policy needs explicit operator migration, not overwrites.
    const samePolicy=append
     &&currentLegal.legalVersion===policy.legal.legalVersion
     &&current.contacts?.email===policy.contactEmail
     &&current.registration?.rulesDocument?.published?.id===policy.rulesPublished.id;
    if(!samePolicy)
     throw new Error('Нельзя перезаписывать действующую юридическую политику');
   }
   const update={
    legal:policy.legal,
    contacts:{...(current?.contacts??{}),email:policy.contactEmail},
    registration:{...(current?.registration??{}),
     enabled:true,rulesDocument:{published:policy.rulesPublished}},
   };
   if(currentLegal?.legalApproved===true&&append){
    // Do not touch approved legal settings inherited from a prior stage.
   }else if(current){
    await tx.siteSettings.update({where:{id:'default'},data:update});
   }else{
    await tx.siteSettings.create({data:{
     id:'default',branding:{},homepage:{},stream:{},liveResults:{},
     navigation:{items:[]},social:{},seo:{},footer:{},catalogs:{},
     partners:[],news:[],...update,
    }});
   }
  }
  const people=new Map(),cars=new Map(),inspectMap=new Map();
  for(const r of regs){
   people.set(r.participant.id,r.participant);
   cars.set(r.car.id,r.car);
   if(r.stageInspection)inspectMap.set(r.participant.id,r.stageInspection);
  }
  for(const person of [...people.values()].sort(sortById))
   await saveShared('participant',{
    id:person.id,firstName:person.firstName,lastName:person.lastName,
    middleName:person.middleName??null,city:person.city??null,team:person.team??null,
    isPublic:person.isPublic===true,
   });
  for(const car of [...cars.values()].sort(sortById))
   await saveShared('car',{
    id:car.id,participantId:car.participantId,brand:car.brand,model:car.model,
    registrationCountry:car.registrationCountry,registrationNumber:car.registrationNumber,
    color:car.color??null,isPublic:car.isPublic===true,isActive:car.isActive===true,
   },(old,fresh)=>old.participantId===fresh.participantId);
  const importedVersionIds=new Set();
  for(const r of regs){
   // Central configuration version IDs may recur across several stages.
   // Reuse only when the existing version still belongs to the same car.
   if(!importedVersionIds.has(r.configurationVersionId)){
    const previousVersion=append?await tx.carConfigurationVersion.findUnique({
     where:{id:r.configurationVersionId},
     include:{configuration:{select:{carId:true}}},
    }):null;
    if(previousVersion){
     if(previousVersion.configuration?.carId!==r.carId)
      throw new Error('Конфликт владельца автомобиля у версии конфигурации');
    }else{
     // FK-only placeholder. The per-registration immutable snapshot is authoritative.
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
    importedVersionIds.add(r.configurationVersionId);
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
    resultCount:plan.summary.results,createdAt:plan.snapshot.generatedAt},
  }});
  if(append){
   // The stage switch is committed only after ALL new baseline rows exist.
   // No baseline insert has entered the judge-operation journal.
   const switched=await tx.$executeRawUnsafe(
    'UPDATE venue_private.active_stage SET stage_id = $1',stage.id);
   if(Number(switched)!==1)
    throw new Error('Не удалось атомарно переключить активный этап');
  }
  return {...plan.summary,sha256:plan.packageHash};
 },{isolationLevel:'Serializable',timeout:120000});
}

async function main(){
 const [file,keyFile,mode,confirmedId]=process.argv.slice(2);
 if(!file||!keyFile||!['--dry-run','--apply','--append'].includes(mode)
  ||(mode!=='--dry-run'&&!confirmedId))
  throw new Error('Usage: import-stage.mjs STAGE.json PUBLIC_KEY.pem --dry-run | --apply STAGE_UUID | --append STAGE_UUID');
 if((await stat(file)).size>MAX_FILE)throw new Error('Пакет слишком большой');
 const [raw,key]=await Promise.all([readFile(file,'utf8'),readFile(keyFile,'utf8')]);
 const append=mode==='--append';
 // The protected root secret exists only in this one-shot signed importer.
 // It is never passed to the running Nest API container or written to .env.
 let importEnv=process.env;
 if(append){
  const rootUser=process.env.VENUE_IMPORT_ROOT_USER;
  const rootPassword=process.env.VENUE_IMPORT_ROOT_PASSWORD;
  if(rootUser!=='usd_venue_root'||!rootPassword||rootPassword.length<20)
   throw new Error('Нужны отдельные локальные root-права для безопасного импорта');
  const url=new URL(process.env.DATABASE_URL);
  url.username=rootUser;url.password=rootPassword;
  importEnv={...process.env,
   VENUE_STAGE_ID:confirmedId,
   VENUE_DB_USER:rootUser,VENUE_DB_PASSWORD:rootPassword,
   DATABASE_URL:url.toString(),
  };
 }
 const plan=planVenueStageImport(JSON.parse(raw),key,importEnv);
 if(mode==='--dry-run'){
  process.stdout.write('USD VENUE IMPORT DRY RUN — NO DATABASE CONNECTION\n');
  process.stdout.write(JSON.stringify({...plan.summary,sha256:plan.packageHash})+'\n');
  return;
 }
 if(confirmedId!==plan.summary.stageId)
  throw new Error('Явно подтверждённый UUID не совпадает с этапом в подписанном пакете');
 // Resolve Prisma dependencies ONLY AFTER security, signature and dry-run gates.
 const require=createRequire(import.meta.url);
 const {PrismaPg}=require('@prisma/adapter-pg');
 const {PrismaClient}=require('/app/dist/generated/prisma/client.js');
 const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:importEnv.DATABASE_URL})});
 try{
  const result=await applyVenueStageImport(plan,prisma,{append});
  process.stdout.write(append?'USD VENUE NEW STAGE APPENDED TO LOCAL DB\n':
   'USD VENUE STAGE IMPORTED INTO ISOLATED LOCAL DB\n');
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
