import {jest} from '@jest/globals';
import {RegistrationsService} from './registrations.service';

describe('official protocol consent is a registration prerequisite',()=>{
 const prisma:any={
  siteSettings:{findUnique:jest.fn()},
  user:{findUnique:jest.fn()},
  $transaction:jest.fn(),
 };
 const participant:any={user:{sub:'u1',participantId:'p1',role:'PARTICIPANT'}};
 const base:any={stageId:'s1',carId:'c1',classIds:['cl1'],
  configurationVersionId:'v1',rulesAccepted:true};
 beforeEach(()=>{
  jest.clearAllMocks();
  prisma.siteSettings.findUnique.mockResolvedValue({
   legal:{legalApproved:true,legalVersion:'1',ipName:'USD',privacyText:'Policy',
    consentText:'Consent',termsText:'Terms',documents:{officialProtocolConsent:{targetId:'legal-document-officialProtocolConsent-test1',url:'https://example.org/consent.docx'}}},
   contacts:{email:'legal@example.org'},
   registration:{rulesDocument:{published:{id:'rules-1',blocks:[{type:'paragraph',text:'rules'}]}}},
  });
  prisma.user.findUnique.mockResolvedValue({
   privacyConsentAt:new Date(), privacyConsentVersion:'privacy-v1',
   termsAcceptedAt:new Date(), termsVersion:'terms-v1',
   protocolConsentAt:null,protocolConsentVersion:null,protocolConsentRevokedAt:null,
  });
 });
 it('refuses new on-site registrations if separate protocol terms are not published',async()=>{
  prisma.siteSettings.findUnique.mockResolvedValue({legal:{legalApproved:true,legalVersion:'1',ipName:'USD',
   privacyText:'Policy',consentText:'Consent',termsText:'Terms'},contacts:{email:'legal@example.org'},
   registration:{rulesDocument:{published:{id:'rules-1',blocks:[{type:'paragraph',text:'rules'}]}}}});
  await expect(new RegistrationsService(prisma).create({user:{sub:'admin',role:'ADMIN'}} as any,
   {...base,participantId:'p1',source:'ON_SITE',privacyConsent:true,termsAccepted:true,protocolConsent:true}))
   .rejects.toThrow('отдельное согласие');
  expect(prisma.$transaction).not.toHaveBeenCalled();
 });
 it('blocks unaffirmed account registrations before any database write',async()=>{
  await expect(new RegistrationsService(prisma).create(participant,base))
    .rejects.toThrow('подтвердите публикацию ФИО');
  expect(prisma.$transaction).not.toHaveBeenCalled();
 });
 it('rejects staff registrations without separately confirmed protocol permissions',async()=>{
  await expect(new RegistrationsService(prisma).create(
   {user:{sub:'admin',role:'ADMIN'}} as any,
   {...base,participantId:'p1',source:'ON_SITE',privacyConsent:true,termsAccepted:true}
  )).rejects.toThrow('подтвердите публикацию ФИО');
  expect(prisma.$transaction).not.toHaveBeenCalled();
 });
});
