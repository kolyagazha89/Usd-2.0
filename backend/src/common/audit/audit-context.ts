import type {PrismaService} from '../../prisma/prisma.service';
import {redactInactiveCar} from '../../participants/car-visibility';

type AuditRow={entity:string;entityId:string|null;metadata:unknown};
type Link={registrationId?:string;registrationClassId?:string;participantId?:string;carId?:string;stageId?:string;number?:number;className?:string};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const id=(v:unknown):string|undefined=>typeof v==='string'&&v.trim()&&v.length<=256?v:undefined;
const ids=(list:(string|undefined)[])=>[...new Set(list.filter((v):v is string=>Boolean(v)))];
const indexed=<T extends {id:string}>(list:T[])=>new Map(list.map(row=>[row.id,row]));
const direct=(rows:AuditRow[],entity:string)=>ids(rows.filter(r=>r.entity===entity).map(r=>id(r.entityId)));
const metadataId=(r:AuditRow,key:string)=>id(object(r.metadata)[key]);
const participantSelect={id:true,firstName:true,lastName:true,middleName:true} as const;
const carSelect={id:true,brand:true,model:true,isActive:true} as const;
const stageSelect={id:true,name:true} as const;
const registrationSelect={id:true,participantNumber:true,participant:{select:participantSelect},car:{select:carSelect},stage:{select:stageSelect}} as const;

/** Current entity references, not historical snapshots. Queries are bounded by
 * the page size, grouped by entity type and skip empty ID sets. */
export async function resolveAuditContexts<T extends AuditRow>(db:PrismaService,rows:T[]){
 const resultIds=direct(rows,'Result'),inspectionIds=direct(rows,'Inspection'),classInspectionIds=direct(rows,'RegistrationClassInspection'),sharedIds=direct(rows,'ParticipantStageInspection'),numberIds=direct(rows,'RegistrationNumber');
 const [results,inspections,classInspections,shared,numbers]=await Promise.all([
  resultIds.length?db.result.findMany({where:{id:{in:resultIds}},select:{id:true,registrationId:true,registrationClassId:true}}):[],
  inspectionIds.length?db.inspection.findMany({where:{id:{in:inspectionIds}},select:{id:true,registrationId:true}}):[],
  classInspectionIds.length?db.registrationClassInspection.findMany({where:{id:{in:classInspectionIds}},select:{id:true,registrationClassId:true}}):[],
  sharedIds.length?db.participantStageInspection.findMany({where:{id:{in:sharedIds}},select:{id:true,participantId:true,stageId:true}}):[],
  numberIds.length?db.registrationNumber.findMany({where:{id:{in:numberIds}},select:{id:true,registrationId:true,number:true}}):[],
 ]);
 const maps=new Map<string,Map<string,Link>>([
  ['Result',indexed(results)],['Inspection',indexed(inspections)],['RegistrationClassInspection',indexed(classInspections)],['ParticipantStageInspection',indexed(shared)],['RegistrationNumber',indexed(numbers)],
 ]);
 const links:Link[]=rows.map(r=>{
  const current=maps.get(r.entity)?.get(r.entityId??'')??{};
  return {...current,
   registrationId:metadataId(r,'registrationId')??(r.entity==='Registration'?id(r.entityId):current.registrationId),
   registrationClassId:metadataId(r,'registrationClassId')??(r.entity==='RegistrationClass'?id(r.entityId):current.registrationClassId),
   participantId:metadataId(r,'participantId')??(r.entity==='Participant'?id(r.entityId):current.participantId),
   carId:metadataId(r,'carId')??(r.entity==='Car'?id(r.entityId):current.carId),
   stageId:metadataId(r,'stageId')??(r.entity==='Stage'?id(r.entityId):current.stageId),
  };
 });
 const rcIds=ids(links.map(l=>l.registrationClassId));
 const classes=rcIds.length?await db.registrationClass.findMany({where:{id:{in:rcIds}},select:{id:true,registrationId:true,class:{select:{name:true}},number:{select:{number:true}}}}):[];
 const classMap=indexed(classes);
 for(const l of links){const c=classMap.get(l.registrationClassId??'');if(c){l.registrationId??=c.registrationId;l.className=c.class.name;l.number=c.number.number}}
 const regIds=ids(links.map(l=>l.registrationId)),personIds=ids(links.map(l=>l.participantId)),carIds=ids(links.map(l=>l.carId)),stageIds=ids(links.map(l=>l.stageId));
 const [registrations,people,cars,stages]=await Promise.all([
  regIds.length?db.registration.findMany({where:{id:{in:regIds}},select:registrationSelect}):[],
  personIds.length?db.participant.findMany({where:{id:{in:personIds}},select:participantSelect}):[],
  carIds.length?db.car.findMany({where:{id:{in:carIds}},select:carSelect}):[],
  stageIds.length?db.stage.findMany({where:{id:{in:stageIds}},select:stageSelect}):[],
 ]);
 const regMap=indexed(registrations),personMap=indexed(people),carMap=indexed(cars),stageMap=indexed(stages);
 return rows.map((row,i)=>{
  const l=links[i],reg=regMap.get(l.registrationId??''),person=personMap.get(l.participantId??''),car=carMap.get(l.carId??''),stage=stageMap.get(l.stageId??'');
  return {...row,context:{...(reg?{registration:{...reg,car:redactInactiveCar(reg.car)}}:{}),...(person?{participant:person}:{}),...(car?{car:redactInactiveCar(car)}:{}),...(stage?{stage}:{}),...(l.className?{className:l.className}:{}),...(l.number!=null?{number:l.number}:{})}};
 });
}
