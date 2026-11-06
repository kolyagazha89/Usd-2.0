import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
  const [user,participant,prior]=await Promise.all([
   this.prisma.user.findUnique({where:{id:userId},select:{id:true,emailVerifiedAt:true,isActive:true,participantId:true}}),
   this.prisma.participant.findUnique({where:{id:participantId},select:{id:true,isPublic:true,user:{select:{id:true}}}}),
   this.prisma.profileLinkRequest.findUnique({where:{claimantUserId_participantId:{claimantUserId:userId,participantId}},select:{id:true,status:true,createdAt:true}}),
  ]);
  if(!user?.isActive||!user.emailVerifiedAt)throw new UnauthorizedException('Подтвердите email аккаунта USD.');
  if(user.participantId)throw new ConflictException('У аккаунта уже есть профиль участника.');
  // This endpoint must not reveal private, nonexistent or already-claimed records.
  if(!participant?.isPublic||participant.user)throw new NotFoundException('Профиль не доступен для самостоятельной заявки.');
  if(prior){
   if(prior.status==='PENDING')return {success:true,id:prior.id,status:prior.status};
   throw new ConflictException('Заявка на этот профиль уже рассмотрена. Обратитесь к организатору USD.');
  }
  const recentCount=await this.prisma.profileLinkRequest.count({
   where:{claimantUserId:userId,createdAt:{gte:new Date(Date.now()-24*60*60*1000)}},
  });
  if(recentCount>=3)throw new ConflictException('Допустимо не более трёх заявок в сутки.');
  try {
   const request=await this.prisma.profileLinkRequest.create({
    data:{claimantUserId:userId,participantId,note:cleanNote},
    select:{id:true,status:true},
   });
   return {success:true,...request};
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
  return this.prisma.profileLinkRequest.findMany({
   where:status?{status}:{},
   orderBy:{createdAt:'desc'},
   take:200,
   select:{id:true,status:true,note:true,createdAt:true,reviewedAt:true,decisionReason:true,
    participantId:true,claimantUserId:true,
    participant:{select:{id:true,firstName:true,lastName:true,middleName:true,user:{select:{id:true}}}},
    claimant:{select:{id:true,email:true,participantId:true}},
    reviewer:{select:{id:true,email:true}},
   },
  });
 }

 async review(requestId:string,reviewerId:string,decision:'APPROVE'|'REJECT',reason:string,ownershipVerified:boolean){
  if(!requestIdPattern.test(requestId))throw new BadRequestException('Некорректный идентификатор заявки');
  if(decision!=='APPROVE'&&decision!=='REJECT')throw new BadRequestException('Неизвестное решение');
  const cleanReason=sanitize(reason??'');
  if(cleanReason.length<12||cleanReason.length>1000)
   throw new BadRequestException('Основание решения должно содержать 12–1000 символов.');
  if(decision==='APPROVE'&&!ownershipVerified)
   throw new ForbiddenException('Администратор должен подтвердить, что проверил доказательства принадлежности профиля.');
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
    await tx.user.update({where:{id:pending.claimantUserId},data:{participantId:pending.participantId}});
   }
   const updated=await tx.profileLinkRequest.update({
    where:{id:pending.id},data:{status:decision==='APPROVE'?'APPROVED':'REJECTED',reviewedByUserId:reviewerId,decisionReason:cleanReason,reviewedAt:new Date()},
    select:{id:true,status:true,participantId:true},
   });
   await tx.auditLog.create({data:{userId:reviewerId,action:decision==='APPROVE'?'PROFILE_LINK_APPROVED':'PROFILE_LINK_REJECTED',entity:'ProfileLinkRequest',entityId:pending.id,
    metadata:{claimantUserId:pending.claimantUserId,participantId:pending.participantId,reason:cleanReason,ownershipVerified},
   }});
   return {success:true,...updated};
  });
 }
}
