import {jest} from '@jest/globals';
import {EmailNotificationsService} from './email-notifications.service';

describe('ADMIN-approved critical stage email',()=>{
 const beforeAccount=process.env.MAIL_ACCOUNT_ONLY;
 const beforeCritical=process.env.MAIL_CRITICAL_STAGE_NOTICES_ENABLED;
 const prisma:any={
  registration:{findMany:jest.fn()},
  siteSettings:{findUnique:jest.fn()},
  emailNotificationLog:{
   findUnique:jest.fn(),create:jest.fn(),updateMany:jest.fn(),update:jest.fn(),
  },
 };
 const mail:any={getDeliveryStatus:jest.fn(),sendNotificationEmail:jest.fn()};
 const stage={id:'stage-1',name:'USD Краснодар',stageNumber:2,status:'PUBLISHED',
  date:new Date('2026-12-05T12:00:00Z'),startTimeMsk:'10:00',
  city:'Краснодар',venue:'Новая площадка',address:'Новая улица, 1'};
 let service:EmailNotificationsService;
 beforeEach(()=>{
  process.env.MAIL_ACCOUNT_ONLY='true';
  process.env.MAIL_CRITICAL_STAGE_NOTICES_ENABLED='true';
  jest.clearAllMocks();
  mail.getDeliveryStatus.mockReturnValue({ready:true});
  prisma.siteSettings.findUnique.mockResolvedValue({branding:{},registration:{}});
  prisma.emailNotificationLog.findUnique.mockResolvedValue(null);
  prisma.emailNotificationLog.create.mockResolvedValue({id:'mail-1',status:'PENDING',attempts:0,updatedAt:new Date()});
  prisma.emailNotificationLog.updateMany.mockResolvedValue({count:1});
  prisma.emailNotificationLog.update.mockResolvedValue({});
  mail.sendNotificationEmail.mockResolvedValue(undefined);
  prisma.registration.findMany.mockResolvedValue([
   {id:'r1',participant:{user:{id:'u1',email:'verified@example.com',emailVerifiedAt:new Date(),isActive:true,newsletterConsentAt:null}}},
   {id:'r2',participant:{user:{id:'u1',email:'verified@example.com',emailVerifiedAt:new Date(),isActive:true}}},
   {id:'r3',participant:{user:{id:'u2',email:'other@example.com',emailVerifiedAt:null,isActive:true}}},
   {id:'r4',participant:{user:null}},
  ]);
  service=new EmailNotificationsService(prisma,mail);
 });
 afterAll(()=>{
  if(beforeAccount===undefined)delete process.env.MAIL_ACCOUNT_ONLY;
  else process.env.MAIL_ACCOUNT_ONLY=beforeAccount;
  if(beforeCritical===undefined)delete process.env.MAIL_CRITICAL_STAGE_NOTICES_ENABLED;
  else process.env.MAIL_CRITICAL_STAGE_NOTICES_ENABLED=beforeCritical;
 });
 it('in account-only mode sends one operational email per verified active account, regardless of marketing consent',async()=>{
  const result=await service.sendCriticalStageNotice(stage,['date','address'],3,async()=>true);
  expect(result).toEqual({total:1,accepted:1,failed:0,interrupted:false});
  expect(mail.sendNotificationEmail).toHaveBeenCalledTimes(1);
  const sent=mail.sendNotificationEmail.mock.calls[0][0];
  expect(sent.to).toBe('verified@example.com');
  expect(sent.text).toContain('Дата:');
  expect(sent.text).toContain('Новая улица, 1');
  expect(sent.text).toContain('10:00 МСК');
  expect(sent.text).not.toContain('Классы:');
  expect(prisma.emailNotificationLog.create).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({eventKey:'stage-critical:stage-1:3:u1',type:'STAGE_CHANGED',registrationId:'r1'}),
  }));
 });
 it('does not resend a message previously accepted for the same recipient and revision',async()=>{
  prisma.emailNotificationLog.findUnique.mockResolvedValue({
   id:'accepted',status:'PROVIDER_ACCEPTED',attempts:1,updatedAt:new Date(),
  });
  const summary=await service.sendCriticalStageNotice(stage,['address'],3,async()=>true);
  expect(summary).toMatchObject({total:1,accepted:1,failed:0});
  expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
  expect(prisma.emailNotificationLog.create).not.toHaveBeenCalled();
 });
 it('aborts queued recipients when a stage was edited concurrently',async()=>{
  const summary=await service.sendCriticalStageNotice(stage,['venue'],3,async()=>false);
  expect(summary).toEqual({total:1,accepted:0,failed:0,interrupted:true});
  expect(prisma.emailNotificationLog.create).not.toHaveBeenCalled();
  expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
 });
 it('does not allow non-operational automatic bulk email in account-only mode',async()=>{
  await (service as any).dispatch({eventKey:'stage-open',type:'STAGE_REGISTRATION_OPEN',
    recipient:'verified@example.com',stageId:'stage-1',subject:'open',heading:'open',intro:'',details:[],href:'https://usd-russia.ru'},false);
  expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
 });
 it('does not send even manual mail if operational flag is off',async()=>{
  process.env.MAIL_CRITICAL_STAGE_NOTICES_ENABLED='false';
  expect(service.criticalStageMailReadiness().ready).toBe(false);
  await expect(service.sendCriticalStageNotice(stage,['address'],4,async()=>true)).rejects.toThrow(/не настроена/);
  expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
 });
 it('uses cancelled-stage subject and tracks provider failure without claiming delivery',async()=>{
  mail.sendNotificationEmail.mockRejectedValue(new Error('provider unavailable'));
  const summary=await service.sendCriticalStageNotice({...stage,status:'CANCELLED'},['cancelled'],4,async()=>true);
  expect(summary).toMatchObject({accepted:0,failed:1});
  expect(mail.sendNotificationEmail.mock.calls[0][0].subject).toContain('отменён');
  expect(prisma.emailNotificationLog.update).toHaveBeenCalledWith(expect.objectContaining({
   data:expect.objectContaining({status:'FAILED'}),
  }));
 });
});
