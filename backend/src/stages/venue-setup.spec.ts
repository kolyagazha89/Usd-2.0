import { generateKeyPairSync, createHash } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { VenueStageService } from './venue-stage.service';

describe('Venue administration setup',()=>{
 const service=new VenueStageService({} as any);
 const admin={user:{role:'ADMIN',sub:'operator'}} as any;
 const old=process.env.VENUE_STAGE_SIGNING_KEY_B64;
 afterEach(()=>{
  if(old===undefined)delete process.env.VENUE_STAGE_SIGNING_KEY_B64;
  else process.env.VENUE_STAGE_SIGNING_KEY_B64=old;
 });
 it('rejects participants and custom judges even with stage permissions',()=>{
  for(const customRoleId of [undefined,'judge']){
   expect(()=>service.getSetup({user:{role:'PARTICIPANT',customRoleId}} as any)).toThrow(ForbiddenException);
  }
 });
 it('reports missing, invalid and wrong-algorithm keys without leaking their contents',()=>{
  const rsa=generateKeyPairSync('rsa',{modulusLength:2048});
  for(const key of [undefined,'PRIVATE-INVALID-SECRET',Buffer.from(rsa.privateKey.export({type:'pkcs8',format:'pem'})).toString('base64')]){
   if(key===undefined)delete process.env.VENUE_STAGE_SIGNING_KEY_B64;
   else process.env.VENUE_STAGE_SIGNING_KEY_B64=key;
   expect(service.getSetup(admin)).toEqual({
    signing:{ready:false,publicKeyPem:null,fingerprint:null},centralSyncReady:false,fieldAcceptanceComplete:false,
   });
  }
 });
 it('returns only the Ed25519 public key and independently derived fingerprint',()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ed25519');
  const pem=privateKey.export({type:'pkcs8',format:'pem'}).toString();
  process.env.VENUE_STAGE_SIGNING_KEY_B64=Buffer.from(pem).toString('base64');
  const setup=service.getSetup(admin);
  expect(setup.signing).toEqual({ready:true,
   publicKeyPem:publicKey.export({type:'spki',format:'pem'}).toString(),
   fingerprint:createHash('sha256').update(publicKey.export({type:'spki',format:'der'})).digest('hex'),
  });
  expect(JSON.stringify(setup)).not.toContain('PRIVATE KEY');
  expect(JSON.stringify(setup)).not.toContain(pem);
  expect(setup.centralSyncReady).toBe(false);
 });
});
