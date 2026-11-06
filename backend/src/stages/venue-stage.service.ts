import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { signVenueStageSnapshot, VENUE_STAGE_TTL_MS, type VenueStageSnapshot } from './venue-stage-package';
import type { AuthenticatedRequest } from '../auth/authenticated-request';

@Injectable()
export class VenueStageService {
 constructor(private readonly prisma:PrismaService){}

 async exportStage(id:string,request:AuthenticatedRequest){
  // Stage access granted to a custom judge role is not sufficient to
  // export private participant names, plate numbers and configurations.
  if(request.user.role!=='ADMIN')throw new ForbiddenException('Только ADMIN может подготовить пакет локального сервера');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
   throw new NotFoundException('Этап не найден');
  const signingKey=process.env.VENUE_STAGE_SIGNING_KEY_B64;
  if(!signingKey)throw new ServiceUnavailableException('Подпись пакетов площадки пока не настроена');
  const data=await this.prisma.stage.findFirst({
   where:{id,isDeleted:false,status:{in:['PUBLISHED','COMPLETED']}},
   select:{
    id:true,seasonId:true,stageNumber:true,name:true,city:true,date:true,venue:true,address:true,
    status:true,registrationOpen:true,registrationStartsAt:true,registrationEndsAt:true,
    resultsPublishedAt:true,rulesSnapshot:true,
    season:{select:{id:true,year:true,name:true}},
    stageClasses:{orderBy:{sortOrder:'asc'},select:{
     id:true,stageId:true,classId:true,sortOrder:true,isActive:true,participantLimit:true,
     customName:true,description:true,settings:true,
     class:{select:{id:true,code:true,name:true,unit:true,sortOrder:true,isActive:true,
      direction:{select:{id:true,name:true,sortOrder:true,isActive:true}}}},
    }},
    registrations:{where:{status:'ACTIVE'},orderBy:{participantNumber:'asc'},select:{
     id:true,stageId:true,participantId:true,carId:true,configurationVersionId:true,
     configurationSnapshot:true,participantNumber:true,source:true,status:true,registeredAt:true,
     teamIdAtInspection:true,teamNameAtInspection:true,
     participant:{select:{id:true,firstName:true,lastName:true,middleName:true,city:true,team:true}},
     car:{select:{id:true,participantId:true,brand:true,model:true,registrationCountry:true,
      registrationNumber:true,color:true}},
     numbers:{orderBy:{number:'asc'},select:{id:true,number:true,isPrimary:true}},
     classes:{select:{id:true,classId:true,numberId:true,
      class:{select:{id:true,code:true,name:true,directionId:true}},
      inspection:{select:{id:true,status:true,checkedAt:true,notes:true}}}},
     inspection:{select:{id:true,status:true,checkedAt:true,notes:true}},
     stageInspection:{select:{id:true,participantId:true,stageId:true,status:true,
      checkedAt:true,notes:true}},
     results:{select:{id:true,registrationClassId:true,value:true,unit:true,place:true,
      isBest:true,verificationStatus:true}},
    }},
   },
  });
  if(!data)throw new NotFoundException('Этап не найден или недоступен для офлайн-экспорта');
  if(data.registrations.length>2500)
   throw new ServiceUnavailableException('Этап слишком большой для переносимого пакета; нужен потоковый экспорт');
  const generatedAt=new Date();
  const snapshot:VenueStageSnapshot={
   format:1,purpose:'USD_VENUE_STAGE_READONLY',stageId:id,
   generatedAt:generatedAt.toISOString(),
   expiresAt:new Date(generatedAt.getTime()+VENUE_STAGE_TTL_MS).toISOString(),
   stage:{
    id:data.id,seasonId:data.seasonId,stageNumber:data.stageNumber,name:data.name,
    city:data.city,date:data.date,venue:data.venue,address:data.address,status:data.status,
    registrationOpen:data.registrationOpen,registrationStartsAt:data.registrationStartsAt,
    registrationEndsAt:data.registrationEndsAt,resultsPublishedAt:data.resultsPublishedAt,
    rulesSnapshot:data.rulesSnapshot,season:data.season,stageClasses:data.stageClasses,
   },
   registrations:data.registrations,
  };
  let signed;
  try{signed=signVenueStageSnapshot(snapshot,signingKey)}
  catch{throw new ServiceUnavailableException('Не удалось подписать пакет этапа; обратитесь к администратору сервера')}
  // Export audit stores only metadata and digest, not the participant roster.
  // Export only after the audit transaction succeeds.
  await this.prisma.auditLog.create({data:{
   userId:request.user.sub,action:'VENUE_STAGE_PACKAGE_EXPORTED',entity:'Stage',entityId:id,
   metadata:{sha256:signed.integrity.sha256,registrationCount:data.registrations.length,
    exportedAt:signed.snapshot.generatedAt,expiresAt:signed.snapshot.expiresAt},
  }});
  return signed;
 }
}
