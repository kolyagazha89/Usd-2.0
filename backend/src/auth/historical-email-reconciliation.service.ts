import {BadRequestException,Injectable} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {NameNormalizerService} from '../common/names/name-normalizer.service';
import {reconcileHistoricalEmails,type HistoricalPerson,type HistoricalEmailRow} from './historical-email-reconciliation';

const field=(obj:unknown,keys:string[]):string=>{
 if(!obj||typeof obj!=='object'||Array.isArray(obj))return '';
 const record=obj as Record<string,unknown>;
 for(const key of keys){const value=record[key];if(typeof value==='string'&&value.trim())return value.trim()}
 return '';
};
const emailKeys=['Email','E-mail','E-Mail','Электронная почта','email'];
const nameKeys=['Фамилия и имя','ФИО','Фамилия Имя','Участник','participantName'];
const sticker=(obj:unknown):number|null=>{
 if(!obj||typeof obj!=='object'||Array.isArray(obj))return null;
 const record=obj as Record<string,unknown>;const raw=record['Номер участника']??record['№ участника']??record.participantNumber;
 if(raw===null||raw===undefined||String(raw).trim()==='')return null;
 const parsed=Number(raw);return Number.isSafeInteger(parsed)&&parsed>0?parsed:null;
};

@Injectable()
export class HistoricalEmailReconciliationService{
 constructor(private readonly prisma:PrismaService,private readonly names:NameNormalizerService){}

 private async scan(){
  const [allPeople,emails,redirects,stages]=await Promise.all([
   this.prisma.participant.findMany({select:{id:true,firstName:true,lastName:true,middleName:true,
    registrations:{select:{stageId:true,participantNumber:true}}}}),
   this.prisma.participantLegacyEmail.findMany({select:{participantId:true,email:true}}),
   this.prisma.participantMergeRedirect.findMany({select:{sourceId:true,targetId:true}}),
   this.prisma.stage.findMany({select:{id:true,stageNumber:true,season:{select:{year:true}}}}),
  ]);
  const redirectsById=new Map(redirects.map(r=>[r.sourceId,r.targetId]));
  const canonical=(id:string)=>{const seen=new Set<string>();while(redirectsById.has(id)&&!seen.has(id)){seen.add(id);id=redirectsById.get(id)!}return id};
  const emailsById=new Map(emails.map(r=>[r.participantId,r.email]));
  const people:HistoricalPerson[]=allPeople.filter(p=>!redirectsById.has(p.id)).map(p=>({
   id:p.id,firstName:p.firstName,lastName:p.lastName,middleName:p.middleName,legacyEmail:emailsById.get(p.id)??null,
   appearances:p.registrations.map(r=>({stageId:r.stageId,participantNumber:r.participantNumber})),
  }));
  const mergedEmails=emails.filter(e=>redirectsById.has(e.participantId)&&e.email?.trim()).map(e=>({participantId:canonical(e.participantId),email:e.email!}));
  const rows:HistoricalEmailRow[]=[];
  const add=(stageId:string,raw:unknown)=>{
   const email=field(raw,emailKeys),name=field(raw,nameKeys);
   if(email&&name)rows.push({stageId,name,email,participantNumber:sticker(raw)});
  };
  // Original ImportRow.rawData JSON preserves the Registration spreadsheet's
  // Email column. Registration itself has no email field.
  let after:string|undefined;
  for(;;){
   const page=await this.prisma.importRow.findMany({where:{type:'REGISTRATION'},
    select:{id:true,rawData:true,importJob:{select:{stageId:true}}},orderBy:{id:'asc'},take:2000,
    ...(after?{cursor:{id:after},skip:1}:{})});
   for(const record of page)add(record.importJob.stageId,record.rawData);
   if(page.length<2000)break;after=page[page.length-1].id;
  }
  // HistoricalImportBatch.plan keeps source rows even when an ImportJob was
  // deleted. This lets us audit the whole archive without touching user data.
  const stagesByYear=new Map(stages.map(s=>[`${s.season.year}:${s.stageNumber}`,s.id]));
  let lastBatch:string|undefined;
  for(;;){
   const page=await this.prisma.historicalImportBatch.findMany({select:{id:true,plan:true},orderBy:{id:'asc'},take:10,
    ...(lastBatch?{cursor:{id:lastBatch},skip:1}:{})});
   for(const batch of page){
    const plan=batch.plan as {stages?:Array<{year:number;number:number;registrations?:unknown[]}>}|null;
    if(!Array.isArray(plan?.stages))continue;
    for(const stage of plan.stages){const id=stagesByYear.get(`${stage.year}:${stage.number}`);if(id&&Array.isArray(stage.registrations))for(const raw of stage.registrations)add(id,raw)}
   }
   if(page.length<10)break;lastBatch=page[page.length-1].id;
  }
  const seen=new Set<string>();
  const unique=rows.filter(r=>{const key=[r.stageId,r.name.normalize('NFKC').toLowerCase(),r.email.toLowerCase(),r.participantNumber].join('|');if(seen.has(key))return false;seen.add(key);return true});
  return reconcileHistoricalEmails(people,unique,this.names,mergedEmails);
 }
 async preview(){const result=await this.scan();return {...result.summary,applied:false}}
 async apply(adminUserId:string){
  if(!adminUserId)throw new BadRequestException('Неизвестный администратор');
  const {summary,candidates}=await this.scan();let updatedProfiles=0;
  if(!candidates.length)return {...summary,applied:true,updatedProfiles};
  await this.prisma.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('usd-reconcile-historical-email'))`;
   const retired=await tx.participantMergeRedirect.findMany({where:{sourceId:{in:candidates.map(c=>c.participantId)}},select:{sourceId:true}});
   const retiredIds=new Set(retired.map(r=>r.sourceId));
   for(const entry of candidates){
    if(retiredIds.has(entry.participantId))continue;
    const other=await tx.participantLegacyEmail.findFirst({where:{participantId:{not:entry.participantId},email:{equals:entry.email,mode:'insensitive'}},select:{participantId:true}});
    if(other)continue;
    const existing=await tx.participantLegacyEmail.findUnique({where:{participantId:entry.participantId},select:{email:true}});
    if(existing?.email?.trim())continue;
    if(existing){const changed=await tx.participantLegacyEmail.updateMany({where:{participantId:entry.participantId,email:existing.email},data:{email:entry.email}});updatedProfiles+=changed.count}
    else {const inserted=await tx.participantLegacyEmail.createMany({data:[entry],skipDuplicates:true});updatedProfiles+=inserted.count}
   }
   await tx.auditLog.create({data:{userId:adminUserId,action:'HISTORICAL_EMAIL_RECONCILIATION',entity:'ParticipantLegacyEmail',metadata:{updatedProfiles,safeCandidates:summary.safeProfiles,conflictingProfiles:summary.conflictingProfiles,ambiguousRows:summary.ambiguousRows}}});
  },{timeout:60000,maxWait:10000});
  return {...summary,applied:true,updatedProfiles};
 }
}
