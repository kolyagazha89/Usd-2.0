import {jest} from '@jest/globals';
import {ComponentCatalogRequestsService} from './component-catalog-requests.service';
describe('equipment requests notify administrators through inbox and PUSH',()=>{
 const fixture=()=>{
  const db:any={user:{findUnique:jest.fn(async()=>({id:'user',email:'synthetic@example.invalid'})),findMany:jest.fn(async()=>[{email:'admin@example.invalid'}])},siteSettings:{findUnique:jest.fn(async()=>({catalogs:{}}))},
   componentCatalogRequest:{findFirst:jest.fn(async()=>null),create:jest.fn(async({data}:any)=>({...data,status:'PENDING'})),update:jest.fn(async()=>({}))},
   adminNotification:{create:jest.fn(async()=>({id:'notice'}))}};
  db.$transaction=jest.fn(async(fn:any)=>fn(db));
  const mail:any={sendNotificationEmail:jest.fn(async()=>({}))};
  return {db,mail,service:new ComponentCatalogRequestsService(db,mail)};
 };
 it('commits request and notification together and never sends an administrative email',async()=>{
  const {db,mail,service}=fixture();const result=await service.create('user',{category:'AMPLIFIER',brand:'Brand',model:'Model'});
  expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect(db.adminNotification.create).toHaveBeenCalledWith({data:expect.objectContaining({eventKey:'catalog-request:'+result.requestId,kind:'CATALOG_REQUEST',sourceId:result.requestId,path:'/admin/components?tab=requests'})});
  expect(result.notificationChannel).toBe('PUSH');
  expect(result).not.toHaveProperty('emailQueued');
 });
});
