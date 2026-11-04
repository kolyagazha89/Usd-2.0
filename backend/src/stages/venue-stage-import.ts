import { createHash } from 'node:crypto';
import type { VenueStageSnapshot } from './venue-stage-package';

const requireId=(value:unknown,context:string)=>{
 if(typeof value!=='string'||!value.trim()||value.length>128)
  throw new Error('Неверный ID в пакете: '+context);
 return value;
};
const requireText=(value:unknown,context:string,max=160)=>{
 if(typeof value!=='string'||!value.trim()||value.length>max)
  throw new Error('Неверный текст в пакете: '+context);
 return value;
};
const array=(value:unknown,context:string,max:number):any[]=>{
 if(!Array.isArray(value)||value.length>max)throw new Error('Неверный список: '+context);
 return value;
};
const iso=(value:unknown,context:string)=>{
 const date=new Date(String(value??''));
 if(!Number.isFinite(date.getTime()))throw new Error('Некорректная дата: '+context);
 return date;
};
/** Stable local config container ID, never a remote external identifier.
 * The immutable config version keeps its original central UUID for sync.
 */
const configId=(versionId:string)=>{
 const bytes=createHash('sha256').update('usd-venue-config:'+versionId).digest('hex');
 return [bytes.slice(0,8),bytes.slice(8,12),'5'+bytes.slice(13,16),
  '8'+bytes.slice(17,20),bytes.slice(20,32)].join('-');
};
const json=(value:unknown)=>JSON.parse(JSON.stringify(value??{}));

export type VenueStageImportPlan={
 stage:any;season:any;directions:any[];classes:any[];stageClasses:any[];
 participants:any[];cars:any[];configurations:any[];versions:any[];
 registrations:any[];numbers:any[];registrationClasses:any[];
 participantInspections:any[];inspections:any[];classInspections:any[];results:any[];
};

/** Maps an already signature-verified stage package to normal USD tables.
 * No user account, refresh token, email, media or unrelated stage is imported.
 * Throws before any DB write if stage refs, class numbers or names are invalid.
 */
export function planVenueStageImport(snapshot:VenueStageSnapshot):VenueStageImportPlan {
 const stage=snapshot.stage as any;
 const sid=requireId(snapshot.stageId,'stage');
 if(!stage||stage.id!==sid||!['PUBLISHED','COMPLETED'].includes(stage.status))
  throw new Error('Этап не соответствует подписанному пакету');
 const season=stage.season as any;
 if(!season||!Number.isSafeInteger(season.year)||season.year<2000||season.year>2200)
  throw new Error('Некорректный сезон');
 requireId(season.id,'season');
 if(stage.seasonId!==season.id)throw new Error('Этап привязан к чужому сезону');
 const stageClasses=array(stage.stageClasses,'классы этапа',500);
 const entries=array(snapshot.registrations,'регистрации',2500);
 const directions=new Map<string,any>(),classes=new Map<string,any>();
 const stageClassRows:any[]=[],participants=new Map<string,any>(),cars=new Map<string,any>();
 const configurations=new Map<string,any>(),versions=new Map<string,any>(),numbers:any[]=[];
 const registrationClasses:any[]=[],registrations:any[]=[];
 const participantInspections=new Map<string,any>(),inspections:any[]=[],classInspections:any[]=[],results:any[]=[];
 const numberValues=new Set<number>(),allRegistrationIds=new Set<string>(),stageClassKeys=new Set<string>();
 const classRowsByStage=new Set<string>();
 for(const sc of stageClasses){
  requireId(sc.id,'stageClass');
  if(sc.stageId!==sid)throw new Error('Класс принадлежит другому этапу');
  const klass=sc.class as any,dir=klass?.direction as any;
  if(!klass||!dir||sc.classId!==klass.id)throw new Error('Класс этапа не имеет направления');
  requireId(klass.id,'class');requireId(dir.id,'direction');
  requireText(klass.code,'class.code',80);
  requireText(klass.name,'class.name');requireText(dir.name,'direction.name');
  if(stageClassKeys.has(sc.id)||classRowsByStage.has(klass.id))
   throw new Error('Дубли классов этапа');
  stageClassKeys.add(sc.id);classRowsByStage.add(klass.id);
  if(directions.has(dir.id)&&directions.get(dir.id).name!==dir.name)
   throw new Error('Несовместимые направления');
  directions.set(dir.id,{id:dir.id,name:dir.name,sortOrder:dir.sortOrder??0,isActive:dir.isActive!==false});
  classes.set(klass.id,{id:klass.id,directionId:dir.id,code:klass.code,name:klass.name,
   unit:klass.unit??'DB',sortOrder:klass.sortOrder??0,isActive:klass.isActive!==false});
  stageClassRows.push({id:sc.id,stageId:sid,classId:klass.id,sortOrder:sc.sortOrder??0,
   isActive:sc.isActive!==false,participantLimit:sc.participantLimit??null,
   customName:sc.customName??null,description:sc.description??null,settings:sc.settings??undefined});
 }
 const registrationByCar=new Set<string>();
 for(const r of entries){
  requireId(r.id,'registration');requireId(r.carId,'car');requireId(r.participantId,'participant');
  requireId(r.configurationVersionId,'configurationVersion');
  if(r.stageId!==sid||r.status!=='ACTIVE'||allRegistrationIds.has(r.id)
   ||!Number.isSafeInteger(r.participantNumber)||r.participantNumber<=0
   ||registrationByCar.has(r.carId))
   throw new Error('Некорректная или повторная регистрация');
  allRegistrationIds.add(r.id);registrationByCar.add(r.carId);
  const person=r.participant as any,car=r.car as any;
  if(!person||!car||person.id!==r.participantId||car.id!==r.carId||car.participantId!==r.participantId)
   throw new Error('Несовпадение участника или автомобиля в регистрации');
  requireText(person.firstName,'firstName');requireText(person.lastName,'lastName');
  requireText(car.brand,'car.brand');requireText(car.model,'car.model');
  requireText(car.registrationNumber,'car.registrationNumber',40);
  if(participants.has(person.id)){
   const previous=participants.get(person.id);
   if(previous.firstName!==person.firstName||previous.lastName!==person.lastName)
    throw new Error('Дублированный профиль изменён между записями');
  }
  participants.set(person.id,{id:person.id,firstName:person.firstName,lastName:person.lastName,
   middleName:person.middleName??null,city:person.city??null,team:person.team??null,
   isPublic:false});
  cars.set(car.id,{id:car.id,participantId:person.id,brand:car.brand,model:car.model,
   registrationCountry:car.registrationCountry??'RU',registrationNumber:car.registrationNumber,
   color:car.color??null,isPublic:false});
  const cfg=configId(r.configurationVersionId);
  if(versions.has(r.configurationVersionId)&&versions.get(r.configurationVersionId).configurationId!==cfg)
   throw new Error('Повторная версия конфигурации');
  configurations.set(cfg,{id:cfg,carId:r.carId,name:'Снимок оборудования этапа',isActive:true,currentVersion:1});
  versions.set(r.configurationVersionId,{id:r.configurationVersionId,configurationId:cfg,version:1});
  registrations.push({id:r.id,stageId:sid,participantId:r.participantId,carId:r.carId,
   configurationVersionId:r.configurationVersionId,configurationSnapshot:json(r.configurationSnapshot),
   participantNumber:r.participantNumber,source:r.source??'ON_SITE',status:'ACTIVE',
   registeredAt:iso(r.registeredAt,'registeredAt'),
   teamIdAtInspection:r.teamIdAtInspection??null,
   teamNameAtInspection:r.teamNameAtInspection??null});
  const localNumberIds=new Set<string>();
  const numberRows=array(r.numbers,'номера',100);
  if(!numberRows.length)throw new Error('У регистрации нет номеров');
  for(const n of numberRows){
   requireId(n.id,'number');
   if(localNumberIds.has(n.id)||!Number.isSafeInteger(n.number)||n.number<=0
    ||numberValues.has(n.number))throw new Error('Повтор номера');
   localNumberIds.add(n.id);numberValues.add(n.number);
   numbers.push({id:n.id,stageId:sid,registrationId:r.id,number:n.number,isPrimary:n.isPrimary===true});
  }
  if(!numberRows.some((n:any)=>n.isPrimary===true&&n.number===r.participantNumber))
   throw new Error('Основной номер не совпадает');
  const regClassIds=new Set<string>(),registeredClasses=new Set<string>();
  for(const entry of array(r.classes,'классы регистрации',100)){
   requireId(entry.id,'registrationClass');
   if(regClassIds.has(entry.id)||registeredClasses.has(entry.classId)
    ||!classRowsByStage.has(entry.classId)||!localNumberIds.has(entry.numberId))
    throw new Error('Несовпадение класса/номера регистрации');
   regClassIds.add(entry.id);registeredClasses.add(entry.classId);
   registrationClasses.push({id:entry.id,registrationId:r.id,classId:entry.classId,numberId:entry.numberId});
   if(entry.inspection){
    const x=entry.inspection;
    if(!['PASSED','FAILED'].includes(x.status))throw new Error('Неверный статус инспекции класса');
    classInspections.push({id:requireId(x.id,'classInspection'),registrationClassId:entry.id,
     status:x.status,notes:x.notes??null,checkedAt:iso(x.checkedAt,'classInspection.checkedAt')});
   }
  }
  if(r.inspection){
   const x=r.inspection;
   if(!['PASSED','FAILED'].includes(x.status))throw new Error('Неверный статус осмотра');
   inspections.push({id:requireId(x.id,'inspection'),registrationId:r.id,
    status:x.status,notes:x.notes??null,checkedAt:iso(x.checkedAt,'inspection.checkedAt')});
  }
  if(r.stageInspection){
   const x=r.stageInspection;
   if(x.participantId!==r.participantId||x.stageId!==sid||!['PASSED','FAILED'].includes(x.status))
    throw new Error('Общая инспекция не соответствует участнику этапа');
   const id=requireId(x.id,'participantStageInspection');
   const old=participantInspections.get(id);
   if(old&&(old.participantId!==x.participantId||old.status!==x.status))
    throw new Error('Конфликт общей инспекции');
   participantInspections.set(id,{id,participantId:r.participantId,stageId:sid,status:x.status,
    notes:x.notes??null,checkedAt:iso(x.checkedAt,'participantInspection.checkedAt')});
  }
  for(const result of array(r.results,'результаты',100)){
   requireId(result.id,'result');
   if(!regClassIds.has(result.registrationClassId)
    ||!['DB','MPS','OTHER'].includes(result.unit)
    ||!['NOT_REQUIRED','PENDING','VERIFIED'].includes(result.verificationStatus))
    throw new Error('Результат относится к чужому классу или имеет неверную единицу');
   const score=String(result.value);
   if(!/^-?\d{1,7}(?:\.\d{1,3})?$/.test(score))
    throw new Error('Недопустимое значение результата');
   results.push({id:result.id,registrationId:r.id,registrationClassId:result.registrationClassId,
    value:score,unit:result.unit,place:result.place??null,
    isBest:result.isBest===true,verificationStatus:result.verificationStatus,isHistorical:false});
  }
 }
 return {
  season:{id:season.id,name:requireText(season.name,'season.name'),year:season.year,
   status:'ACTIVE',isActive:true},
  stage:{id:sid,seasonId:season.id,stageNumber:stage.stageNumber,
   name:requireText(stage.name,'stage.name'),city:stage.city??null,
   date:iso(stage.date,'stage.date'),venue:stage.venue??null,address:stage.address??null,
   description:null,status:stage.status,registrationOpen:stage.registrationOpen===true,
   resultsPublishedAt:stage.resultsPublishedAt?iso(stage.resultsPublishedAt,'resultsPublishedAt'):null,
   rulesSnapshot:stage.rulesSnapshot??undefined,isDeleted:false},
  directions:[...directions.values()],classes:[...classes.values()],stageClasses:stageClassRows,
  participants:[...participants.values()],cars:[...cars.values()],
  configurations:[...configurations.values()],versions:[...versions.values()],
  registrations,numbers,registrationClasses,participantInspections:[...participantInspections.values()],
  inspections,classInspections,results,
 };
}
