import { generateKeyPairSync } from 'node:crypto';
import { jest } from '@jest/globals';
import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { VenueStageService } from './venue-stage.service';
import { signVenueStageSnapshot, verifyVenueStagePackage, VENUE_STAGE_TTL_MS, type VenueStageSnapshot } from './venue-stage-package';

const {privateKey,publicKey}=generateKeyPairSync('ed25519');
const secret=Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64');
const publicPem=publicKey.export({type:'spki',format:'pem'}).toString();
const start=Date.parse('2026-11-04T04:00:00Z');
const snapshot:VenueStageSnapshot={
 format:1,purpose:'USD_VENUE_STAGE_READONLY',stageId:'stage1',
 generatedAt:new Date(start).toISOString(),expiresAt:new Date(start+VENUE_STAGE_TTL_MS).toISOString(),
 stage:{id:'stage1',name:'Площадка USD',stageClasses:[]},registrations:[],
};
const admin={user:{role:'ADMIN',sub:'admin-id'}};
describe('Signed LAN stage export',()=>{
 it('validates Ed25519, SHA256, expiry and signature even after JSON serialization',()=>{
  const pkg=signVenueStageSnapshot(snapshot,secret);
  expect(verifyVenueStagePackage(JSON.parse(JSON.stringify(pkg)),publicPem,start)).toEqual(snapshot);
  expect(pkg.integrity.publicKeyFingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(()=>verifyVenueStagePackage(pkg,publicPem,start+VENUE_STAGE_TTL_MS+1)).toThrow('expired');
  expect(()=>verifyVenueStagePackage({...pkg,snapshot:{...pkg.snapshot,stage:{name:'CHANGED'}}},publicPem,start)).toThrow('integrity');
  expect(()=>verifyVenueStagePackage({...pkg,integrity:{...pkg.integrity,signature:'a'.repeat(86)}},publicPem,start)).toThrow('signature');
 });
 it('rejects unknown private key format and invalid signing algorithm',()=>{
  expect(()=>signVenueStageSnapshot(snapshot,'')).toThrow('not configured');
  expect(()=>signVenueStageSnapshot(snapshot,Buffer.from('not a PEM').toString('base64'))).toThrow();
 });
 it('never exports without ADMIN and an explicit configured signing key',async()=>{
  const prisma:any={stage:{findFirst:jest.fn()},auditLog:{create:jest.fn()}};
  const service=new VenueStageService(prisma);
  await expect(service.exportStage('b3097399-97b2-4d4e-83a9-e953ab97bd16',{user:{role:'PARTICIPANT',sub:'user'}} as any)).rejects.toBeInstanceOf(ForbiddenException);
  await expect(service.exportStage('invalid',admin as any)).rejects.toBeInstanceOf(NotFoundException);
  const prior=process.env.VENUE_STAGE_SIGNING_KEY_B64;
  delete process.env.VENUE_STAGE_SIGNING_KEY_B64;
  try{await expect(service.exportStage('b3097399-97b2-4d4e-83a9-e953ab97bd16',admin as any)).rejects.toBeInstanceOf(ServiceUnavailableException)}
  finally{if(prior!==undefined)process.env.VENUE_STAGE_SIGNING_KEY_B64=prior}
  expect(prisma.stage.findFirst).not.toHaveBeenCalled();
 });
 it('projects the minimum stage roster without passwords, phone, DOB, tokens or login details',async()=>{
  const stageId='b3097399-97b2-4d4e-83a9-e953ab97bd16';
  const prisma:any={siteSettings:{findUnique:jest.fn<() => Promise<any>>().mockResolvedValue({
   legal:{legalApproved:true,legalVersion:'2',ipName:'Организатор USD',
    privacyText:'Published privacy',consentText:'Published consent',termsText:'Published terms',
    operatorAddress:'Published address',personalDataEmail:'data@example.org'},
   contacts:{email:'organizer@example.org'},footer:{},
   registration:{rulesDocument:{
    published:{id:'rules-v2',blocks:[{type:'paragraph',text:'Public rules'}]},
    draft:{id:'private-draft',blocks:[{type:'paragraph',text:'DO_NOT_EXPORT'}]},
   }},
  })},stage:{findFirst:jest.fn<() => Promise<any>>().mockResolvedValue({
   id:stageId,seasonId:'season1',stageNumber:5,name:'USD stage',city:'Омск',
   date:new Date('2026-11-05T10:00:00Z'),venue:null,address:null,status:'PUBLISHED',
   registrationOpen:true,registrationStartsAt:null,registrationEndsAt:null,
   resultsPublishedAt:null,rulesSnapshot:null,season:{id:'season1',name:'USD',year:2026},
   stageClasses:[],registrations:[{
    id:'reg1',participantId:'person1',carId:'car1',configurationVersionId:'version1',
    configurationSnapshot:{bass:true},participantNumber:8,source:'ON_SITE',status:'ACTIVE',
    registeredAt:new Date('2026-11-04T04:00:00Z'),
    participant:{id:'person1',firstName:'Иван',lastName:'Иванов',middleName:null,city:'Омск',team:null},
    car:{id:'car1',participantId:'person1',brand:'Lada',model:'Vesta',registrationCountry:'RU',
     registrationNumber:'А001УР55',color:null},
    numbers:[],classes:[],inspection:null,stageInspection:null,results:[],
   }],
  })},auditLog:{create:jest.fn<() => Promise<any>>().mockResolvedValue({id:'log1'})}};
  const old=process.env.VENUE_STAGE_SIGNING_KEY_B64;
  process.env.VENUE_STAGE_SIGNING_KEY_B64=secret;
  try{
   const service=new VenueStageService(prisma);
   const pkg=await service.exportStage(stageId,admin as any);
   expect(verifyVenueStagePackage(pkg,publicPem,Date.parse(pkg.snapshot.generatedAt)).stageId).toBe(stageId);
   expect((pkg.snapshot as any).venuePolicy).toMatchObject({
    contactEmail:'organizer@example.org',
    legal:{legalApproved:true,legalVersion:'2'},
    rulesPublished:{id:'rules-v2'},
   });
   const data=JSON.stringify(pkg);
   for(const forbidden of ['passwordHash','phone','birthDate','refreshToken','usdIdToken','DO_NOT_EXPORT'])
    expect(data).not.toContain(forbidden);
   expect(prisma.stage.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where:{id:stageId,isDeleted:false,status:{in:['PUBLISHED','COMPLETED']}},
   }));
   expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
    data:expect.objectContaining({action:'VENUE_STAGE_PACKAGE_EXPORTED',entityId:stageId}),
   }));
  }finally{if(old===undefined)delete process.env.VENUE_STAGE_SIGNING_KEY_B64;else process.env.VENUE_STAGE_SIGNING_KEY_B64=old}
 });
});
