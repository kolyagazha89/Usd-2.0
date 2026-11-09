import {
 BadRequestException, ConflictException, ForbiddenException,
 Injectable, NotFoundException,
} from '@nestjs/common';
import {Prisma} from '../generated/prisma/client';
import {PrismaService} from '../prisma/prisma.service';
import {validateMergeCandidates,type MergeCandidate} from './profile-merge-guards';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * ADMIN-only, explicitly confirmed, lossless identity consolidation.
 *
 * All moved foreign keys retain their original row IDs, class, number,
 * equipment snapshots, stage affiliation, value and inspection outcome.
 * Old Participant rows/legacy IDs/USD tokens are never deleted.
 * A durable redirect retains exact moved IDs for a supervised recovery.
 * This method is not called during imports, matching or user onboarding.
 */
@Injectable()
export class ProfileMergeService {
 constructor(private readonly prisma:PrismaService){}

 async merge(sourceId:string,targetId:string,adminUserId:string,confirmation:string){
  if(!uuid.test(sourceId)||!uuid.test(targetId)||!uuid.test(adminUserId)||sourceId===targetId)
   throw new BadRequestException('Выберите два разных действительных профиля и ADMIN.');
  if(confirmation!==sourceId.slice(0,8))
   throw new BadRequestException('Введите первые восемь символов ID переносимого профиля.');

  return this.prisma.$transaction(async tx=>{
   // Same participant lock family and order as self-service/ADMIN linking.
   // Lock BOTH endpoints before checking aliases or any historical rows.
   for(const id of [sourceId,targetId].sort())
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'participant-claim:'+id}))`;

   const admin=await tx.user.findUnique({
    where:{id:adminUserId},
    select:{id:true,role:true,isActive:true,emailVerifiedAt:true},
   });
   if(!admin?.isActive||!admin.emailVerifiedAt||admin.role!=='ADMIN')
    throw new ForbiddenException('Только действующий ADMIN с подтверждённым email может объединить профили.');

   const already=await tx.participantMergeRedirect.findUnique({where:{sourceId},select:{targetId:true}});
   if(already){
    if(already.targetId===targetId)return {success:true,alreadyMerged:true,sourceId,targetId};
    throw new ConflictException('Переносимый профиль уже объединён с другим.');
   }
   // No merge chains: they make redirect resolution and supervised undo ambiguous.
   const otherMerges=await tx.participantMergeRedirect.findMany({
    where:{OR:[
     {sourceId:{in:[sourceId,targetId]}},
     {targetId:{in:[sourceId,targetId]}},
    ]},
    select:{sourceId:true},take:1,
   });
   if(otherMerges.length)throw new ConflictException('Выбранный профиль уже участвует в объединении. Требуется отдельная проверка цепочки.');

   const ids=[sourceId,targetId];
   const participants=await tx.participant.findMany({
    where:{id:{in:ids}},select:{
     id:true,firstName:true,lastName:true,middleName:true,birthDate:true,
     phone:true,photoUrl:true,city:true,team:true,legacyId:true,usdIdToken:true,isPublic:true,
     user:{select:{id:true,isActive:true,emailVerifiedAt:true}},
     teamMembership:{select:{id:true,teamId:true,status:true}},
     cars:{select:{id:true,registrationCountry:true,registrationNumber:true}},
     registrations:{select:{id:true,stageId:true,status:true}},
     stageInspections:{select:{id:true,stageId:true}},
    },
   });
   const source=participants.find(p=>p.id===sourceId);
   const target=participants.find(p=>p.id===targetId);
   if(!source||!target)throw new NotFoundException('Один из профилей не найден.');

   // Pending claims may be created concurrently by a participant.
   // The claim submit path takes the same participant lock before writing.
   const [emailRows,pendingRows,records,disqualifications,imports,media]=await Promise.all([
    tx.participantLegacyEmail.findMany({where:{participantId:{in:ids}},select:{participantId:true,email:true}}),
    tx.profileLinkRequest.findMany({where:{participantId:{in:ids},status:'PENDING'},select:{participantId:true}}),
    tx.record.findMany({where:{participantId:sourceId},select:{id:true}}),
    tx.disqualification.findMany({where:{participantId:sourceId},select:{id:true}}),
    tx.importRow.findMany({where:{participantId:sourceId},select:{id:true}}),
    tx.mediaUpload.findMany({
     where:{completedAt:{not:null},OR:[
      {targetType:'PARTICIPANT_PHOTO',targetId:sourceId},
      {targetType:'CAR_PHOTO',targetId:{in:source.cars.map(car=>car.id)}},
     ]},
     select:{id:true},
    }),
   ]);
   const emailFor=(id:string)=>emailRows.find(row=>row.participantId===id)?.email??null;
   const candidate=(p:typeof source):MergeCandidate=>({
    ...p,legacyEmail:emailFor(p.id),
    pendingClaims:pendingRows.filter(claim=>claim.participantId===p.id).length,
   });
   const blockers=validateMergeCandidates(candidate(source),candidate(target));
   if(source.user&&(!source.user.isActive||!source.user.emailVerifiedAt))
    blockers.push({code:'ACCOUNT_NOT_VERIFIED',description:'Переносимый аккаунт неактивен или его email не подтверждён.'});
   if(blockers.length)
    throw new ConflictException({message:'Объединение заблокировано. Разберите конфликты и заново проверьте профили.',conflicts:blockers});

   const recovered={
    version:1,sourceId,targetId,sourceWasPublic:source.isPublic,
    targetOriginal:{
     phone:target.phone,city:target.city,team:target.team,photoUrl:target.photoUrl,
     birthDate:target.birthDate?.toISOString()??null,
    },
    copiedLegacyEmail:!emailFor(targetId)&&!!emailFor(sourceId),
    moved:{
     accountUserId:source.user?.id??null,
     teamMembershipId:source.teamMembership?.id??null,
     cars:source.cars.map(row=>row.id),
     registrations:source.registrations.map(row=>row.id),
     stageInspections:source.stageInspections.map(row=>row.id),
     records:records.map(row=>row.id),
     disqualifications:disqualifications.map(row=>row.id),
     importRows:imports.map(row=>row.id),
    },
    // Media objects and historic claims stay on the old ID by design.
    // Their IDs are retained so a restore never blindly removes the S3 object.
    untouchedMediaUploads:media.map(row=>row.id),
   };
   const exact=(actual:number,expected:number,label:string)=>{
    if(actual!==expected)throw new ConflictException(label+' изменилось во время объединения. Транзакция отменена.');
   };
   if(source.user) {
    const result=await tx.user.updateMany({
     where:{id:source.user.id,participantId:sourceId},
     data:{participantId:targetId},
    });
    exact(result.count,1,'Привязка аккаунта');
   }
   if(source.teamMembership){
    const result=await tx.teamMembership.updateMany({
     where:{id:source.teamMembership.id,participantId:sourceId},
     data:{participantId:targetId},
    });
    exact(result.count,1,'Членство в команде');
   }

   // Primary rows are MOVED, not copied, recreated or deleted.
   // Registration/result IDs and frozen snapshots remain exactly unchanged.
   const movedCars=await tx.car.updateMany({where:{participantId:sourceId},data:{participantId:targetId}});
   exact(movedCars.count,source.cars.length,'Автомобили');
   const movedRegistrations=await tx.registration.updateMany({where:{participantId:sourceId},data:{participantId:targetId}});
   exact(movedRegistrations.count,source.registrations.length,'Регистрации');
   const movedInspections=await tx.participantStageInspection.updateMany({where:{participantId:sourceId},data:{participantId:targetId}});
   exact(movedInspections.count,source.stageInspections.length,'Инспекции');
   const movedRecords=await tx.record.updateMany({where:{participantId:sourceId},data:{participantId:targetId}});
   exact(movedRecords.count,records.length,'Рекорды');
   const movedDisqualifications=await tx.disqualification.updateMany({where:{participantId:sourceId},data:{participantId:targetId}});
   exact(movedDisqualifications.count,disqualifications.length,'Дисквалификации');
   const movedImportRows=await tx.importRow.updateMany({where:{participantId:sourceId},data:{participantId:targetId}});
   exact(movedImportRows.count,imports.length,'Архивные строки');

   await tx.participant.update({
    where:{id:targetId},
    data:{
     birthDate:target.birthDate??source.birthDate,
     phone:target.phone??source.phone,
     city:target.city??source.city,
     team:target.team??source.team,
     photoUrl:target.photoUrl??source.photoUrl,
    },
   });
   if(!emailFor(targetId)&&emailFor(sourceId)){
    await tx.participantLegacyEmail.upsert({
     where:{participantId:targetId},
     create:{participantId:targetId,email:emailFor(sourceId)},
     update:{email:emailFor(sourceId)},
    });
   }
   // Keep source row (including legacy ID, USD token, media, reviewed claims).
   // Its public lookup is permanently resolved to target by ParticipantsService.
   await tx.participant.update({where:{id:sourceId},data:{isPublic:false}});
   await tx.participantMergeRedirect.create({
    data:{sourceId,targetId,mergedByUserId:adminUserId,recovery:recovered},
   });
   await tx.auditLog.create({
    data:{userId:adminUserId,action:'PARTICIPANT_PROFILES_MERGED',entity:'ParticipantMergeRedirect',
     entityId:sourceId,metadata:{
      sourceId,targetId,recoveryVersion:1,
      counts:{
       cars:source.cars.length,registrations:source.registrations.length,
       inspections:source.stageInspections.length,records:records.length,
       disqualifications:disqualifications.length,importRows:imports.length,
      },
     }},
   });
   return {success:true,alreadyMerged:false,sourceId,targetId,
    moved:{cars:source.cars.length,registrations:source.registrations.length,
     inspections:source.stageInspections.length,records:records.length}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000,maxWait:15000});
 }
}
