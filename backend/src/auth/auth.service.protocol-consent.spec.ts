import {jest} from '@jest/globals';
import {AuthService} from './auth.service';

describe('separate official result consent in participant account',()=>{
 const db:any={
  user:{findUnique:jest.fn(),update:jest.fn()},
  siteSettings:{findUnique:jest.fn()},
  auditLog:{create:jest.fn()},
  $transaction:jest.fn(async (cb:any)=>cb(db)),
 };
 const service=new AuthService(db,{} as any,{} as any);
 beforeEach(()=>{
  jest.clearAllMocks();
  db.siteSettings.findUnique.mockResolvedValue({legal:{
   legalApproved:true,legalVersion:'1',ipName:'USD',
   operatorAddress:'Legal address',personalDataEmail:'privacy@example.org',
   privacyText:'Policy',consentText:'Privacy consent',termsText:'Terms',
   documents:{officialProtocolConsent:{targetId:'legal-document-officialProtocolConsent-test1',url:'https://example.org/consent.docx'}},
  },contacts:{email:'contact@example.org'},footer:{}});
  db.user.findUnique.mockResolvedValue({id:'u1',participantId:'p1',protocolConsentAt:null,
    protocolConsentVersion:null,protocolConsentRevokedAt:null});
  db.user.update.mockResolvedValue({id:'u1'});
  db.auditLog.create.mockResolvedValue({});
 });
 it('alerts a minor that a representative must provide agreement at the venue',async()=>{
  db.user.findUnique.mockResolvedValue({
   id:'u1',participantId:'p1',participant:{birthDate:new Date('2010-01-01T00:00:00.000Z')},
   protocolConsentAt:null,protocolConsentVersion:null,protocolConsentRevokedAt:null,
  });
  const state:any=await service.getProtocolConsent('u1');
  expect(state).toMatchObject({accepted:false,requiresRepresentative:true});
  await expect(service.updateProtocolConsent('u1',true,'1@legal-document-officialProtocolConsent-test1'))
    .rejects.toThrow('несовершеннолетнего');
  expect(db.user.update).not.toHaveBeenCalled();
 });
 it('does not infer protocol consent from generic legal approval',async()=>{
  const state:any=await service.getProtocolConsent('u1');
  expect(state).toMatchObject({version:'1@legal-document-officialProtocolConsent-test1',accepted:false});
 });
 it('records independent affirmative protocol consent, version, time and audit evidence',async()=>{
  const result:any=await service.updateProtocolConsent('u1',true,'1@legal-document-officialProtocolConsent-test1');
  expect(result).toMatchObject({accepted:true,version:'1@legal-document-officialProtocolConsent-test1'});
  expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({
    protocolConsentAt:expect.any(Date),protocolConsentVersion:'protocol-v1@legal-document-officialProtocolConsent-test1',
    protocolConsentRevokedAt:null,
   }),
  }));
  expect(db.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({action:'PROTOCOL_PUBLICATION_CONSENT_ACCEPTED'})
  }));
 });
 it('supports documented withdrawal and disallows using the old consent',async()=>{
  const result:any=await service.updateProtocolConsent('u1',false);
  expect(result.accepted).toBe(false);
  expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({protocolConsentRevokedAt:expect.any(Date)})
  }));
 });
 it('never records agreement to a newer unseen version of the legal document',async()=>{
  await expect(service.updateProtocolConsent('u1',true,'outdated'))
    .rejects.toThrow('Редакция текста изменилась');
  expect(db.user.update).not.toHaveBeenCalled();
 });

 it('allows withdrawal even if the approved legal text was unpublished',async()=>{
  db.siteSettings.findUnique.mockResolvedValue({legal:{legalApproved:false}});
  const withdrawn=await service.updateProtocolConsent('u1',false);
  expect(withdrawn.accepted).toBe(false);
  expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({protocolConsentRevokedAt:expect.any(Date)}),
  }));
 });

 it('refuses confirmation if separate protocol publication terms were not uploaded and approved',async()=>{
  db.siteSettings.findUnique.mockResolvedValue({legal:{legalApproved:true,legalVersion:'1',ipName:'USD',
   operatorAddress:'Legal address',personalDataEmail:'privacy@example.org',privacyText:'Policy',consentText:'Privacy consent',termsText:'Terms'},
   contacts:{email:'contact@example.org'}});
  await expect(service.updateProtocolConsent('u1',true,'1')).rejects.toThrow('Отдельный текст согласия');
  const state=await service.getProtocolConsent('u1');
  expect(state.legalReady).toBe(false);
  expect(db.user.update).not.toHaveBeenCalled();
 });
 it('refuses a consent before approved legal texts are present',async()=>{
  db.siteSettings.findUnique.mockResolvedValue({legal:{legalApproved:false}});
  await expect(service.updateProtocolConsent('u1',true,'1')).rejects.toThrow();
  expect(db.user.update).not.toHaveBeenCalled();
 });
});
