import {AuditService} from './audit.service';

describe('audit journal filters',()=>{
 it('searches actors across the full history, returns full filter options and deterministic pagination',async()=>{
  const db:any={auditLog:{count:jest.fn().mockResolvedValue(62),findMany:jest.fn().mockResolvedValue([]),groupBy:jest.fn().mockResolvedValue([{entity:'Result',action:'RESULT_CREATED'},{entity:'Result',action:'RESULT_CORRECTED'},{entity:'Stage',action:'STAGE_UPDATED'}])}};
  const report=await new AuditService(db).list({page:2,limit:25,entity:'Result',action:'RESULT_CREATED',search:'Иван',from:'2026-11-28',to:'2026-11-28'});
  const args=db.auditLog.findMany.mock.calls[0][0];
  expect(args.where).toMatchObject({entity:'Result',action:'RESULT_CREATED',createdAt:{gte:new Date('2026-11-27T21:00:00Z'),lt:new Date('2026-11-28T21:00:00Z')}});
  expect(args.where.OR).toContainEqual({user:{is:{name:{contains:'Иван',mode:'insensitive'}}}});
  expect(args.skip).toBe(25);expect(args.orderBy).toEqual([{createdAt:'desc'},{id:'desc'}]);
  expect(report.filters).toEqual({entities:['Result','Stage'],actions:['RESULT_CORRECTED','RESULT_CREATED']});
  expect(report.pagination.total).toBe(62);
 });
 it('keeps anonymous traffic out of the default audit and rejects invalid ranges',async()=>{
  const db:any={auditLog:{count:jest.fn().mockResolvedValue(0),findMany:jest.fn().mockResolvedValue([]),groupBy:jest.fn().mockResolvedValue([])}};
  const service=new AuditService(db);
  await service.list({});
  expect(db.auditLog.findMany.mock.calls[0][0].where.action).toEqual({not:'PUBLIC_PAGE_VIEW'});
  await expect(service.list({from:'2026-02-30'})).rejects.toThrow();
  await expect(service.list({from:'2026-11-29',to:'2026-11-28'})).rejects.toThrow();
 });
});
