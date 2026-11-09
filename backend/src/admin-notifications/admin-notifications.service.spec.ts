import {jest} from '@jest/globals';
import {ForbiddenException} from '@nestjs/common';
import {AdminNotificationsService} from './admin-notifications.service';

describe('administrative inbox',()=>{
 const fixture=()=>{
  const db:any={user:{findUnique:jest.fn(async()=>({role:'ADMIN',isActive:true,emailVerifiedAt:new Date()}))},
   adminNotification:{findMany:jest.fn(async()=>[{id:'notice',title:'USD',reads:[],completedAt:null}]),count:jest.fn(async()=>1),findUnique:jest.fn(async()=>({id:'notice',completedAt:null})),updateMany:jest.fn(async()=>({count:1})),createMany:jest.fn(async()=>({count:1}))},
   adminNotificationRead:{upsert:jest.fn(async()=>({}))},auditLog:{create:jest.fn(async()=>({})),findMany:jest.fn(async()=>[])},
   componentCatalogRequest:{findMany:jest.fn(async()=>[])},profileLinkRequest:{findMany:jest.fn(async()=>[])},
  };
  db.$transaction=async(fn:any)=>fn(db);
  return {db,service:new AdminNotificationsService(db)};
 };
 it.each(['PARTICIPANT','JUDGE'])('denies %s even when a custom role grants notifications permission',async role=>{
  const {db,service}=fixture();db.user.findUnique.mockResolvedValueOnce({role,isActive:true,emailVerifiedAt:new Date()});
  await expect(service.list('judge')).rejects.toBeInstanceOf(ForbiddenException);
  expect(db.adminNotification.findMany).not.toHaveBeenCalled();
 });
 it('read filtering and count use the requesting administrator, never another user',async()=>{
  const {db,service}=fixture();
  const result=await service.list('admin-one','unread');
  expect(result.items[0].status).toBe('UNREAD');
  expect(db.adminNotification.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{completedAt:null,reads:{none:{userId:'admin-one'}}},include:{reads:{where:{userId:'admin-one'},select:{readAt:true}}}}));
  expect(JSON.stringify(result.items)).not.toContain('reads');
 });
 it('marking read is idempotent and cannot reset shared completion',async()=>{
  const {db,service}=fixture();await service.update('admin-one','notice','READ');
  expect(db.adminNotificationRead.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{notificationId_userId:{notificationId:'notice',userId:'admin-one'}},update:{}}));
  expect(db.adminNotification.updateMany).not.toHaveBeenCalled();
 });
 it('completion uses a guarded write and only audits the winning transition',async()=>{
  const {db,service}=fixture();await service.update('admin-one','notice','DONE');
  expect(db.adminNotification.updateMany).toHaveBeenCalledWith({where:{id:'notice',completedAt:null},data:{completedAt:expect.any(Date),completedByUserId:'admin-one'}});
  expect(db.auditLog.create).toHaveBeenCalledTimes(1);
  db.adminNotification.updateMany.mockResolvedValueOnce({count:0});
  await service.update('admin-one','notice','DONE');
  expect(db.auditLog.create).toHaveBeenCalledTimes(1);
 });
});
