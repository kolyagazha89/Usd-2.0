import {jest} from '@jest/globals';
import {PushService} from './push.service';
describe('administrator equipment-request PUSH',()=>{
 const fixture=()=>{
  const messages=new Map<string,any>();
  const db:any={adminNotification:{findMany:jest.fn(async()=>[{eventKey:'catalog-request:request',sourceId:'request'}]),findUnique:jest.fn(async()=>({completedAt:null}))},
   componentCatalogRequest:{findUnique:jest.fn(async()=>({status:'PENDING'}))},
   pushSubscription:{findMany:jest.fn(async()=>[{id:'device'}])},
   pushMessage:{findUnique:jest.fn(async({where}:any)=>messages.get(where.eventKey)),create:jest.fn(async({data}:any)=>{messages.set(data.eventKey,data);return data})}};
  db.$transaction=async(fn:any)=>fn(db);
  const transport:any={configured:()=>true,send:jest.fn(async()=>201)};
  return {db,transport,service:new PushService(db,transport,{} as never)};
 };
 it('queues one generic notification per request for opted-in active verified ADMIN devices',async()=>{
  const {db,service}=fixture();await service.scheduleCatalogRequests();await service.scheduleCatalogRequests();
  expect(db.pushMessage.create).toHaveBeenCalledTimes(1);
  expect(db.pushMessage.create).toHaveBeenCalledWith({data:expect.objectContaining({eventKey:'catalog-request:request',category:'catalogRequests',path:'/admin/inbox'})});
  expect(db.pushSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({announcements:true,user:{role:'ADMIN',isActive:true,emailVerifiedAt:{not:null}}})}));
 });
 it.each([['ADMIN',true,'PENDING',false,true],['PARTICIPANT',true,'PENDING',false,false],['ADMIN',false,'PENDING',false,false],['ADMIN',true,'APPROVED',false,false],['ADMIN',true,'PENDING',true,false]])('delivery rechecks role %s, consent %s, request %s, completion %s',async(role,announcements,status,done,sends)=>{
  const {db,transport,service}=fixture();
  db.adminNotification.findUnique.mockResolvedValueOnce({completedAt:done?new Date():null});
  db.componentCatalogRequest.findUnique.mockResolvedValueOnce({status});
  db.pushSubscription.findUnique=async()=>({announcements,user:{role,isActive:true,emailVerifiedAt:new Date()}});
  db.pushDelivery={findMany:async()=>[{id:'delivery',subscriptionId:'device',status:'PENDING',attempts:0,message:{id:'message',eventKey:'catalog-request:request',category:'catalogRequests',createdAt:new Date(),path:'/admin/inbox',title:'USD',body:'Запрос оборудования'}}],updateMany:async()=>({count:1}),update:jest.fn(async()=>({}))};
  await service.processQueue();expect(transport.send).toHaveBeenCalledTimes(sends?1:0);
 });
});
