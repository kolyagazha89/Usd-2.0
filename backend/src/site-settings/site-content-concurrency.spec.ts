import { BadRequestException, ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { PrismaService } from '../prisma/prisma.service';
import { SiteSettingsService } from './site-settings.service';
import { withSettingsTransaction } from './test-transaction';
import { siteContentRevision } from './site-content-concurrency';

function fixture(){
 let saved:any=null;
 const prisma={
  siteSettings:{
   findUnique:jest.fn().mockImplementation(async()=>saved),
   upsert:jest.fn().mockImplementation(async(args:any)=>{
    saved={id:'default',...(saved?args.update:args.create)};
    return saved;
   }),
  },
  auditLog:{create:jest.fn().mockResolvedValue({})},
 } as unknown as PrismaService;
 const service=new SiteSettingsService(withSettingsTransaction(prisma));
 return {service,prisma,record:()=>saved};
}

describe('CMS news and partner optimistic revisions',()=>{
 it('new ADMIN payload contains separate version tokens for news and partners, not public',async()=>{
  const {service}=fixture();
  const admin=await service.getAdmin();
  expect(admin.settings).toMatchObject({
   _newsRevision:siteContentRevision([]),
   _partnersRevision:siteContentRevision([]),
  });
  const publicSettings=await service.getPublic();
  expect(publicSettings.settings).not.toHaveProperty('_newsRevision');
  expect(publicSettings.settings).not.toHaveProperty('_partnersRevision');
 });
 it('rejects blind news replacement without version before write or audit',async()=>{
  const {service,prisma}=fixture();
  await expect(service.update({news:[{id:'news-1',title:'First',isPublished:false}]} as any,'admin')).rejects.toThrow(ConflictException);
  expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  expect(prisma.auditLog.create).not.toHaveBeenCalled();
 });
 it('rejects stale news editor but accepts refresh; unrelated CMS edits do not invalidate news revision',async()=>{
  const {service,prisma,record}=fixture();
  const old=(await service.getAdmin()).settings._newsRevision;
  const news1={id:'news-one',title:'One',isPublished:false};
  await service.update({_newsRevision:old,news:[news1]} as any,'admin-one');
  const oneRevision=(await service.getAdmin()).settings._newsRevision;
  expect(oneRevision).not.toBe(old);
  await service.update({branding:{siteName:'USD Test'}} as any,'admin-two');
  expect((await service.getAdmin()).settings._newsRevision).toBe(oneRevision);
  await expect(service.update({_newsRevision:old,news:[{id:'news-two',title:'Two'}]} as any,'admin-two'))
   .rejects.toThrow(ConflictException);
  expect(record().news).toEqual([news1]);
  const news2={id:'news-two',title:'Two',isPublished:false};
  await service.update({_newsRevision:oneRevision,news:[news1,news2]} as any,'admin-two');
  expect(record().news).toEqual([news1,news2]);
  expect(prisma.auditLog.create).toHaveBeenCalledTimes(3);
 });
 it('rejects stale partner edit while leaving other partners intact and can retry',async()=>{
  const {service,record}=fixture();
  const revision=(await service.getAdmin()).settings._partnersRevision;
  const initial={id:'studio-one',name:'USD Studio',tier:'STUDIO',isPublished:false,isActive:true};
  await service.update({_partnersRevision:revision,partners:[initial]} as any,'admin-one');
  const fresh=(await service.getAdmin()).settings._partnersRevision;
  await expect(service.update({_partnersRevision:revision,partners:[]} as any,'admin-two'))
   .rejects.toThrow(ConflictException);
  expect(record().partners).toEqual([initial]);
  await service.update({_partnersRevision:fresh,partners:[{...initial,isPublished:true}]} as any,'admin-two');
  expect((await service.getPublic()).settings.partners).toEqual([{...initial,isPublished:true}]);
 });
 it('requires token matching the correct section and refuses cross-section reuse',async()=>{
  const {service}=fixture();
  const first=(await service.getAdmin()).settings;
  await service.update({_newsRevision:first._newsRevision,news:[{id:'one',title:'One',isPublished:false}]} as any,'admin');
  const current=(await service.getAdmin()).settings;
  await expect(service.update({_newsRevision:current._partnersRevision,news:[]} as any,'admin'))
   .rejects.toThrow(ConflictException);
 });
 it('rejects empty revision and does not log CMS content on conflict',async()=>{
  const {service,prisma}=fixture();
  const logger=jest.spyOn((service as any).logger,'error').mockImplementation(()=>undefined);
  await expect(service.update({_newsRevision:'',news:[{id:'private',title:'Private title'}]} as any,'admin'))
   .rejects.toThrow(ConflictException);
  expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  expect(prisma.auditLog.create).not.toHaveBeenCalled();
  expect(logger).not.toHaveBeenCalled();
 });
});
