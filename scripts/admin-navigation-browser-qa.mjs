import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const dist=path.join(root,'frontend/dist'),out=path.resolve(process.env.USD_NAV_QA_OUT??'admin-navigation-browser-qa');await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const file=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(dist+path.sep))return res.writeHead(403).end();let body,ext=path.extname(file);try{body=await readFile(file)}catch{body=await readFile(path.join(dist,'index.html'));ext='.html'}res.writeHead(200,{'Content-Type':mime[ext]??'application/octet-stream'}).end(body)}catch{res.writeHead(500).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(getBrowserLaunchOptions()),report=[];
try{
 for(const width of [390,1366]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  const participant={id:'person-1',lastName:'Тестовый',firstName:'Участник',isPublic:true};
  const cars=Array.from({length:60},(_,i)=>({id:'car-'+i,brand:'Lada',model:'Vesta '+i,participantId:participant.id,participant,registrationNumber:'А001АА181',registrationCountry:'RU',isActive:true,configurations:[]}));
  const stage={id:'stage-1',stageNumber:1,name:'Проверочный этап',date:'2026-11-29T12:00:00Z',status:'PUBLISHED',registrationOpen:true,season:{year:2026}};
  const news=Array.from({length:45},(_,i)=>({id:'news-'+i,title:'Проверочная новость '+i,excerpt:'Тестовая запись',body:'Текст новости',isPublished:false}));
  const registration={id:'reg-1',participantId:participant.id,participant,carId:cars[50].id,car:cars[50],stageId:stage.id,stage,participantNumber:1,status:'ACTIVE',classes:[]};
  let failCars=false,delay=0;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin===base)return route.continue();
   if(delay)await new Promise(r=>setTimeout(r,delay));
   let data=[];
   if(url.pathname==='/auth/refresh')data={accessToken:'synthetic',user:{id:'fixture-admin',email:'admin@example.test',role:'ADMIN'}};
   else if(url.pathname==='/admin/participants')data=Array.from({length:80},(_,i)=>({...participant,id:i===50?participant.id:'person-'+(i+10),lastName:'Тестовый '+String(i).padStart(2,'0')}));
   else if(url.pathname==='/cars'){if(failCars)return route.fulfill({status:503,json:{message:'Временная ошибка'}});data=cars;}
   else if(url.pathname==='/stages'||url.pathname==='/stages/public')data=[stage];
   else if(url.pathname==='/statistics/stages/stage-1')data={stage,stats:{registrations:1,participants:1,cars:1,inspections:{},classResults:[]}};
   else if(url.pathname.includes('/participants/')&&url.pathname.endsWith('/cars'))data=[cars[50]];
   else if(url.pathname==='/history/participant/person-1')data={registrations:[registration]};
   else if(url.pathname.startsWith('/registrations'))data=[registration];
   else if(url.pathname==='/records/admin/current')data=[{id:'record',stage,stageId:stage.id,value:150,unit:'DB',achievedAt:stage.date,class:{id:'c',name:'Limited',direction:{name:'SPL'}},result:{registration}}];
   else if(url.pathname==='/seasons')data=[{id:'season',year:2026}];
   else if(url.pathname.startsWith('/site-settings'))data={settings:{branding:{},homepage:{blocks:[]},news,legal:{privacyText:Array.from({length:80},(_,i)=>'Раздел '+i+'\n'+('Текст политики обработки данных. '.repeat(20))).join('\n\n')}}};
   return route.fulfill({json:data});
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  const cookie=async()=>{const button=page.getByRole('button',{name:'Только необходимые',exact:true});if(await button.isVisible())await button.click()};
  const scroll=async top=>{await page.mouse.move(width/2,450);await page.mouse.wheel(0,top);await page.waitForTimeout(150)};
  const expectTop=async()=>{await page.waitForFunction(()=>window.scrollY<5)};
  await page.goto(base+'/admin/participants?view=person-1');await page.locator('.participant-car-list a').waitFor();await cookie();
  await page.locator('.participant-car-list a').click();await page.getByRole('heading',{name:'Автомобиль',exact:true}).waitFor();
  assert.ok(page.url().includes('carId=car-50'));assert.equal(await page.locator('a.admin-return-link').count(),1);
  await page.reload();await page.getByRole('heading',{name:'Автомобиль',exact:true}).waitFor();
  await page.getByRole('button',{name:'Открыть конфигурации',exact:true}).click();await page.getByRole('heading',{name:'Конфигурации автомобиля',exact:true}).waitFor();
  await page.getByRole('button',{name:'Назад к автомобилям',exact:true}).click();await page.getByRole('heading',{name:'Автомобиль',exact:true}).waitFor();assert.ok(page.url().includes('carId=car-50'));
  await page.goto(base+'/admin/participants?view=person-1');await page.locator('.participant-history-event h4 a').waitFor();await page.locator('.participant-history-event h4 a').click();await page.getByRole('heading',{name:'Этап №1 · Проверочный этап',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/admin/stages/stage-1');
  await page.getByRole('link',{name:'← Вернуться к исходной карточке',exact:true}).click();await page.locator('.participant-history-event h4 a').waitFor();
  await page.goto(base+'/admin/registrations?stageId=stage-1');await page.locator('tbody tr').waitFor();await page.locator('td[data-label="Автомобиль"] a').click();await page.getByRole('heading',{name:'Автомобиль',exact:true}).waitFor();assert.ok(page.url().includes('carId=car-50'));
  await page.goto(base+'/admin/records');await page.locator('td[data-label="Класс"]').click();await page.getByRole('heading',{name:'Рекорд',exact:true}).waitFor();await page.locator('.admin-related-entities a[href^="/admin/cars?"]').click();await page.getByRole('heading',{name:'Автомобиль',exact:true}).waitFor();await page.getByRole('link',{name:'← Вернуться к исходной карточке',exact:true}).click();await page.getByRole('heading',{name:'Рекорд',exact:true}).waitFor();assert.ok(page.url().includes('view=record'));
  await page.goto(base+'/admin/records');await page.locator('td[data-label="Этап"] a').click();await page.getByRole('heading',{name:'Этап №1 · Проверочный этап',exact:true}).waitFor();
  // Saving an edit opened deep down an admin list must return to that row.
  await page.goto(base+'/admin/participants');await page.locator('tbody tr').first().waitFor();
  const row=page.locator('tbody tr').nth(50);await row.locator('button[title="Изменить"]').scrollIntoViewIfNeeded();await scroll(50);const before=await page.evaluate(()=>scrollY);
  assert.ok(before>500);await row.locator('button[title="Изменить"]').click();await page.locator('.entity-form-actions button[type="submit"]').waitFor();
  for(let step=0;step<5;step++){const save=page.locator('.entity-form-actions button[type="submit"]');if(!await save.count())break;await save.click();await page.waitForTimeout(100)}
  await page.waitForURL(base+'/admin/participants');await page.locator('tbody tr').nth(50).waitFor();await page.waitForTimeout(300);
  const after=await page.evaluate(()=>scrollY);assert.ok(Math.abs(after-before)<5,JSON.stringify({width,before,after}));
  // An editor driven by local state must also restore its original list.
  await page.goto(base+'/admin/news');await page.locator('tbody tr').nth(35).getByRole('button',{name:'Изменить',exact:true}).scrollIntoViewIfNeeded();await scroll(40);const newsBefore=await page.evaluate(()=>scrollY);await page.locator('tbody tr').nth(35).getByRole('button',{name:'Изменить',exact:true}).click();await page.getByRole('button',{name:'Сохранить черновик',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.news-editor'));await page.waitForTimeout(200);const newsAfter=await page.evaluate(()=>scrollY);assert.ok(Math.abs(newsAfter-newsBefore)<5,JSON.stringify({newsBefore,newsAfter}));
  // Missing and failed direct targets must not silently show an unrelated list.
  await page.goto(base+'/admin/cars?carId=missing');await page.getByRole('alert').filter({hasText:'Автомобиль не найден'}).waitFor();
  failCars=true;await page.goto(base+'/admin/cars?carId=car-50');await page.getByRole('alert').filter({hasText:'Временная ошибка'}).waitFor();failCars=false;await page.getByRole('button',{name:'Повторить загрузку'}).click();await page.getByRole('heading',{name:'Автомобиль',exact:true}).waitFor();
  await page.screenshot({path:path.join(out,'car-'+width+'.png'),fullPage:true});
  // Public transitions and history after asynchronously loading content.
  await page.goto(base+'/privacy');await page.locator('.usd-live').waitFor();await cookie();await page.waitForTimeout(150);await scroll(1400);const privacyTop=await page.evaluate(()=>scrollY);assert.ok(privacyTop>500);
  delay=200;
  const toggle=page.locator('.public-nav-toggle');if(await toggle.isVisible())await toggle.click();await page.getByRole('navigation',{name:'Основная навигация'}).getByRole('link',{name:'Этапы',exact:true}).click();await page.waitForURL(base+'/stages');await page.waitForTimeout(550);await expectTop();
  await page.goBack();await page.waitForURL(base+'/privacy');await page.waitForTimeout(600);const restored=await page.evaluate(()=>scrollY);assert.ok(Math.abs(restored-privacyTop)<5,JSON.stringify({privacyTop,restored}));
  await page.goForward();await page.waitForURL(base+'/stages');await page.waitForTimeout(500);await expectTop();
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  report.push({width,adminScroll:{before,after,newsBefore,newsAfter},publicHistory:{before:privacyTop,after:restored},errors});await context.close();
 }
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){for(const context of browser.contexts())for(const page of context.pages()){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(out,'failure.txt'),String(error)+'\n'+await page.locator('body').innerText().catch(()=>''));}throw error;}finally{await browser.close();await new Promise(r=>server.close(r))}
