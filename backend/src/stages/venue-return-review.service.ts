import {
 BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException,
} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import type {AuthenticatedRequest} from '../auth/authenticated-request';

type Decision={key:string;action:'LINK'|'NEW'|'DEFER';targetId?:string|null;reason:string};
type ReviewBody={version:number;decisions:Decision[]};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha=/^[a-f0-9]{64}$/;

@Injectable()
export class VenueReturnReviewService {
 constructor(private readonly prisma:PrismaService){}
 private admin(request:AuthenticatedRequest){
  if(process.env.USD_VENUE_LAN_MODE==='true')
   throw new ForbiddenException('Решение конфликтов доступно только на основном сервере');
  if(request.user?.role!=='ADMIN'||!uuid.test(request.user.sub??''))
   throw new ForbiddenException('Нужны права ADMIN');
  return request.user.sub;
 }
 /** The pending case holds NO decrypted original journal or device key. */
 async preview(snapshot:any){
  const module=await import('../../scripts/venue-sync/venue-return-review.mjs');
  const [participants,cars]=await Promise.all([
   this.prisma.participant.findMany({select:{
    id:true,firstName:true,lastName:true,middleName:true,city:true,
   }}),
   this.prisma.car.findMany({select:{
    id:true,participantId:true,registrationCountry:true,
    registrationNumber:true,brand:true,model:true,
   }}),
  ]);
  return module.collectVenueReturnConflicts(snapshot,{participants,cars});
 }
 async pending(grantId:string,stageId:string,journalEndHash:string,envelopeHash:string,conflicts:any[]){
  if(!uuid.test(grantId)||!uuid.test(stageId)||!sha.test(journalEndHash)
   ||!sha.test(envelopeHash)||!Array.isArray(conflicts)||!conflicts.length
   ||conflicts.length>2500)throw new BadRequestException('Неверный конфликт офлайн-журнала');
  const key={authorizationId_journalEndHash:{authorizationId:grantId,journalEndHash}};
  const existing=await this.prisma.venueReturnReview.findUnique({where:key});
  if(existing){
   if(existing.stageId!==stageId||existing.envelopeHash!==envelopeHash)
    throw new ConflictException('Другой пакет с тем же журналом. Требуется ручная проверка.');
   const changed=JSON.stringify(existing.conflicts)!==JSON.stringify(conflicts);
   if(changed&&existing.status!=='APPLIED'){
    const update=await this.prisma.venueReturnReview.updateMany({
     where:{id:existing.id,version:existing.version,status:{in:['PENDING','DEFERRED','APPROVED']}},
     data:{conflicts,decisions:null,status:'PENDING',reviewedByUserId:null,reviewedAt:null,
      version:{increment:1}},
    });
    if(update.count!==1)throw new ConflictException('Заявка изменена другим администратором');
    return {id:existing.id,status:'PENDING'};
   }
   return {id:existing.id,status:existing.status};
  }
  try{
   const created=await this.prisma.venueReturnReview.create({data:{
    authorizationId:grantId,stageId,journalEndHash,envelopeHash,conflicts,
    status:'PENDING',
   }});
   return {id:created.id,status:'PENDING'};
  }catch{
   // Unique race: never assume a concurrent request supplied the same ciphertext.
   const current=await this.prisma.venueReturnReview.findUnique({where:key});
   if(!current||current.envelopeHash!==envelopeHash||current.stageId!==stageId)
    throw new ConflictException('Пакет не совпадает с ожидающим рассмотрения');
   return {id:current.id,status:current.status};
  }
 }
 async matched(grantId:string,journalEndHash:string,envelopeHash:string){
  const found=await this.prisma.venueReturnReview.findUnique({
   where:{authorizationId_journalEndHash:{authorizationId:grantId,journalEndHash}},
  });
  if(!found)return {reviewId:null,approvedBy:null,resolutions:{}};
  if(found.envelopeHash!==envelopeHash)
   throw new ConflictException('Подписанный пакет отличается от проверенного');
  if(found.status!=='APPROVED'&&found.status!=='APPLIED')
   throw new ConflictException('MANUAL_REVIEW: решение администратора ещё не принято. Заявка '+found.id);
  const decisions=found.decisions;
  if(!Array.isArray(decisions)||!decisions.length||!uuid.test(found.reviewedByUserId??''))
   throw new ConflictException('MANUAL_REVIEW: неполное решение администратора');
  const helper=await import('../../scripts/venue-sync/venue-return-review.mjs');
  const validate=helper.validateVenueReviewDecisions(found.conflicts,decisions);
  return {reviewId:found.id,approvedBy:found.reviewedByUserId,
   resolutions:helper.venueResolutionMap(validate)};
 }
 async applied(id:string){
  const changed=await this.prisma.venueReturnReview.updateMany({
   where:{id,status:'APPROVED'},data:{status:'APPLIED',appliedAt:new Date(),version:{increment:1}},
  });
  if(changed.count!==1){
   const current=await this.prisma.venueReturnReview.findUnique({where:{id}});
   if(current?.status!=='APPLIED')
    throw new ConflictException('Не удалось подтвердить применение решений администратора');
  }
 }
 async list(request:AuthenticatedRequest,pageValue?:string){
  this.admin(request);
  const page=Number(pageValue??'1');
  if(!Number.isSafeInteger(page)||page<1||page>1000)
   throw new BadRequestException('Некорректная страница');
  const where={};
  const [items,total]=await Promise.all([
   this.prisma.venueReturnReview.findMany({
    where,orderBy:{createdAt:'desc'},skip:(page-1)*20,take:20,
    select:{id:true,stageId:true,status:true,journalEndHash:true,version:true,
     reviewedAt:true,appliedAt:true,createdAt:true,conflicts:true},
   }),
   this.prisma.venueReturnReview.count({where}),
  ]);
  return {items:items.map(x=>({...x,conflictCount:Array.isArray(x.conflicts)?x.conflicts.length:0,
   conflicts:undefined})),page,pageSize:20,total};
 }
 async one(id:string,request:AuthenticatedRequest){
  this.admin(request);
  if(!uuid.test(id))throw new BadRequestException('Некорректная заявка');
  const item=await this.prisma.venueReturnReview.findUnique({where:{id},
   select:{id:true,stageId:true,status:true,journalEndHash:true,envelopeHash:true,version:true,
    conflicts:true,decisions:true,reviewedByUserId:true,reviewedAt:true,appliedAt:true,createdAt:true},
  });
  if(!item)throw new NotFoundException('Заявка не найдена');
  return item;
 }
 async decide(id:string,body:ReviewBody,request:AuthenticatedRequest){
  const userId=this.admin(request);
  if(!uuid.test(id)||!body||typeof body!=='object'||Array.isArray(body)
   ||Object.keys(body).some(key=>!['version','decisions'].includes(key))
   ||!Number.isSafeInteger(body.version)||body.version<0
   ||!Array.isArray(body.decisions)||body.decisions.length>2500)
   throw new BadRequestException('Некорректное решение');
  return this.prisma.$transaction(async tx=>{
   const review=await tx.venueReturnReview.findUnique({where:{id}});
   if(!review)throw new NotFoundException('Заявка не найдена');
   if(!['PENDING','DEFERRED'].includes(review.status))
    throw new ConflictException('Решение уже утверждено или данные импортированы');
   if(review.version!==body.version)
    throw new ConflictException('Заявка обновилась. Загрузите актуальную версию.');
   const helper=await import('../../scripts/venue-sync/venue-return-review.mjs');
   let decisions;
   try{decisions=helper.validateVenueReviewDecisions(review.conflicts,body.decisions)}
   catch{throw new BadRequestException('Некорректный выбор профилей или не указана причина')}
   if(!decisions.length)throw new BadRequestException('Нет конфликтов для решения');
   const status=decisions.some((x:any)=>x.action==='DEFER')?'DEFERRED':'APPROVED';
   const result=await tx.venueReturnReview.updateMany({
    where:{id,version:body.version,status:{in:['PENDING','DEFERRED']}},
    data:{status,decisions,reviewedByUserId:userId,reviewedAt:new Date(),
     version:{increment:1}},
   });
   if(result.count!==1)throw new ConflictException('Заявка уже изменена');
   for(const resolution of decisions){
    await tx.auditLog.create({data:{
     userId,action:'VENUE_RETURN_REVIEW_DECIDED',entity:resolution.table,entityId:resolution.sourceId,
     metadata:{reviewId:id,stageId:review.stageId,journalEndHash:review.journalEndHash,
      action:resolution.action,targetId:resolution.targetId,reason:resolution.reason,
      candidateIds:resolution.candidateIds,version:body.version+1},
    }});
   }
   return {id,status,version:body.version+1,decisions};
  },{isolationLevel:'Serializable',timeout:20000});
 }
}
