import {jest} from '@jest/globals';
import {usdExpertRead} from './usd-expert-readers';

describe('USD AI database privacy boundary',()=>{
 it('returns only active-registration fields and redacts hidden people/cars, not phone, plate, or email',async()=>{
  const prisma:any={
   registration:{findMany:jest.fn().mockResolvedValue([
    {participantNumber:17,stage:{name:'Этап',date:new Date('2026-11-23')},
     participant:{lastName:'Закрытый',firstName:'Участник',middleName:null,isPublic:false},
     car:{brand:'Private',model:'Vehicle',isActive:false},stageInspection:{status:'PASSED'},inspection:null,
     classes:[{class:{name:'SPL',code:'SPL',direction:{name:'SPL'}},number:{number:17}}],
     results:[{value:153.2,unit:'DB',place:1,registrationClass:{class:{code:'SPL'}}}]},
   ])},
  };
  const rows:any=await usdExpertRead(prisma,'usd_search_registrations',{query:'Закрытый',stageId:null});
  expect(rows.matches).toHaveLength(1);
  expect(rows.matches[0].participant).toBe('Скрытый профиль');
  expect(rows.matches[0].car).toBe('Скрытый автомобиль');
  const serialized=JSON.stringify(rows);
  expect(serialized).not.toContain('Закрытый');
  expect(serialized).not.toContain('Private');
  const options=prisma.registration.findMany.mock.calls[0][0];
  expect(options.take).toBe(12);
  expect(JSON.stringify(options.select)).not.toMatch(/email|phone|registrationNumber|usdIdToken/);
 });
 it('fetches only the published rulebook edition; draft and email templates never reach the model',async()=>{
  const prisma:any={siteSettings:{findUnique:jest.fn().mockResolvedValue({registration:{
   emailTemplates:{secrets:'do-not-share'},
   rulesDocument:{
    drafts:[{blocks:[{text:'SECRET DRAFT'}]}],
    published:{id:'pub-v2',publishedAt:'2026-11-01',blocks:[{text:'SPL официальный регламент'}]},
   },
  }})}};
  const rules:any=await usdExpertRead(prisma,'usd_rules',{topic:'registration'});
  expect(rules.publishedRules.revisionId).toBe('pub-v2');
  expect(rules.publishedRules.text).toContain('официальный регламент');
  expect(JSON.stringify(rules)).not.toMatch(/do-not-share|SECRET DRAFT/);
  expect(prisma.siteSettings.findUnique).toHaveBeenCalledWith(expect.objectContaining({where:{id:'default'}}));
 });
 it('does not return unlimited history or data when searching results',async()=>{
  const prisma:any={result:{findMany:jest.fn().mockResolvedValue([])}};
  const empty:any=await usdExpertRead(prisma,'usd_search_results',{query:'SPL'});
  expect(empty.matches).toHaveLength(0);
  expect(prisma.result.findMany.mock.calls[0][0].take).toBe(12);
 });
});
