import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { signVenueStageSnapshot, VENUE_STAGE_TTL_MS, type VenueStageSnapshot } from './venue-stage-package';
import type { AuthenticatedRequest } from '../auth/authenticated-request';
import { createHash, createPrivateKey, createPublicKey, randomBytes } from 'node:crypto';
import {prepareVenueStaffExport} from './venue-staff-access';
import { MediaService } from '../media/media.service';
import { MediaTargetType } from '../generated/prisma/enums';
import { parseDocxRules } from '../site-settings/docx-rules-parser';
import { hasApprovedProtocolConsentDocument } from '../auth/protocol-consent-document';

@Injectable()
export class VenueStageService {
 constructor(private readonly prisma:PrismaService, @Optional() private readonly mediaService?:MediaService){}

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

 async exportStage(id:string,request:AuthenticatedRequest,withStaff=false,includeCancelled=false){
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
    registrations:{where:includeCancelled?{}:{status:'ACTIVE'},orderBy:{participantNumber:'asc'},select:{
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
  const usedNumbers=new Set(data.registrations.map(row=>row.participantNumber));
  let nextArchivalNumber=-1;
  const registrations=data.registrations
   .filter(row=>row.status==='ACTIVE'||(includeCancelled&&row.car.participantId===row.participantId))
   .map(row=>{
    if(row.status==='ACTIVE')return row;
    // Cancelled rows keep their UUID so the LAN signup reuses it. They
    // carry no competition data and reserve no positive sticker number.
    let participantNumber=row.participantNumber;
    if(participantNumber>=0){
     while(usedNumbers.has(nextArchivalNumber))nextArchivalNumber--;
     participantNumber=nextArchivalNumber--;
    }
    return {...row,participantNumber,numbers:[],classes:[],results:[],inspection:null,stageInspection:null};
   });
  // Offline intake must search the SAME existing person/car UUIDs as Ubuntu.
  // This is a deliberately minimal roster: no email, phone, birthday, tokens,
  // archived aliases, credentials, user accounts or historical results.
  // Exclude redirected duplicate-source profiles. Never silently truncate.
  const participantDirectory=await this.prisma.participant.findMany({
   where:{mergeAsSource:{is:null}},orderBy:[{lastName:'asc'},{firstName:'asc'},{id:'asc'}],
   select:{
    id:true,firstName:true,lastName:true,middleName:true,city:true,team:true,isPublic:true,
    cars:{orderBy:{id:'asc'},select:{
     id:true,participantId:true,brand:true,model:true,registrationCountry:true,
     registrationNumber:true,color:true,isPublic:true,isActive:true,
    }},
   },
  });
  if(participantDirectory.length>25000)
   throw new ServiceUnavailableException('Справочник участников превышает лимит офлайн-пакета; нужен пакетный экспорт');

  // Include REAL car configurations for returning entrants AND for directory-only
  // profiles who may register at the gate. Do not export credentials, catalog
  // administration records, or confirmation links to other competitions.
  const venueCarIds=[...new Set([
   ...participantDirectory.flatMap(person=>person.cars.map(car=>car.id)),
   ...registrations.map(registration=>registration.carId),
  ])].sort();
  if(venueCarIds.length>50000)
   throw new ServiceUnavailableException('Слишком много автомобилей для подписанного пакета');
  const configurations:NonNullable<VenueStageSnapshot['configurations']>=[];
  for(let index=0;index<venueCarIds.length;index+=250){
   const batch=await this.prisma.carConfiguration.findMany({
    where:{carId:{in:venueCarIds.slice(index,index+250)}},
    orderBy:{id:'asc'},
    select:{
     id:true,carId:true,name:true,isActive:true,currentVersion:true,createdAt:true,updatedAt:true,
     versions:{orderBy:{version:'asc'},select:{
      id:true,configurationId:true,version:true,vibrationIsolation:true,
      additionalDescription:true,createdAt:true,
      headUnits:{orderBy:{id:'asc'},select:{
       id:true,versionId:true,brand:true,catalogEntryId:true,model:true,direction:true}},
      batteries:{orderBy:{id:'asc'},select:{
       id:true,versionId:true,brand:true,model:true,quantity:true}},
      generators:{orderBy:{id:'asc'},select:{
       id:true,versionId:true,brand:true,model:true,quantity:true}},
      audioComponents:{orderBy:{id:'asc'},select:{
       id:true,versionId:true,brand:true,catalogEntryId:true,model:true,
       quantity:true,type:true,direction:true}},
      amplifiers:{orderBy:{id:'asc'},select:{
       id:true,versionId:true,brand:true,catalogEntryId:true,model:true,
       quantity:true,direction:true,
       componentLinks:{orderBy:{componentId:'asc'},select:{
        amplifierId:true,componentId:true,quantity:true}},
      }},
     }},
    },
   });
   configurations.push(...batch);
   if(configurations.length>25000)
    throw new ServiceUnavailableException('Слишком много конфигураций для офлайн-пакета');
  }
  const signedVersions=new Map(configurations.flatMap(config=>
   config.versions.map(version=>[version.id,config.carId] as const)));
  for(const registration of registrations){
   if(signedVersions.get(registration.configurationVersionId)!==registration.carId)
    throw new ServiceUnavailableException('Не найдена конфигурация регистрации для офлайн-пакета');
  }


  // Ban data is signed for ALL affected profiles, including unregistered users.
  // Reasons and issuer identities never leave the central server.
  const disqualifications=await this.prisma.disqualification.findMany({
   where:{status:'ACTIVE',OR:[
    {scope:'FORMAT'},{scope:'SEASON',seasonId:data.seasonId},
    {scope:'STAGE',stageId:id},
   ]},
   select:{id:true,participantId:true,scope:true,stageId:true,seasonId:true},
   orderBy:{id:'asc'},
  });
  if(disqualifications.length>25000)
   throw new ServiceUnavailableException('Список запретов слишком большой для офлайн-пакета');
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
  const approved=hasApprovedProtocolConsentDocument(legal)&&String(legal.legalVersion??'').trim()
   &&/^\S+@\S+\.\S+$/.test(contactEmail)
   &&legalFields.every(key=>String(legal[key]??'').trim())
   &&published&&String(published.id??'').trim()
   &&Array.isArray(published.blocks)&&published.blocks.length>0;
  // An offline venue must be able to read the exact approved text without
  // Internet or a RustFS media replica. The signed stage snapshot carries
  // parsed public DOCX blocks, not a link to an unavailable central server.
  let protocolBlocks:ReturnType<typeof parseDocxRules>|undefined;
  if(approved){
   if(!this.mediaService)throw new ServiceUnavailableException('Чтение юридического DOCX для офлайн-пакета не настроено');
   try{
    const targetId=String(legal.documents.officialProtocolConsent.targetId);
    const media=await this.mediaService.getPublicMediaFile(MediaTargetType.SITE_ASSET,targetId);
    if(media.contentType!=='application/vnd.openxmlformats-officedocument.wordprocessingml.document')
     throw new Error('Invalid document type');
    protocolBlocks=parseDocxRules(media.body);
    if(!protocolBlocks.length||JSON.stringify(protocolBlocks).length>300000)
     throw new Error('Invalid document size or content');
   }catch{
    throw new ServiceUnavailableException('Не удалось включить утверждённое согласие на протоколы в офлайн-пакет');
   }
  }
  const venuePolicy=approved?{
   legal:{
    legalApproved:true,legalVersion:String(legal.legalVersion),
    ipName:String(legal.ipName),privacyText:String(legal.privacyText),
    consentText:String(legal.consentText),termsText:String(legal.termsText),
    operatorAddress:String(legal.operatorAddress),personalDataEmail:String(legal.personalDataEmail),
    documents:{officialProtocolConsent:{
     targetId:legal.documents.officialProtocolConsent.targetId,
     url:legal.documents.officialProtocolConsent.url,
     fileName:legal.documents.officialProtocolConsent.fileName||'Согласие на публикацию протокола USD.docx',
     blocks:protocolBlocks,
    }},
   },contactEmail,
   rulesPublished:{id:String(published.id),blocks:published.blocks},
  }:undefined;
  // Existing staff identities are sealed in a dedicated helper; do not
  // expose user verifiers in the signed stage roster or service response.
  const prepared=withStaff?await prepareVenueStaffExport(this.prisma,id,request.user.sub):null;
  const staffKey=prepared?.staffKey;
  const staffAccess=prepared?.staffAccess;
  const staffCount=prepared?.staffCount??0;
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
   ...(staffAccess?{staffAccess}:{}),
   syncAuthorization:{token:syncToken,expiresAt:syncExpires.toISOString()},
   registrations,
   participantDirectory,disqualifications,configurations,
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
    metadata:{sha256:signed.integrity.sha256,registrationCount:registrations.filter(row=>row.status==='ACTIVE').length,
     cancelledRegistrationCount:registrations.filter(row=>row.status==='CANCELLED').length,
     exportedAt:signed.snapshot.generatedAt,expiresAt:signed.snapshot.expiresAt,
     automaticReturn:true,staffCount,directoryCount:participantDirectory.length,configurationCount:configurations.length,banCount:disqualifications.length}, 
   }});
  });
  return withStaff?{signed,staffKey,staffCount}:signed;
 }
}
