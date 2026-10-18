import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.route('**/api/**',async route=>{
  const p=new URL(route.request().url()).pathname;
  if(p==='/api/auth/refresh')return route.fulfill({status:401,json:{message:'Anonymous'}});
  if(p==='/api/site-settings/public')return route.fulfill({json:{settings:{seo:{title:'USD test championship',description:'Test description',ogImage:'https://example.invalid/poster.jpg',canonical:'https://usd.example.invalid/'},homepage:{blocks:[]},branding:{},legal:{},liveResults:{enabled:false}}}});
  if(p==='/api/stages/public')return route.fulfill({json:[{id:'stage-1',name:'Тестовый этап',stageNumber:1,status:'PUBLISHED',date:'2026-11-01T12:00:00Z',city:'Екатеринбург',registrationOpen:true,isDeleted:false}]});
  if(p==='/api/stages/public/stage-1')return route.fulfill({json:{id:'stage-1',name:'Тестовый этап',stageNumber:1,status:'PUBLISHED',date:'2026-11-01T12:00:00Z',city:'Екатеринбург',registrationOpen:true}});
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


test('participant registration deep link asks for login and preserves the selected stage',async({page})=>{
 await page.route('**/api/auth/login',route=>route.fulfill({json:{accessToken:'test-access',user:{id:'user-1',email:'driver@example.test',role:'PARTICIPANT',participantId:'participant-1'}}}));
 await page.goto('/participant/register?stageId=stage-1');
 await expect(page.getByRole('heading',{name:'С возвращением'})).toBeVisible();
 await page.getByLabel('Email',{exact:true}).fill('driver@example.test');
 await page.getByLabel('Пароль',{exact:true}).fill('password123');
 await page.getByRole('button',{name:/^Войти/}).click();
 await expect(page).toHaveURL(/\/participant\/register\?stageId=stage-1$/);
 await expect(page.getByRole('heading',{name:'Регистрация на этап'})).toBeVisible();
 await expect(page.locator('.registration-hero-meta')).toContainText('Тестовый этап');
});

test('stage registration button keeps its stage through login',async({page})=>{
 await page.route('**/api/auth/login',route=>route.fulfill({json:{accessToken:'test-access',user:{id:'user-1',email:'driver@example.test',role:'PARTICIPANT',participantId:'participant-1'}}}));
 await page.goto('/stages/stage-1');
 await page.getByRole('button',{name:/Зарегистрироваться на этап/}).click();
 await expect(page).toHaveURL(/\/login\?next=/);
 await page.getByLabel('Email',{exact:true}).fill('driver@example.test');
 await page.getByLabel('Пароль',{exact:true}).fill('password123');
 await page.getByRole('button',{name:/^Войти/}).click();
 await expect(page).toHaveURL(/\/participant\/register\?stageId=stage-1$/);
 await expect(page.locator('.registration-hero-meta')).toContainText('Тестовый этап');
});

test('invalid stage link gives participant a way back instead of endless loading',async({page})=>{
 await page.route('**/api/auth/refresh',route=>route.fulfill({json:{accessToken:'test-access',user:{id:'user-1',email:'driver@example.test',role:'PARTICIPANT',participantId:'participant-1'}}}));
 await page.goto('/participant/register?stageId=missing');
 await expect(page.getByText('Этап не найден. Вернитесь в личный кабинет и выберите этап заново.')).toBeVisible();
 await expect(page.getByRole('heading',{name:'Не удалось открыть регистрацию'})).toBeVisible();
 await expect(page.getByText('Подготавливаем форму регистрации…')).toHaveCount(0);
 const cookieNotice=page.getByRole('dialog',{name:'Уведомление об использовании cookie'});
 if(await cookieNotice.isVisible())await cookieNotice.getByRole('button',{name:'Понятно'}).click();
 await page.getByRole('button',{name:'В личный кабинет'}).click();
 await expect(page).toHaveURL(/\/participant$/);
});
