import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {duplicatePreview,type DuplicateSnapshot} from './duplicate-profile-preview';

const requestIdPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sanitize=(value:string)=>value.replace(/\s+/g,' ').trim();
const PUBLIC_STATUS=new Set(['PENDING','APPROVED','REJECTED','CONFLICT']);

@Injectable()
export class ProfileLinksService {
 constructor(private readonly prisma:PrismaService){}

 async submit(userId:string,participantId:string,note:string){
  if(!requestIdPattern.test(participantId))throw new BadRequestException('Некорректный профиль участника');
  const cleanNote=sanitize(note??'');
  if(cleanNote.length<12||cleanNote.length>1000)
   throw new BadRequestException('Опишите, как подтвердить принадлежность профиля (12–1000 символов).');
  try {
   // The quota and uniqueness decisions must see a serialized claimant view.
   // Otherwise parallel requests against different historical profiles could
   // all observe fewer than three claims and bypass the daily protection.
   return await this.prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'claimant-user:'+userId}))`;
    const [user,participant,prior]=await Promise.all([
     tx.user.findUnique({where:{id:userId},select:{id:true,emailVerifiedAt:true,isActive:true,participantId:true}}),
     tx.participant.findUnique({where:{id:participantId},select:{id:true,isPublic:true,user:{select:{id:true}}}}),
     tx.profileLinkRequest.findUnique({where:{claimantUserId_participantId:{claimantUserId:userId,participantId}},select:{id:true,status:true,createdAt:true}}),
    ]);
    if(!user?.isActive||!user.emailVerifiedAt)throw new UnauthorizedException('Подтвердите email аккаунта USD.');
    if(user.participantId)throw new ConflictException('У аккаунта уже есть профиль участника.');
    // The error must not reveal whether a hidden participant exists or belongs to someone else.
    if(!participant?.isPublic||participant.user)throw new NotFoundException('Профиль не доступен для самостоятельной заявки.');
    if(prior){
     if(prior.status==='PENDING')return {success:true,id:prior.id,status:prior.status};
     throw new ConflictException('Заявка на этот профиль уже рассмотрена. Обратитесь к организатору USD.');
    }
    const recentCount=await tx.profileLinkRequest.count({
     where:{claimantUserId:userId,createdAt:{gte:new Date(Date.now()-24*60*60*1000)}},
    });
    if(recentCount>=3)throw new ConflictException('Допустимо не более трёх заявок в сутки.');
    const request=await tx.profileLinkRequest.create({
     data:{claimantUserId:userId,participantId,note:cleanNote},
     select:{id:true,status:true},
    });
    return {success:true,...request};
   });
  }catch(error){
   if(typeof error==='object'&&error!==null&&'code' in error&&(error as {code?:string}).code==='P2002'){
    const existing=await this.prisma.profileLinkRequest.findUnique({where:{claimantUserId_participantId:{claimantUserId:userId,participantId}},select:{id:true,status:true}});
    if(existing?.status==='PENDING')return {success:true,...existing};
   }
   throw error;
  }
 }

 async myRequests(userId:string){
  return this.prisma.profileLinkRequest.findMany({
   where:{claimantUserId:userId},
   orderBy:{createdAt:'desc'},
   select:{id:true,participantId:true,status:true,createdAt:true,reviewedAt:true,
    participant:{select:{firstName:true,lastName:true,middleName:true}}},
  });
 }

 async adminList(status?:string){
  if(status&&!PUBLIC_STATUS.has(status))throw new BadRequestException('Неизвестный статус заявки');
  const rows=await this.prisma.profileLinkRequest.findMany({
   where:status?{status}:{},
   orderBy:{createdAt:'desc'},
   take:200,
   select:{id:true,status:true,note:true,createdAt:true,reviewedAt:true,decisionReason:true,
    participantId:true,claimantUserId:true,
    participant:{select:{id:true,firstName:true,lastName:true,middleName:true,user:{select:{id:true}}}},
    claimant:{select:{id:true,email:true,emailVerifiedAt:true,participantId:true}},
    reviewer:{select:{id:true,email:true}},
   },
  });
  if(rows.length===0)return [];
  // Admin-only, bounded and batched; expose a classification, never the
  // historical email address itself or a new public ownership oracle.
  const historical=await this.prisma.participantLegacyEmail.findMany({
   where:{participantId:{in:[...new Set(rows.map(row=>row.participantId))]}},
   select:{participantId:true,email:true},
  });
  const byParticipant=new Map(historical.map(item=>[item.participantId,item.email]));
  return rows.map(row=>{
   const historic=byParticipant.get(row.participantId)?.trim().toLowerCase();
   const verified=!!row.claimant.emailVerifiedAt;
   const legacyEmailStatus=!verified?'EMAIL_NOT_VERIFIED':
    !historic?'LEGACY_EMAIL_MISSING':
    historic===row.claimant.email.trim().toLowerCase()?'MATCH_VERIFIED':'EMAIL_DIFFERENT';
   const {emailVerifiedAt: _verifiedAt,...claimant}=row.claimant;
   return {...row,claimant,legacyEmailStatus};
  });
 }

 /** Read-only ADMIN comparison: no update/delete, no implicit identity claim. */
 async previewDuplicates(sourceId:string,targetId:string){
  if(!requestIdPattern.test(sourceId)||!requestIdPattern.test(targetId)||sourceId===targetId)
   throw new BadRequestException('Выберите два разных профиля участников.');
  const ids=[sourceId,targetId];
  const [participants,sourceRecords,targetRecords]=await Promise.all([
   this.prisma.participant.findMany({
    where:{id:{in:ids}},
    select:{
     id:true,firstName:true,lastName:true,middleName:true,birthDate:true,legacyId:true,usdIdToken:true,
     user:{select:{id:true}},teamMembership:{select:{teamId:true}},
     cars:{select:{id:true,registrationCountry:true,registrationNumber:true,_count:{select:{configurations:true}}}},
     registrations:{select:{id:true,stageId:true,status:true,_count:{select:{numbers:true,classes:true,results:true}}}},
     _count:{select:{stageInspections:true,disqualifications:true,profileLinkRequests:true}},
    },
   }),
   this.prisma.record.count({where:{participantId:sourceId}}),
   this.prisma.record.count({where:{participantId:targetId}}),
  ]);
  if(participants.length!==2)throw new NotFoundException('Один или оба профиля не найдены.');
  const snapshot=(id:string,recordCount:number):DuplicateSnapshot=>{
   const p=participants.find(item=>item.id===id)!;
   return {
    id:p.id,name:[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' '),
    birthDate:p.birthDate?.toISOString().slice(0,10)??null,
    linkedUserId:p.user?.id??null,legacyId:p.legacyId??null,usdIdExists:!!p.usdIdToken,
    teamId:p.teamMembership?.teamId??null,
    cars:p.cars.map(car=>({id:car.id,country:car.registrationCountry,number:car.registrationNumber,configurations:car._count.configurations})),
    registrations:p.registrations.map(row=>({id:row.id,stageId:row.stageId,status:row.status,
     classes:row._count.classes,results:row._count.results,numbers:row._count.numbers})),
    stageInspections:p._count.stageInspections,disqualifications:p._count.disqualifications,
    records:recordCount,claims:p._count.profileLinkRequests,
   };
  };
  return duplicatePreview(snapshot(sourceId,sourceRecords),snapshot(targetId,targetRecords));
 }

 async review(requestId:string,reviewerId:string,decision:'APPROVE'|'REJECT'){
  if(!requestIdPattern.test(requestId))throw new BadRequestException('Некорректный идентификатор заявки');
  if(decision!=='APPROVE'&&decision!=='REJECT')throw new BadRequestException('Неизвестное решение');
  // The admin's explicit approval is the attestation. Store a structured audit
  // reason server-side: no free-text prompt or unchecked browser boolean.
  const cleanReason=decision==='APPROVE'?'ADMIN_VERIFIED':'ADMIN_REJECTED';
  return this.prisma.$transaction(async tx=>{
   // Advisory lock serializes concurrent reviews for the same request.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'profile-link:'+requestId}))`;
   const pending=await tx.profileLinkRequest.findUnique({
    where:{id:requestId},
    select:{id:true,status:true,claimantUserId:true,participantId:true},
   });
   if(!pending)throw new NotFoundException('Заявка не найдена');
   if(pending.status!=='PENDING')
    throw new ConflictException('Заявка уже рассмотрена. Обновите список.');
   // Lock the participant itself, so two claim requests cannot both attach it.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'participant-claim:'+pending.participantId}))`;
   // Two competing requests can name different participant IDs but the same
   // claimant. The claimant lock prevents last-write-wins profile hijacks.
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'claimant-user:'+pending.claimantUserId}))`;
   const [claimant,participant]=await Promise.all([
    tx.user.findUnique({where:{id:pending.claimantUserId},select:{id:true,participantId:true,emailVerifiedAt:true,isActive:true}}),
    tx.participant.findUnique({where:{id:pending.participantId},select:{id:true,user:{select:{id:true}}}}),
   ]);
   if(decision==='APPROVE'&&(!claimant?.isActive||!claimant.emailVerifiedAt||claimant.participantId||!participant||participant.user))
    throw new ConflictException('Привязка заблокирована: профиль или аккаунт уже изменились.');
   if(decision==='APPROVE'){
    // Guard the write itself as well as the preflight checks. A separate login
    // or profile-creation request may race with this reviewed claim.
    const linked=await tx.user.updateMany({
     where:{id:pending.claimantUserId,participantId:null,isActive:true,emailVerifiedAt:{not:null}},
     data:{participantId:pending.participantId},
    });
    if(linked.count!==1)throw new ConflictException('Аккаунт уже изменился. Привязка не выполнена. Обновите список.');
   }
   const updated=await tx.profileLinkRequest.update({
    where:{id:pending.id},data:{status:decision==='APPROVE'?'APPROVED':'REJECTED',reviewedByUserId:reviewerId,decisionReason:cleanReason,reviewedAt:new Date()},
    select:{id:true,status:true,participantId:true},
   });
   await tx.auditLog.create({data:{userId:reviewerId,action:decision==='APPROVE'?'PROFILE_LINK_APPROVED':'PROFILE_LINK_REJECTED',entity:'ProfileLinkRequest',entityId:pending.id,
    metadata:{claimantUserId:pending.claimantUserId,participantId:pending.participantId,reason:cleanReason,ownershipVerified:decision==='APPROVE'},
   }});
   return {success:true,...updated};
  });
 }
}
