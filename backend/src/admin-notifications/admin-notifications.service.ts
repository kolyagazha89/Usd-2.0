import {BadRequestException,ForbiddenException,Injectable,Logger,NotFoundException,OnModuleDestroy,OnModuleInit} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {Prisma} from '../generated/prisma/client';
import {catalogRequestNotification} from './admin-notification-event';

type InboxStatus='all'|'unread'|'read'|'done';
@Injectable()
export class AdminNotificationsService implements OnModuleInit,OnModuleDestroy {
 private readonly logger=new Logger(AdminNotificationsService.name);
 private timer?:ReturnType<typeof setInterval>;
 private syncing?:Promise<void>;
 constructor(private readonly db:PrismaService){}
 onModuleInit(){
  const sync=()=>void this.syncSources().catch(()=>this.logger.warn('Administrative inbox sync unavailable; no source details logged'));
  this.timer=setInterval(sync,60000);this.timer.unref();sync();
 }
 onModuleDestroy(){if(this.timer)clearInterval(this.timer)}
 private async requireAdmin(userId:string){
  const actor=await this.db.user.findUnique({where:{id:userId},select:{role:true,isActive:true,emailVerifiedAt:true}});
  if(actor?.role!=='ADMIN'||!actor.isActive||!actor.emailVerifiedAt)throw new ForbiddenException('Уведомления доступны только активному ADMIN');
 }
 /** Recover committed events after restart without email, PII or duplicate tasks.
  * Existing source rows remain the source of truth; no changes to identities.
  */
 async syncSources():Promise<void>{
  if(this.syncing)return this.syncing;
  this.syncing=this.recoverSources().finally(()=>{this.syncing=undefined});
  return this.syncing;
 }
 private async recoverSources(){
  const since=new Date(Date.now()-86400000);
  const [catalog,claims,links]=await Promise.all([
   this.db.componentCatalogRequest.findMany({where:{status:'PENDING',createdAt:{gte:since}},select:{id:true,createdAt:true},take:500,orderBy:{createdAt:'desc'}}),
   this.db.profileLinkRequest.findMany({where:{status:'PENDING',createdAt:{gte:since}},select:{id:true,createdAt:true},take:500,orderBy:{createdAt:'desc'}}),
   this.db.auditLog.findMany({where:{action:{in:['PARTICIPANT_PROFILE_LINKED','PROFILE_LINK_APPROVED']},createdAt:{gte:since}},select:{id:true,createdAt:true},take:500,orderBy:{createdAt:'desc'}}),
  ]);
  const data=[...catalog.map(catalogRequestNotification),
   ...claims.map(row=>({eventKey:'profile-link-request:'+row.id,kind:'PROFILE_LINK_REQUEST',sourceId:row.id,createdAt:row.createdAt,
    title:'Заявка на привязку профиля',body:'Проверьте принадлежность исторического профиля участнику.',path:'/admin/profile-links'})),
   ...links.map(row=>({eventKey:'profile-linked:'+row.id,kind:'PROFILE_LINKED',sourceId:row.id,createdAt:row.createdAt,
    title:'Профиль присоединён',body:'Существующий профиль участника успешно привязан к аккаунту USD.',path:'/admin/participants'})),
  ];
  if(data.length)await this.db.adminNotification.createMany({data,skipDuplicates:true});
 }
 private filter(userId:string,status:InboxStatus):Prisma.AdminNotificationWhereInput{
  if(status==='done')return {completedAt:{not:null}};
  if(status==='read')return {completedAt:null,reads:{some:{userId}}};
  if(status==='unread')return {completedAt:null,reads:{none:{userId}}};
  return {};
 }
 async list(userId:string,status:InboxStatus='all',cursor?:string){
  await this.requireAdmin(userId);
  if(!['all','unread','read','done'].includes(status))throw new BadRequestException('Неизвестный статус');
  await this.syncSources();
  return this.db.$transaction(async tx=>{
   const [rows,unread,read,done]=await Promise.all([
    tx.adminNotification.findMany({where:this.filter(userId,status),orderBy:[{createdAt:'desc'},{id:'desc'}],take:31,
     ...(cursor?{cursor:{id:cursor},skip:1}:{}),include:{reads:{where:{userId},select:{readAt:true}}}}),
    tx.adminNotification.count({where:this.filter(userId,'unread')}),
    tx.adminNotification.count({where:this.filter(userId,'read')}),
    tx.adminNotification.count({where:this.filter(userId,'done')}),
   ]);
   const items=rows.slice(0,30).map(({reads,completedByUserId:_completedBy,...row})=>({...row,
    status:row.completedAt?'DONE':reads.length?'READ':'UNREAD',readAt:reads[0]?.readAt??null}));
   return {items,counts:{unread,read,done,total:unread+read+done},nextCursor:rows.length>30?items.at(-1)?.id??null:null};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 }
 async summary(userId:string){
  await this.requireAdmin(userId);await this.syncSources();
  return {unread:await this.db.adminNotification.count({where:this.filter(userId,'unread')})};
 }
 async update(userId:string,id:string,status:'READ'|'DONE'){
  await this.requireAdmin(userId);
  if(!['READ','DONE'].includes(status))throw new BadRequestException('Неизвестный статус');
  return this.db.$transaction(async tx=>{
   const notice=await tx.adminNotification.findUnique({where:{id},select:{id:true,completedAt:true}});
   if(!notice)throw new NotFoundException('Уведомление не найдено');
   await tx.adminNotificationRead.upsert({where:{notificationId_userId:{notificationId:id,userId}},create:{notificationId:id,userId},update:{}});
   if(status==='DONE'){
    const changed=await tx.adminNotification.updateMany({where:{id,completedAt:null},data:{completedAt:new Date(),completedByUserId:userId}});
    if(changed.count)await tx.auditLog.create({data:{userId,action:'ADMIN_NOTIFICATION_COMPLETED',entity:'AdminNotification',entityId:id}});
   }
   return {success:true};
  });
 }
}
