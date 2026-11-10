import {BadRequestException} from '@nestjs/common';
import {jest} from '@jest/globals';
import {PrismaService} from '../prisma/prisma.service';
import {withSettingsTransaction} from './test-transaction';
import {SiteSettingsService} from './site-settings.service';

function cms(initial:any=null){
 let row=initial;
 const prisma={
  siteSettings:{findUnique:jest.fn().mockImplementation(async()=>row),
   upsert:jest.fn().mockImplementation(async(args:any)=>{row={id:'default',...(row?args.update:args.create)};return row})},
  auditLog:{create:jest.fn().mockResolvedValue({})},
 } as unknown as PrismaService;
 const service=new SiteSettingsService(withSettingsTransaction(prisma));
 return {service,prisma,record:()=>row};
}
const story={id:'story-1',title:'USD news',body:'New article',isPublished:false,publishedAt:null,createdAt:'2026-11-10T08:00:00Z'};
const store=async(service:SiteSettingsService,news:any[])=>{
 const {settings}=await service.getAdmin();
 return service.update({news,_newsRevision:settings._newsRevision} as any,'admin');
};

describe('CMS news publication security',()=>{
 it('keeps drafts entirely private and strips arbitrary metadata from public published stories',async()=>{
  const published={...story,id:'public',isPublished:true,publishedAt:'2026-11-10T08:00:00Z',
   photoUrl:'/media/public-file/SITE_ASSET/news-public',excerpt:'Hello',
   url:'https://example.com/usd',internalNote:'never reveal',file:{name:'internal.jpg'},moderatorEmail:'private@example.test'};
  const {service}=cms({news:[story,published]});
  const admin=(await service.getAdmin()).settings.news;
  expect(admin).toHaveLength(2);
  const pub=(await service.getPublic()).settings.news;
  expect(pub).toEqual([{
   id:'public',title:'USD news',body:'New article',isPublished:true,publishedAt:'2026-11-10T08:00:00Z',
   createdAt:'2026-11-10T08:00:00Z',photoUrl:'/media/public-file/SITE_ASSET/news-public',
   excerpt:'Hello',url:'https://example.com/usd',
  }]);
  expect(JSON.stringify(pub)).not.toContain('private@example.test');
  expect(JSON.stringify(pub)).not.toContain('internal.jpg');
 });
 it('requires a deliberate publication flag and valid date for newly created stories',async()=>{
  const {service,prisma}=cms();
  for(const item of [
   {...story,isPublished:undefined},
   {...story,isPublished:'true'},
   {...story,title:' '},
   {...story,title:'X'.repeat(161)},
   {...story,excerpt:'X'.repeat(501)},
   {...story,url:'javascript:alert(1)'},
   {...story,url:'https://u:p@example.org'},
   {...story,url:'//outside.example'},
   {...story,body:'X'.repeat(30001)},
   {...story,publishedAt:'not-a-date',isPublished:true},
   {...story,isPublished:true,publishedAt:null},
  ]){
   await expect(store(service,[item])).rejects.toThrow(BadRequestException);
  }
  expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  expect(prisma.auditLog.create).not.toHaveBeenCalled();
 });
 it('saves a private draft, publishes explicit date, and hides again without losing timestamp',async()=>{
  const {service}=cms();
  await store(service,[story]);
  expect((await service.getPublic()).settings.news).toEqual([]);
  const live={...story,isPublished:true,publishedAt:'2026-11-10T09:00:00Z'};
  await store(service,[live]);
  expect((await service.getPublic()).settings.news).toMatchObject([live]);
  await store(service,[{...live,isPublished:false}]);
  expect((await service.getPublic()).settings.news).toEqual([]);
  expect((await service.getAdmin()).settings.news[0].publishedAt).toBe('2026-11-10T09:00:00Z');
 });
 it('legacy unchanged items remain roundtrippable, but new malformed items cannot ride along',async()=>{
  const legacy={title:'Imported historical news',body:'Legacy',photoUrl:'/old.png'};
  const {service}=cms({news:[legacy]});
  await store(service,[legacy]);
  await expect(store(service,[legacy,{...story,id:'unsafe',url:'javascript:alert(1)'}]))
   .rejects.toThrow(BadRequestException);
  expect((await service.getAdmin()).settings.news).toEqual([legacy]);
 });
});
