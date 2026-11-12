import {renderSitemapXml} from './seo-sitemap';

describe('SEO sitemap',()=>{
 it('publishes static routes and only published or completed stages',()=>{
  const xml=renderSitemapXml('https://app.usd-russia.ru',[
   {id:'published-id',status:'PUBLISHED',isDeleted:false,updatedAt:new Date('2026-11-01T12:00:00Z')},
   {id:'completed-id',status:'COMPLETED',isDeleted:false,updatedAt:new Date('2026-11-02T12:00:00Z')},
   {id:'draft-id',status:'DRAFT',isDeleted:false,updatedAt:new Date('2026-11-03T12:00:00Z')},
   {id:'deleted-id',status:'PUBLISHED',isDeleted:true,updatedAt:new Date('2026-11-04T12:00:00Z')},
  ]);
  expect(xml).toContain('<loc>https://app.usd-russia.ru/</loc>');
  expect(xml).toContain('<loc>https://app.usd-russia.ru/stages/published-id</loc>');
  expect(xml).toContain('<loc>https://app.usd-russia.ru/stages/completed-id</loc>');
  expect(xml).not.toContain('draft-id');
  expect(xml).not.toContain('deleted-id');
  expect(xml).not.toContain('/admin');
  expect(xml).not.toContain('/participant/');
  expect(xml).not.toContain('/login');
 });
 it('escapes XML fields and rejects unsafe site origin',()=>{
  const xml=renderSitemapXml('https://app.usd-russia.ru/unwanted/path',[
   {id:'id-a&b',status:'PUBLISHED',isDeleted:false,updatedAt:new Date('2026-11-05T12:00:00Z')},
  ]);
  expect(xml).toContain('https://app.usd-russia.ru/stages/id-a%26b');
  expect(xml).not.toContain('unwanted/path');
  expect(()=>renderSitemapXml('javascript:alert(1)',[])).toThrow();
 });
});
