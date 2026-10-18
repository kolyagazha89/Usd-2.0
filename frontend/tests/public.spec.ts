import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  if(p==='/api/auth/refresh')return route.fulfill({status:401,json:{message:'Anonymous'}});
  if(p==='/api/site-settings/public')return route.fulfill({json:{settings:{seo:{title:'USD test championship',description:'Test description',ogImage:'https://example.invalid/poster.jpg',canonical:'https://usd.example.invalid/'},homepage:{blocks:[]},branding:{},legal:{},liveResults:{enabled:false}}}});
  if(p==='/api/stages/public')return route.fulfill({json:[{id:'stage-1',name:'Тестовый этап',stageNumber:1,status:'PUBLISHED',date:'2026-07-01T12:00:00Z',city:'Екатеринбург',isDeleted:false}]});
  if(p==='/api/stages/public/stage-1')return route.fulfill({json:{id:'stage-1',name:'Тестовый этап',stageNumber:1,status:'PUBLISHED',date:'2026-07-01T12:00:00Z',city:'Екатеринбург'}});
  if(p.includes('/media/'))return route.fulfill({status:404,json:{message:'No optional asset'}});
  return route.fulfill({json:[]});
 });
});

test('direct public route renders with CMS metadata without downloading admin modules',async({page})=>{
 const chunks:string[]=[];page.on('request',r=>chunks.push(r.url()));
 await page.goto('/records');
 await expect(page).toHaveTitle('Рекорды — USD');
 await expect(page.locator('meta[name="description"]')).toHaveAttribute('content','Test description');
 await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://usd.example.invalid/records');
 expect(chunks.filter(url=>/AdminRoutes|ImportPage|InspectionsPage|xlsx.mjs/.test(url))).toEqual([]);
 await expect(page.locator('.public-site')).toBeVisible();
});

test('public stage receives its own title and event metadata on direct refresh',async({page})=>{
 await page.goto('/stages/stage-1');
 await expect(page).toHaveTitle('Тестовый этап — USD');
 await expect(page.locator('#usd-event-schema')).toHaveCount(1);
 await expect.poll(()=>page.locator('#usd-event-schema').textContent()).toContain('SportsEvent');
 await page.reload();await expect(page).toHaveTitle('Тестовый этап — USD');
});

test('administrator deep link reaches login without loading administrative tools anonymously',async({page})=>{
 const chunks:string[]=[];page.on('request',r=>chunks.push(r.url()));
 await page.goto('/admin/inspections?stageId=stage-1');
 await expect(page.getByRole('heading',{name:'С возвращением'})).toBeVisible();
 await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
 expect(chunks.filter(url=>/AdminRoutes|ImportPage/.test(url))).toEqual([]);
});
