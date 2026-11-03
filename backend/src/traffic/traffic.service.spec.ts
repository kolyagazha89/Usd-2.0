import {BadRequestException,ForbiddenException} from '@nestjs/common';
import {TrafficService,normalizeTrafficPath,trafficDevice,summarizeTrafficRows} from './traffic.service';

describe('privacy-first USD traffic analytics',()=>{
 const previous=process.env.CORS_ORIGINS;
 afterAll(()=>{if(previous===undefined)delete process.env.CORS_ORIGINS;else process.env.CORS_ORIGINS=previous});
 it('never persists per-person names, numbers, profile paths or querystrings',()=>{
  for(const value of ['/','/stages/a-b-c?token=123','/participants/secret-profile','/results?stageId=x','/privacy#heading'])
   expect(normalizeTrafficPath(value)).toBe(value==='/'?'/':value.startsWith('/stages')?'/stages':value.startsWith('/participants')?'/participants':value.startsWith('/results')?'/results':'/privacy');
  for(const invalid of ['https://malware.example','/admin','/participant','/usd-id/secret','/auth/login',null,'/stages%2Fadmin'])
   expect(normalizeTrafficPath(invalid)).toBeNull();
 });
 it('classifies only coarse device types and ignores crawlers',()=>{
  expect(trafficDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Safari')).toBe('mobile');
  expect(trafficDevice('Mozilla/5.0 (iPad; CPU OS 17) AppleWebKit Safari')).toBe('tablet');
  expect(trafficDevice('Mozilla/5.0 (Windows NT 10.0; Win64) Chrome')).toBe('desktop');
  expect(trafficDevice('Mozilla/5.0 Googlebot crawler Chrome')).toBeNull();
  expect(trafficDevice('unknown')).toBeNull();
 });
 it('rejects arbitrary Origin and rejects nonexistent pages without touching DB',async()=>{
  process.env.CORS_ORIGINS='https://app.usd-russia.ru';
  const auditLog={create:jest.fn()};
  const service=new TrafficService({auditLog} as any);
  await expect(service.record('/','Mozilla/5.0 Chrome','https://evil.example','1.2.3.4')).rejects.toBeInstanceOf(ForbiddenException);
  await expect(service.record('/admin','Mozilla/5.0 Chrome','https://app.usd-russia.ru','1.2.3.4')).rejects.toBeInstanceOf(BadRequestException);
  expect(auditLog.create).not.toHaveBeenCalled();
 });
 it('stores only anonymized page category+device, drops bots and rate limits per minute',async()=>{
  process.env.CORS_ORIGINS='https://app.usd-russia.ru';
  const auditLog={create:jest.fn().mockResolvedValue({})};
  const service=new TrafficService({auditLog} as any);
  const args=['/stages/id?some=secret','Mozilla/5.0 (iPhone) Safari','https://app.usd-russia.ru','1.2.3.4'] as const;
  for(let i=0;i<20;i++)await service.record(...args);
  expect(auditLog.create).toHaveBeenCalledTimes(12);
  expect(auditLog.create).toHaveBeenCalledWith({data:{
   userId:null,ipAddress:null,action:'PUBLIC_PAGE_VIEW',entity:'PublicSite',entityId:'/stages',metadata:{device:'mobile'},
  }});
  await service.record('/','Mozilla/5.0 HeadlessChrome','https://app.usd-russia.ru','1.2.3.4');
  expect(auditLog.create).toHaveBeenCalledTimes(12);
 });
 it('produces exact 30-day aggregates without reporting unique user identities',()=>{
  const report=summarizeTrafficRows([
   {day:'2026-11-01',path:'/stages',device:'mobile',views:5},
   {day:'2026-11-01',path:'/stages',device:'desktop',views:2},
   {day:'2026-11-02',path:'/results',device:'tablet',views:4},
  ]);
  expect(report.views).toBe(11);
  expect(report.devices).toEqual({desktop:2,mobile:5,tablet:4});
  expect(report.pages).toEqual([{path:'/stages',views:7},{path:'/results',views:4}]);
  expect(report.daily).toEqual([{day:'2026-11-01',views:7},{day:'2026-11-02',views:4}]);
  expect(report.uniqueVisitorsAvailable).toBe(false);
 });
 it('gets only aggregated 30-day statistics through SQL without extracting audit identities',async()=>{
  const prisma={$queryRaw:jest.fn().mockResolvedValue([{day:'2026-11-01',path:'/',device:'desktop',views:3}])};
  const service=new TrafficService(prisma as any);
  const report=await service.summary();
  expect(report.views).toBe(3);
  expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
 });
});
