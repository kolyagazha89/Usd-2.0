import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { signVenueStageSnapshot, VENUE_STAGE_TTL_MS, type VenueStageSnapshot } from './venue-stage-package';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { createHash, createPrivateKey, createPublicKey, randomBytes } from 'node:crypto';

@Injectable()
export class VenueStageService {
 constructor(private readonly prisma:PrismaService){}

 getSetup(request:AuthenticatedRequest){
  // Do not rely only on controller metadata: custom stage viewers must never
  // gain access to the offline administration workflow.
  if(request.user.role!=='ADMIN')throw new ForbiddenException('Раздел доступен только администратору');
  let signing:{ready:boolean;publicKeyPem:string|null;fingerprint:string|null}={
   ready:false,publicKeyPem:null,fingerprint:null,
  };
  try{
   const encoded=process.env.VENUE_STAGE_SIGNING_KEY_B64;
   if(encoded&&encoded.length<=16384){
    const privateKey=createPrivateKey(Buffer.from(encoded,'base64').toString('utf8'));
    if(privateKey.asymmetricKeyType==='ed25519'){
     const publicKey=createPublicKey(privateKey);
     signing={ready:true,publicKeyPem:publicKey.export({type:'spki',format:'pem'}).toString(),
      fingerprint:createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex')};
    }
   }
  }catch{/* Report readiness only; never expose a key or crypto error. */}
  return {signing,centralSyncReady:signing.ready,fieldAcceptanceComplete:false};
 }

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
    season:{select:{id:true,year:true,name:true,status:true}},
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
     participant:{select:{id:true,firstName:true,lastName:true,middleName:true,city:true,team:true,isPublic:true}},
     car:{select:{id:true,participantId:true,brand:true,model:true,registrationCountry:true,
      registrationNumber:true,color:true,isPublic:true,isActive:true}},
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
  // Copy ONLY published, centrally approved public legal terms and regulation.
  // Missing approval deliberately leaves on-site intake unavailable.
  const settings=await this.prisma.siteSettings.findUnique({
   where:{id:'default'},select:{legal:true,contacts:true,footer:true,registration:true},
  });
  const legal=(settings?.legal??{}) as Record<string,any>;
  const contactEmail=String((settings?.contacts as Record<string,any>|null)?.email??
   (settings?.footer as Record<string,any>|null)?.email??'').trim();
  const published=(settings?.registration as Record<string,any>|null)?.rulesDocument?.published;
  const legalFields=['ipName','privacyText','consentText','termsText','operatorAddress','personalDataEmail'];
  const approved=legal.legalApproved===true&&String(legal.legalVersion??'').trim()
   &&/^\S+@\S+\.\S+$/.test(contactEmail)
   &&legalFields.every(key=>String(legal[key]??'').trim())
   &&published&&String(published.id??'').trim()
   &&Array.isArray(published.blocks)&&published.blocks.length>0;
  const venuePolicy=approved?{
   legal:{
    legalApproved:true,legalVersion:String(legal.legalVersion),
    ipName:String(legal.ipName),privacyText:String(legal.privacyText),
    consentText:String(legal.consentText),termsText:String(legal.termsText),
    operatorAddress:String(legal.operatorAddress),personalDataEmail:String(legal.personalDataEmail),
   },contactEmail,
   rulesPublished:{id:String(published.id),blocks:published.blocks},
  }:undefined;
  const generatedAt=new Date();
  const syncToken=randomBytes(32).toString('base64url');
  const syncExpires=new Date(generatedAt.getTime()+30*24*60*60*1000);
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
   ...(venuePolicy?{venuePolicy}:{}),
   syncAuthorization:{token:syncToken,expiresAt:syncExpires.toISOString()},
   registrations:data.registrations,
  };
  let signed;
  try{signed=signVenueStageSnapshot(snapshot,signingKey)}
  catch{throw new ServiceUnavailableException('Не удалось подписать пакет этапа; обратитесь к администратору сервера')}
  // Export audit stores only metadata and digest, not the participant roster.
  // Export only after the audit transaction succeeds.
  await this.prisma.$transaction(async tx=>{
   await tx.venueSyncAuthorization.create({data:{
    stageId:id,baselineSha256:signed.integrity.sha256,
    tokenHash:createHash('sha256').update(syncToken).digest('hex'),expiresAt:syncExpires,
   }});
   await tx.auditLog.create({data:{
    userId:request.user.sub,action:'VENUE_STAGE_PACKAGE_EXPORTED',entity:'Stage',entityId:id,
    metadata:{sha256:signed.integrity.sha256,registrationCount:data.registrations.length,
     exportedAt:signed.snapshot.generatedAt,expiresAt:signed.snapshot.expiresAt,
     automaticReturn:true},
   }});
  });
  return signed;
 }
}
