import {SeoController} from './seo.controller';

describe('SEO sitemap controller',()=>{
 it('reads published CMS news without adding draft or scheduled stories',async()=>{
  const stageFind=jest.fn().mockResolvedValue([]);
  const siteFind=jest.fn().mockResolvedValue({news:[
   {id:'published',isPublished:true,publishedAt:'2026-01-01T12:00:00Z'},
   {id:'draft',isPublished:false},
   {id:'future',isPublished:true,publishedAt:'2999-01-01T00:00:00Z'},
  ]});
  const controller=new SeoController({
   stage:{findMany:stageFind},
   siteSettings:{findUnique:siteFind},
  } as any);
  const xml=await controller.sitemap();
  expect(siteFind).toHaveBeenCalledWith({where:{id:'default'},select:{news:true}});
  expect(xml).toContain('/news/published</loc>');
  expect(xml).not.toContain('/news/draft</loc>');
  expect(xml).not.toContain('/news/future</loc>');
 });
});
