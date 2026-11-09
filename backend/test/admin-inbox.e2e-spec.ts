import {randomUUID} from 'node:crypto';
import {ForbiddenException} from '@nestjs/common';
import {PrismaService} from '../src/prisma/prisma.service';
import {AdminNotificationsService} from '../src/admin-notifications/admin-notifications.service';
import {ComponentCatalogRequestsService} from '../src/component-catalog-requests/component-catalog-requests.service';
import {PushService} from '../src/push/push.service';
const suite=process.env.USD_ADMIN_INBOX_TEST==='1'?describe:describe.skip;
suite('administrative inbox, read isolation, queued PUSH and rollback on isolated PostgreSQL18',()=>{
 let db:PrismaService,inbox:AdminNotificationsService,requests:ComponentCatalogRequestsService;
 let admin:string,other:string,participant:string;
 const ids:string[]=[];
 const mail={sendNotificationEmail:async()=>{throw Error('Administrative request email must not be called')}};
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??'');
  if(!['postgres:','postgresql:'].includes(url.protocol)||!['127.0.0.1','localhost'].includes(url.hostname)||!/^\/usd_(?:identity_auth|admin_inbox)_[a-z0-9_]+$/.test(url.pathname)||url.search||url.hash)throw Error('Disposable loopback admin inbox database required');
  db=new PrismaService();await db.$connect();
  const version=await db.$queryRaw<Array<{version:string}>>`SELECT current_setting('server_version_num') AS version`;
  if(Number(version[0].version)<180000||Number(version[0].version)>=190000)throw Error('PostgreSQL18 required');
  if(await db.adminNotification.count()||await db.pushSubscription.count())throw Error('Refusing nonempty notification fixture');
  const create=async(role:'ADMIN'|'PARTICIPANT')=>{const id=randomUUID();ids.push(id);await db.user.create({data:{id,email:id+'@admin-inbox.invalid',passwordHash:'synthetic-unused',role,emailVerifiedAt:new Date()}});return id};
  [admin,other,participant]=await Promise.all([create('ADMIN'),create('ADMIN'),create('PARTICIPANT')]);
  inbox=new AdminNotificationsService(db);requests=new ComponentCatalogRequestsService(db,mail as never);
 });
 afterAll(async()=>{
  if(!db)return;
  await db.pushMessage.deleteMany({where:{category:'catalogRequests'}});
  await db.pushSubscription.deleteMany({where:{userId:{in:ids}}});
  await db.auditLog.deleteMany({where:{userId:{in:ids}}});
  await db.adminNotification.deleteMany({where:{kind:'CATALOG_REQUEST'}});
  await db.componentCatalogRequest.deleteMany({where:{userId:{in:ids}}});
  await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
 });
 it('creates one durable event without email and isolates per-admin receipts before shared completion',async()=>{
  const result=await requests.create(participant,{category:'AMPLIFIER',brand:'Synthetic',model:randomUUID()});
  const notice=await db.adminNotification.findUniqueOrThrow({where:{eventKey:'catalog-request:'+result.requestId}});
  await inbox.syncSources();await inbox.syncSources();
  expect(await db.adminNotification.count({where:{eventKey:notice.eventKey}})).toBe(1);
  await expect(inbox.list(participant)).rejects.toBeInstanceOf(ForbiddenException);
  await inbox.update(admin,notice.id,'READ');await inbox.update(admin,notice.id,'READ');
  expect((await inbox.list(admin,'read')).items.map(x=>x.id)).toContain(notice.id);
  expect((await inbox.list(other,'unread')).items.map(x=>x.id)).toContain(notice.id);
  await Promise.all([inbox.update(admin,notice.id,'DONE'),inbox.update(other,notice.id,'DONE')]);
  expect((await inbox.list(other,'done')).items.map(x=>x.id)).toContain(notice.id);
  expect(await db.auditLog.count({where:{entityId:notice.id,action:'ADMIN_NOTIFICATION_COMPLETED'}})).toBe(1);
 });
 it('rolls the saved request back when inbox insertion fails inside the transaction',async()=>{
  const before=await db.componentCatalogRequest.count({where:{userId:participant}});
  const boundary=new Proxy(db,{get(target,key){
   if(key==='$transaction')return(callback:any)=>db.$transaction(tx=>callback(new Proxy(tx,{get(client,model){
    if(model==='adminNotification')return {create:async()=>{throw Error('synthetic inbox write failure')}};
    return Reflect.get(client,model);
   }})));
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  await expect(new ComponentCatalogRequestsService(boundary,mail as never).create(participant,{category:'AMPLIFIER',brand:'Synthetic',model:randomUUID()})).rejects.toThrow('synthetic inbox write failure');
  expect(await db.componentCatalogRequest.count({where:{userId:participant}})).toBe(before);
 });
 it('queues only consenting ADMIN devices and delivers once across scheduler retries',async()=>{
  for(const [userId,announcements]of [[admin,true],[other,false],[participant,true]] as const)await db.pushSubscription.create({data:{userId,endpoint:'https://fcm.googleapis.com/fcm/send/synthetic-'+userId,p256dh:'synthetic',auth:'synthetic',announcements,consentAt:new Date(),consentVersion:'web-push-v1'}});
  const result=await requests.create(participant,{category:'AMPLIFIER',brand:'Synthetic',model:randomUUID()});
  let sends=0;
  const transport={configured:()=>true,send:async()=>{sends++;return 201}};
  const push=new PushService(db,transport as never,{} as never);
  await push.scheduleCatalogRequests();await push.scheduleCatalogRequests();
  const message=await db.pushMessage.findUniqueOrThrow({where:{eventKey:'catalog-request:'+result.requestId},include:{deliveries:true}});
  expect(message.deliveries).toHaveLength(1);
  await push.processQueue();await push.processQueue();expect(sends).toBe(1);
  expect((await db.pushDelivery.findUniqueOrThrow({where:{id:message.deliveries[0].id}})).status).toBe('PROVIDER_ACCEPTED');
 });
});
