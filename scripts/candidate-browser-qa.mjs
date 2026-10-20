import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const output=path.resolve('candidate-browser-qa');await mkdir(output,{recursive:true});
const dist=path.resolve('frontend/dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file=path.resolve(dist,'.'+pathname);if(!file.startsWith(dist+path.sep)&&file!==dist){res.writeHead(403).end();return}
  let body,ext=path.extname(file);
  try{body=await readFile(file)}catch{body=await readFile(path.join(dist,'index.html'));ext='.html'}
  res.writeHead(200,{'Content-Type':types[ext]??'application/octet-stream'});res.end(body);
 }catch{res.writeHead(500).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const participant={id:'p1',firstName:'Иван',lastName:'Тестовый',city:'Тюмень',phone:'+79000000000',team:'USD Team',isPublic:true};
const season={id:'s1',name:'Сезон 2026',year:2026,status:'ACTIVE'};
const stage={id:'stage1',stageNumber:1,name:'Кубок USD',date:'2026-11-21T12:00:00Z',city:'Тюмень',venue:'Арена',address:'Тестовая улица, 1',status:'PUBLISHED',registrationOpen:true,seasonId:'s1',season,classes:[]};
const klass={id:'class1',name:'Limited 2.0',unit:'DB',isActive:true,directionId:'dir1',direction:{id:'dir1',name:'SPL',code:'SPL'}};
const version={id:'v1',version:1,name:'Соревновательная сборка',createdAt:'2026-10-01T10:00:00Z',vibrationLayers:[],audioComponents:[],amplifiers:[],batteries:[],generators:[]};
const configuration={id:'config1',name:'Соревновательная сборка',carId:'car1',currentVersionId:'v1',currentVersion:1,versions:[version]};
const car={id:'car1',brand:'Lada',model:'Vesta',registrationCountry:'RU',registrationNumber:'A123AA72',color:'Графит',isPublic:true,isActive:true,participantId:'p1',participant,configurations:[configuration]};
const registration={id:'reg1',participantId:'p1',participant,carId:'car1',car,stageId:'stage1',stage,participantNumber:7,status:'ACTIVE',registeredAt:'2026-10-01T12:00:00Z',numbers:[{id:'n1',number:7}],classes:[{id:'rc1',classId:'class1',class:klass}],results:[],configurationVersion:version};
const result={id:'r1',value:150.25,unit:'DB',place:1,classId:'class1',class:klass,participant,registrationClassId:'rc1',registration:{...registration}};
const settings={branding:{siteName:'USD'},homepage:{blocks:[]},legal:{},registration:{},catalogs:{componentBrands:[],componentModels:[],vibrationBrands:[]},contacts:{}};
const dashboard={success:true,generatedAt:new Date().toISOString(),overview:{participants:1,cars:1,stages:1,registrations:1,results:1,records:0,currentRecords:0},currentStage:stage,attention:{openStages:1,pendingInspections:1,failedInspections:0,resultsToday:0,activeDisqualifications:0,unresolvedImports:0},activeRegistrationStats:{registrations:1,participants:1,cars:1},upcomingStages:[stage],recentStages:[]};
const user=role=>({id:'fixture-user',email:'fixture@example.test',role,participantId:role==='PARTICIPANT'?'p1':null});
const requests=new Set(),blocked=[];
function dataFor(url,role){
 const p=url.pathname;
 requests.add(p);
 if(p==='/auth/refresh')return role?{accessToken:'browser-fixture-only',user:user(role)}:null;
 if(p==='/auth/me')return user(role);
 if(p==='/participants/me')return {participant};
 if(p==='/participants/me/historical-final-configuration')return {required:false};
 if(p==='/auth/legal-consent')return {legalReady:false};
 if(p==='/auth/newsletter-consent')return {consent:false};
 if(p==='/auth/sessions')return {sessions:[]};
 if(p==='/participants/me/cars'||p==='/cars'||p==='/participants/p1/cars')return [car];
 if(p==='/registrations/me'||p==='/registrations')return [registration];
 if(p==='/cars/car1/configurations')return [configuration];
 if(p==='/configurations/config1')return configuration;
 if(p==='/site-settings'||p==='/site-settings/public')return {settings};
 if(p.startsWith('/media/'))return {url:''};
 if(p==='/statistics/dashboard')return dashboard;
 if(p==='/statistics/data-quality/report')return {issues:[],counts:{total:0,error:0,warning:0,info:0},healthy:true};
 if(p==='/statistics/stages/stage1')return {stats:{registrations:1,participants:1,cars:1,inspections:{total:0,pending:1,passed:0,failed:0}}};
 if(p==='/statistics/overview')return {stats:dashboard.overview};
 if(p.startsWith('/statistics/seasons/'))return {registrations:{total:1,withTeam:1,withoutTeam:0,withoutTeamPercent:0},teams:[{name:'USD Team',registrations:1,percent:100,participants:1}],vibrationIsolation:[],configurationBrands:[]};
 if(p.startsWith('/statistics/audit'))return {items:[],total:0,page:1,totalPages:1};
 if(p==='/stages'||p==='/stages/public')return [stage];
 if(p.endsWith('/classes'))return p.startsWith('/stages/')?[{id:'sc1',classId:'class1',class:klass}]:[klass];
 if(p==='/stages/stage1'||p==='/stages/public/stage1')return stage;
 if(p==='/seasons'||p==='/seasons/public')return [season];
 if(p==='/directions')return [klass.direction];
 if(p==='/participants'||p==='/participants/lookup'||p==='/participants/public')return [participant];
 if(p==='/participants/teams')return [{name:'USD Team'}];
 if(p==='/results/admin/stage/stage1'||p.startsWith('/results/stage/')||p==='/results/public')return [result];
 if(p==='/results/public/latest')return [result];
 if(p==='/auth/admin/users')return [user('PARTICIPANT')];
 return [];
}
const publicRoutes=['/','/stages','/stages/stage1','/results?stageId=stage1','/records','/rules','/privacy','/terms','/login','/reset-password','/confirm-email-change'];
const participantRoutes=['/participant','/participant?tab=profile','/participant?tab=cars','/participant?tab=registrations','/participant/car?carId=car1','/participant/car/new','/participant/configurations?carId=car1','/participant/configurations?carId=car1&view=config1','/participant/configurations?carId=car1&edit=config1','/participant/registration?registrationId=reg1','/participant/register?stageId=stage1'];
const adminRoutes=['/admin','/admin/stages','/admin/registrations','/admin/inspections','/admin/results','/admin/participants','/admin/teams','/admin/cars','/admin/cars/new','/admin/cars/configurations?carId=car1','/admin/records','/admin/statistics','/admin/disqualifications','/admin/news','/admin/partners','/admin/rules','/admin/legal-documents','/admin/seasons','/admin/classes','/admin/vibration','/admin/components','/admin/historical-results','/admin/data-quality','/admin/users','/admin/roles','/admin/media','/admin/audit','/admin/site-settings','/admin/email-testing','/admin/email-templates','/admin/assistant'];
const report={scope:'Built candidate JavaScript and CSS; all remote requests mocked; synthetic records only; no production access',pages:[],failures:[],blocked};
const browser=await chromium.launch({headless:true});
try{
 for(const width of [1440,390]){
  for(const [role,routes]of [[null,publicRoutes],['PARTICIPANT',participantRoutes],['ADMIN',adminRoutes]]){
   const context=await browser.newContext({viewport:{width,height:960}});
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===base)return route.continue();
    if(url.hostname==='usd-api-production.up.railway.app'){
     if(!['GET','HEAD','OPTIONS'].includes(request.method())&&url.pathname!=='/auth/refresh'){
      blocked.push({method:request.method(),path:url.pathname});return route.abort('blockedbyclient');
     }
     const data=dataFor(url,role);
     return route.fulfill({status:data===null?401:200,contentType:'application/json',body:JSON.stringify(data??{message:'Anonymous fixture'})});
    }
    // Images, fonts and third-party embeds must never contact a live service.
    if(request.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#171d28"/><text x="60" y="130" fill="#fff" font-size="70">USD</text></svg>'});
    return route.abort('blockedbyclient');
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);
   for(const route of routes){
    const errors=[],onError=error=>errors.push(error.message);page.on('pageerror',onError);
    const row={role:role??'PUBLIC',width,route};
    try{
     await page.goto(base+route,{waitUntil:'networkidle'});
     await page.locator('.public-site,.login-page,.participant-portal,.app-shell').first().waitFor();
     await page.waitForTimeout(100);
     if(route.includes('/configurations')&&route.includes('&view=')){await page.getByRole('button',{name:'Подробнее',exact:true}).click();await page.locator('.configuration-details-page').waitFor();row.configurationView='opened through UI'}
     if(route.includes('/configurations')&&route.includes('&edit=')){await page.getByRole('button',{name:'Редактировать',exact:true}).click();await page.locator('.configuration-editor-page').waitFor();row.configurationEditor='opened through UI; no saving'}
     Object.assign(row,await page.evaluate(()=>{
      const controls=[...document.querySelectorAll('input,select,textarea')].filter(e=>!['hidden','checkbox','radio','file'].includes(e.type)&&e.getBoundingClientRect().width>0);
      const heading=document.querySelector('main h1,.content h1,h1');
      return {heading:heading?.textContent??'',documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,smallControls:controls.filter(e=>parseFloat(getComputedStyle(e).fontSize)<16).map(e=>({tag:e.tagName,type:e.type,font:getComputedStyle(e).fontSize})),overflowing:[...document.body.querySelectorAll('*')].map(e=>({e,r:e.getBoundingClientRect()})).filter(({e,r})=>r.width>0&&(r.right>innerWidth+1||r.left< -1)&&!e.closest('.sidebar')&&getComputedStyle(e).position!=='fixed').slice(0,10).map(({e,r})=>({class:e.className,left:Math.round(r.left),right:Math.round(r.right),text:e.textContent?.slice(0,60)}))};
     }));
     assert.ok(row.documentWidth<=width+1,'document overflow '+JSON.stringify(row.overflowing));
     assert.equal(row.smallControls.length,0,'readable controls '+JSON.stringify(row.smallControls));
     assert.equal(errors.length,0,'runtime errors '+errors.join(';'));
     assert.ok((await page.locator('body').innerText()).length>100,'page must contain actual UI');
     if(role==='ADMIN'){
      const mainColor=await page.locator('.main').evaluate(e=>getComputedStyle(e).backgroundColor);
      assert.equal(mainColor,'rgb(243, 245, 248)','admin workspace stays light');
      if(route==='/admin'&&width===390){
       await page.getByRole('button',{name:'Меню',exact:true}).click();
       await page.locator('.sidebar').waitFor({state:'visible'});
       await page.getByRole('button',{name:'Автомобили',exact:true}).click();
       await page.waitForURL(/\/admin\/cars$/);
       row.mobileAdminNavigation='passed';
       await page.goto(base+route,{waitUntil:'networkidle'});
      }
     }
     if(route==='/participant'&&role==='PARTICIPANT'){
      await page.getByRole('link',{name:'Мои автомобили',exact:true}).click();await page.waitForURL(/tab=cars/);
      await page.goBack();assert.equal(await page.locator('.participant-tabs [aria-current="page"]').innerText(),'Обзор');
      if(width===390){const box=await page.locator('.participant-tabs').boundingBox();assert.ok(box.y+box.height>=958,'bottom navigation must stay at the viewport edge')}
      row.participantHistory='passed';
     }
     if(role===null&&route==='/'&&width===390){
      const toggle=page.locator('.public-nav-toggle');await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      await toggle.click();await page.getByRole('link',{name:'Этапы',exact:true}).click();await page.waitForURL(/\/stages$/);
      assert.equal(await page.getByRole('button',{name:'Открыть меню',exact:true}).getAttribute('aria-expanded'),'false');
      row.mobilePublicNavigation='passed';
      await page.goto(base+route,{waitUntil:'networkidle'});
     }
     row.status='passed';
    }catch(error){row.status='failed';row.error=error.message;row.runtimeErrors=errors;report.failures.push({role:row.role,width,route,error:error.message})}
    const name=row.role+'-'+width+'-'+route.replace(/[^a-zA-Z0-9]/g,'_');
    await page.screenshot({path:path.join(output,name+'.png'),fullPage:true}).catch(()=>{});
    if(route==='/'||route==='/participant'||route==='/admin'){
     const preview=await page.screenshot({type:'jpeg',quality:38,fullPage:false});
     console.log('USD_VISUAL '+JSON.stringify({role:row.role,width,route,image:'data:image/jpeg;base64,'+preview.toString('base64')}));
    }
    page.off('pageerror',onError);report.pages.push(row);console.log(JSON.stringify(row));
   }
   await context.close();
  }
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));report.requests=[...requests];await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))}
console.log('CANDIDATE_QA_SUMMARY '+JSON.stringify({pages:report.pages.length,passed:report.pages.filter(p=>p.status==='passed').length,failures:report.failures,blocked}));
if(report.failures.length||blocked.length)process.exitCode=1;
