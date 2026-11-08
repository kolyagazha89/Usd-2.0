import {jest} from '@jest/globals';
import {BadRequestException} from '@nestjs/common';
import {ROLES_KEY} from '../auth/roles.decorator';
import {MailController} from './mail.controller';
import {MailService} from './mail.service';

const id='123e4567-e89b-42d3-a456-426614174017';

describe('admin-only mail delivery journal',()=>{
 const create=()=>{
  const prisma:any={emailNotificationLog:{
   findMany:jest.fn(async()=>[{id,type:'AUTH_EMAIL_VERIFICATION',recipient:'participant@example.com',status:'PROVIDER_ACCEPTED',attempts:1,createdAt:new Date(),providerAcceptedAt:new Date()}]),
   create:jest.fn(async(data:any)=>data),
  }};
  return {prisma,mail:new MailService(prisma)};
 };
 it('is ADMIN-only and exposes bounded delivery metadata, not message bodies or token URLs',async()=>{
  const {prisma,mail}=create();
  const c=new MailController(mail,{} as any);
  expect(Reflect.getMetadata(ROLES_KEY,MailController.prototype.deliveryJournal)).toEqual(['ADMIN']);
  const result=await c.deliveryJournal('PROVIDER_ACCEPTED',undefined);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]).toEqual(expect.objectContaining({type:'AUTH_EMAIL_VERIFICATION',status:'PROVIDER_ACCEPTED'}));
  expect(prisma.emailNotificationLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
   take:51,select:expect.objectContaining({id:true,type:true,recipient:true,status:true,createdAt:true,attempts:true}),
  }));
  expect(JSON.stringify(result)).not.toMatch(/token=|passwordHash|smtp_password/i);
 });
 it('refuses arbitrary status and malformed pagination token',async()=>{
  const {mail}=create();
  await expect(mail.listDeliveryJournal('DELETE')).rejects.toBeInstanceOf(BadRequestException);
  await expect(mail.listDeliveryJournal(undefined,'not-uuid')).rejects.toBeInstanceOf(BadRequestException);
 });
 it('logs acceptance for account emails without storing the secret link or token',async()=>{
  const {prisma,mail}=create();
  (mail as any).sendMessage=jest.fn(async()=>undefined);
  await mail.sendVerificationEmail('participant@example.com','sensitive-one-time-secret');
  expect(prisma.emailNotificationLog.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({
    type:'AUTH_EMAIL_VERIFICATION',recipient:'participant@example.com',
    status:'PROVIDER_ACCEPTED',attempts:1,
   }),
  }));
  const record=prisma.emailNotificationLog.create.mock.calls[0][0].data;
  expect(JSON.stringify(record)).not.toMatch(/sensitive-one-time-secret|token=|https?:/);
 });
 it('records sanitized failure without masking an auth email transport failure',async()=>{
  const {prisma,mail}=create();
  (mail as any).sendMessage=jest.fn(async()=>{throw new Error('https://evil.test/?token=SUPERSECRET');});
  await expect(mail.sendPasswordResetEmail('participant@example.com','top-secret')).rejects.toThrow();
  const record=prisma.emailNotificationLog.create.mock.calls[0][0].data;
  expect(record.status).toBe('FAILED');
  expect(JSON.stringify(record)).not.toMatch(/SUPERSECRET|top-secret|https?:/);
 });
 it('a database journal outage never makes an already accepted account email fail',async()=>{
  const {prisma,mail}=create();
  prisma.emailNotificationLog.create.mockRejectedValueOnce(new Error('database offline'));
  (mail as any).sendMessage=jest.fn(async()=>undefined);
  await expect(mail.sendEmailChangeEmail('participant@example.com','a-secret')).resolves.toBeUndefined();
 });
});
