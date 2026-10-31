import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isCandidateApiRequest} from './candidate-browser-qa-config.mjs';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';

const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const output=path.resolve('candidate-browser-qa');await mkdir(output,{recursive:true});
const dist=path.resolve('frontend/dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{
  const rawPath=new URL(req.url,'http://localhost').pathname;let pathname=rawPath;try{pathname=decodeURIComponent(rawPath)}catch{/* Serve the SPA so it can explain malformed deep links. */}
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
const version={id:'v1',version:1,name:'Соревновательная сборка',createdAt:'2026-10-01T10:00:00Z',vibrationIsolation:'STP',headUnits:[{id:'hu1',brand:'Pioneer',model:'MVH-S520BT',quantity:1}],audioComponents:[{id:'ac1',type:'SUBWOOFER',direction:'SUB',brand:'Alphard',model:'Machete',size:12,quantity:2}],amplifiers:[{id:'amp1',brand:'Deaf Bonce',model:'AAB-2900.1D',quantity:1,power:2900,componentLinks:[{componentId:'ac1',quantity:2}]}],batteries:[{id:'battery1',brand:'LTO',model:'100',quantity:2}],generators:[{id:'generator1',model:'200',quantity:1}]};
const configuration={id:'config1',name:'Соревновательная сборка',carId:'car1',currentVersionId:'v1',currentVersion:1,versions:[version]};
const car={id:'car1',brand:'Lada',model:'Vesta',registrationCountry:'RU',registrationNumber:'A123AA72',color:'Графит',isPublic:true,isActive:true,participantId:'p1',participant,configurations:[configuration]};
const registration={id:'reg1',participantId:'p1',participant,carId:'car1',car,stageId:'stage1',stage,participantNumber:7,status:'ACTIVE',registeredAt:'2026-10-01T12:00:00Z',numbers:[{id:'n1',number:7}],classes:[{id:'rc1',classId:'class1',class:klass}],results:[],configurationVersion:version};
const result={id:'r1',value:150.25,unit:'DB',place:1,classId:'class1',class:klass,participant,registrationClassId:'rc1',registration:{...registration}};
const rulesBlocks=[
 {type:'heading',level:2,text:'Раздел А'},
 {type:'list-item',ordered:true,level:0,text:'Первое условие'},
 {type:'list-item',ordered:true,level:0,text:'Второе условие'},
 {type:'list-item',ordered:true,level:1,text:'Вложенное условие'},
 {type:'list-item',ordered:true,level:0,text:'Третье условие'},
 {type:'heading',level:2,text:'Раздел Б'},
 {type:'list-item',ordered:true,level:0,text:'Новый список'},
];
const settings={branding:{siteName:'USD'},homepage:{blocks:[]},legal:{},registration:{rulesDocument:{published:{id:'rules-fixture',fileName:'regulation-fixture.docx',createdAt:'2026-10-01T00:00:00Z',blocks:rulesBlocks}}},catalogs:{componentBrands:[],componentModels:[{id:'00000000-0000-4000-8000-000000000001',category:'SUBWOOFER',brand:'Alphard',model:'Machete',isActive:true}],batteryTypes:[{code:'AGM',name:'AGM (свинцово-кислотный)',isActive:true}],vibrationBrands:[]},contacts:{},partners:[{id:'pg',name:'Генеральный тестовый',tier:'GENERAL',isActive:true,sortOrder:1},{id:'pp',name:'Премиальный тестовый',tier:'PREMIUM',isActive:true,sortOrder:1},{id:'pr',name:'Обычный тестовый',tier:'REGULAR',isActive:true,sortOrder:1},{id:'ph',name:'Скрытый тестовый',tier:'GENERAL',isActive:false,sortOrder:0}]};
stage.rulesSnapshot={revisionId:'rules-fixture',publishedAt:'2026-10-01T00:00:00Z',blocks:rulesBlocks};
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
 if(p==='/cars'&&role==='ADMIN')return Array.from({length:63},(_,index)=>({...car,id:'car'+(index+1),model:'Vesta '+String(index+1).padStart(2,'0')}));
 if(p==='/participants/me/cars'||p==='/cars'||p==='/participants/p1/cars')return [car];
 if(p==='/registrations/me'||p==='/registrations')return [registration];
 if(p==='/cars/car1/configurations')return [configuration];
 if(p==='/configurations/config1')return configuration;
 if(p==='/site-settings'||p==='/site-settings/public')return {settings};
 if(p.startsWith('/media/'))return {url:''};
 if(p==='/records/current')return [{id:'record1',value:150.25,unit:'DB',class:klass,result,stage,isCurrent:true}];
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
 if(p==='/participants'||p==='/participants/lookup'||p==='/participants/public')return [{...participant,cars:[car]}];
 if(p==='/participants/p1')return {...participant,cars:[car],registrations:[registration]};
 if(p==='/cars/car1')return car;
 if(p==='/results/registration/reg1')return [result];
 if(p==='/participants/teams')return [{name:'USD Team'}];
 if(p==='/teams/admin')return {teams:[],users:[]};
 if(p==='/teams/public')return [{id:null,name:'USD Team',description:'',isActive:false,members:[],historicalMembers:[{id:participant.id,firstName:participant.firstName,lastName:participant.lastName,city:participant.city}],posts:[]}];
 if(p==='/results/admin/stage/stage1'||p.startsWith('/results/stage/')||p==='/results/public')return [result];
 if(p==='/results/public/latest')return [result];
 if(p==='/auth/admin/users')return [user('PARTICIPANT')];
 return [];
}
const publicRoutes=['/','/stages','/stages/stage1','/results?stageId=stage1','/records','/rules','/privacy','/terms','/consent','/login','/login?next=%2Fparticipant%2Fregister%3FstageId%3Dstage1','/participants/missing','/cars/missing','/stages/missing','/participants/offline','/stages/offline','/stages/%E0%A4%A','/unknown-page','/reset-password','/confirm-email-change','/participants','/participants/p1','/teams','/teams/USD%20Team','/cars','/cars/car1','/news','/partners','/contacts','/documents','/about'];
const participantRoutes=[...publicRoutes.filter(route=>!['/login','/reset-password','/confirm-email-change'].includes(route.split('?')[0])),'/participant','/participant?tab=profile','/participant?tab=cars','/participant?tab=registrations','/participant/car?carId=car1','/participant/car/new','/participant/configurations?carId=car1','/participant/configurations?carId=car1&view=config1','/participant/configurations?carId=car1&edit=config1','/participant/registration?registrationId=reg1','/participant/register?stageId=stage1','/participant/register?stageId=missing','/participant/register','/participant/register?stageId=outage'];
const adminRoutes=['/admin','/admin/stages','/admin/registrations','/admin/inspections','/admin/results','/admin/participants','/admin/teams','/admin/cars','/admin/cars/new','/admin/cars/configurations?carId=car1','/admin/records','/admin/statistics','/admin/disqualifications','/admin/news','/admin/partners','/admin/rules','/admin/legal-documents','/admin/seasons','/admin/classes','/admin/vibration','/admin/components','/admin/historical-results','/admin/data-quality','/admin/users','/admin/roles','/admin/media','/admin/audit','/admin/site-settings','/admin/email-testing','/admin/email-templates','/admin/assistant'];
const report={scope:'Built candidate JavaScript and CSS; all remote requests mocked; synthetic records only; no production access',motion:'Reduced-motion responsive layout; normal-motion WebGL graphics require separate browser acceptance',startedAt:new Date().toISOString(),pages:[],failures:[],blocked};
const browser=await chromium.launch(getBrowserLaunchOptions());
try{
 for(const width of [1440,1024,390,320]){
  for(const [role,routeSet]of [[null,publicRoutes],['PARTICIPANT',participantRoutes],['ADMIN',adminRoutes]]){
   const routes=[1440,390].includes(width)?(role===null?[...routeSet,'/participant/register?stageId=stage1']:routeSet):(role===null?['/','/stages','/results?stageId=stage1','/login','/login?next=%2Fparticipant%2Fregister%3FstageId%3Dstage1','/participant/register?stageId=stage1','/consent','/participants/missing','/participants/offline','/stages/offline','/stages/%E0%A4%A']:role==='PARTICIPANT'?['/participants','/participants/p1','/participants/missing','/participants/offline','/stages/offline','/teams/USD%20Team','/cars','/cars/car1','/stages','/results?stageId=stage1','/participant','/participant?tab=profile','/participant/configurations?carId=car1&edit=config1','/participant/register?stageId=stage1']:['/admin','/admin/registrations','/admin/inspections','/admin/data-quality','/admin/site-settings']);
   // Layout checks exercise the supported accessible experience. Software WebGL
   // can starve the CI renderer; graphics acceptance needs a separate browser.
   const reducedMotion='reduce';
   const context=await browser.newContext({viewport:{width,height:960},reducedMotion,serviceWorkers:'block'});
   const failuresSeen=new Set();
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===base)return route.continue();
    if(request.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:url.pathname.includes('SITE_ASSET')?'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><text x="0" y="64" fill="#fff" font-family="Arial,sans-serif" font-weight="800" font-size="76">USD</text></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#171d28"/><text x="60" y="130" fill="#fff" font-size="70">USD</text></svg>'});
    if(isCandidateApiRequest(url)){
     if(!['GET','HEAD','OPTIONS'].includes(request.method())&&url.pathname!=='/auth/refresh'){
      blocked.push({method:request.method(),path:url.pathname});return route.abort('blockedbyclient');
     }
     if(['/participants/missing','/cars/missing','/stages/public/missing'].includes(url.pathname))return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({message:'Не найдено'})});
     if(['/participants/offline','/stages/public/offline'].includes(url.pathname)){
      if(!failuresSeen.has(url.pathname)){failuresSeen.add(url.pathname);return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic outage'})})}
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(url.pathname.startsWith('/participants/')?{...participant,id:'offline',cars:[],registrations:[]}:{...stage,id:'offline'})});
     }
     if(role==='PARTICIPANT'&&request.frame().url().includes('stageId=outage')&&url.pathname==='/stages/public'){
      if(!failuresSeen.has('registration-calendar')){failuresSeen.add('registration-calendar');return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic calendar outage'})})}
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{...stage,id:'outage'}])});
     }
     const registrationFlow=role==='PARTICIPANT'&&request.frame().url().includes('/participant/register');
     const data=registrationFlow&&url.pathname==='/registrations/me'?[]:registrationFlow&&url.pathname==='/auth/legal-consent'?{legalReady:true,version:'fixture',privacyAccepted:true,termsAccepted:true}:dataFor(url,role);
     return route.fulfill({status:data===null?401:200,contentType:'application/json',body:JSON.stringify(data??{message:'Anonymous fixture'})});
    }
    // Images, fonts and third-party embeds must never contact a live service.
    
    return route.abort('blockedbyclient');
   });
   const page=await context.newPage();page.setDefaultTimeout(10000);
   for(const route of routes){
    const errors=[],onError=error=>errors.push(error.message);page.on('pageerror',onError);
    const row={role:role??'PUBLIC',width,route,reducedMotion};
    const startedAt=Date.now();
    console.log('CANDIDATE_QA_START '+JSON.stringify(row));
    try{
     await page.goto(base+route,{waitUntil:'networkidle'});
     await page.locator('.usd-live,.public-site,.login-page,.participant-portal,.app-shell').first().waitFor();
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
     const isPublicContent=publicRoutes.includes(route)&&!['/login','/reset-password','/confirm-email-change'].includes(route.split('?')[0]);
     if(isPublicContent){
      if(route!=='/')assert.equal(await page.title(),row.heading+' — USD','public title identifies the current section');
      assert.equal(await page.locator('.participant-portal').count(),0,'public content stays public in a member session');
      if(!route.endsWith('/offline'))assert.equal(await page.locator('.p-error').count(),0,'public requests must not fail silently');
     }
     if(role===null&&route==='/participant/register?stageId=stage1'){
      const current=new URL(page.url());assert.equal(current.pathname,'/login');assert.equal(current.searchParams.get('next'),route);
      assert.match(await page.locator('.usd-auth-context').innerText(),/Кубок USD/);row.guestRegistration='login preserves chosen stage';
     }
     if(role===null&&route==='/login'){
      await page.getByRole('button',{name:'Нет аккаунта? Зарегистрироваться',exact:true}).click();
      assert.equal(await page.locator('input[autocomplete="new-password"]').count(),2);
      assert.match(await page.locator('#signup-password-hint').innerText(),/8/);
      assert.equal(await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).isEnabled(),false,'legal documents not ready: account creation remains blocked');
      row.accountCreation='form inspected; no consent accepted or account submitted';
     }
     if(role===null&&route.startsWith('/login?'))assert.match(await page.locator('.usd-auth-context').innerText(),/Кубок USD/);
     if(route.endsWith('/missing')){assert.match(await page.locator('main').innerText(),/не найден/);assert.equal(await page.locator('.p-error').count(),0)}
     if(route.endsWith('/offline')){
      assert.match(await page.locator('main .p-error[role="alert"]').innerText(),/Не удалось/);
      await page.screenshot({path:path.join(output,`${role??'PUBLIC'}-${width}-${route.replaceAll('/','_')}-error.png`)});
      await page.getByRole('button',{name:'Попробовать ещё раз',exact:true}).click();
      await page.locator(route.startsWith('/participants/')?'.p-profile-banner':'.public-stage-detail').waitFor();
      assert.equal(await page.locator('main .p-error[role="alert"]').count(),0);row.errorRecovery='503 shown as failure, retry loaded entity';
     }
     if(route==='/stages/%E0%A4%A'||route==='/unknown-page')assert.match(await page.locator('main').innerText(),/не найдена/i);
     if(route==='/partners'){
      for(const tier of ['general','premium','regular'])assert.equal(await page.locator('.usd-partner-tier--'+tier+' .usd-partner-card').count(),1,'partner tier '+tier);
      assert.equal(await page.getByText('Скрытый тестовый').count(),0,'hidden partner must not appear');
      row.partnerHierarchy='all three CMS tiers rendered; hidden partner excluded';
     }
     if(route==='/'&&role===null){
      assert.equal(await page.locator('.u-home-partners .usd-partner-tier').count(),3,'homepage partner tiers');
      row.homePartnerHierarchy='all three sponsor levels present';
     }

     if(role==='PARTICIPANT'&&['/participant/register?stageId=missing','/participant/register'].includes(route)){
      assert.equal(await page.locator('.participant-loading').count(),0,'missing registration stage never spins forever');
      assert.ok(await page.getByRole('button',{name:'Выбрать этап',exact:true}).isVisible());row.registrationMissing='calendar recovery available';
     }
     if(role==='PARTICIPANT'&&route==='/participant/register?stageId=outage'){
      assert.match(await page.locator('main').innerText(),/Не удалось загрузить этапы/);
      assert.equal(await page.locator('.participant-loading').count(),0);
      await page.getByRole('button',{name:'Повторить загрузку',exact:true}).click();
      await page.getByRole('button',{name:'Перейти к классам',exact:true}).waitFor();row.registrationRecovery='503 calendar retry restores registration';
     }
     if(route==='/participants/p1'){
      assert.match(await page.locator('.p-profile-banner').innerText(),/Тестовый Иван/);
      await page.getByRole('button',{name:'Показать результаты',exact:true}).click();
      await page.locator('.p-entry-results strong').waitFor();
      assert.match(await page.locator('.p-entry-results').innerText(),/150,25/);
      assert.match(await page.locator('.p-entry-results').innerText(),/1 место/);
      row.publicAchievements='published results expanded; stage protocol link available';
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'expanded achievements fit viewport');
     }
     if(route==='/rules'&&role===null){
       await page.locator('.public-rules-list-item').first().waitFor();
       assert.deepEqual(await page.locator('.public-rules-list-item>span:first-child').allInnerTexts(),['1.','2.','1.','3.','1.'],'official DOCX lists keep nested numbering');
       const search=page.getByRole('textbox',{name:'Поиск по регламенту'});
       await search.fill('Раздел Б');
       assert.equal(await page.locator('.public-rules-list-item').count(),1,'search keeps the matching regulation section');
       assert.deepEqual(await page.locator('.public-rules-list-item>span:first-child').allInnerTexts(),['1.'],'filtered section retains its document numbering');
       assert.equal(await page.locator('.public-rules-sidebar nav a').count(),1,'filtered contents only links to visible headings');
       const anchor=await page.locator('.public-rules-sidebar nav a').first().getAttribute('href');
       assert.equal(await page.locator(anchor).count(),1,'table of contents anchor resolves after search');
       const link=page.locator('.public-rules-sidebar nav a').first();
       await link.focus();
       await page.keyboard.press('Tab');
       await page.keyboard.press('Shift+Tab');
       const focus=await link.evaluate(element=>({active:document.activeElement===element,outline:getComputedStyle(element).outlineStyle,width:parseFloat(getComputedStyle(element).outlineWidth)}));
       assert.ok(focus.active&&focus.outline!=='none'&&focus.width>=2,'keyboard contents navigation has a visible focus indicator');
       await page.keyboard.press('Enter');
       await page.waitForURL(url=>url.hash===anchor);
       assert.equal(new URL(page.url()).hash,anchor,'keyboard activation reaches the matching heading');
       await page.getByRole('button',{name:'Сбросить поиск'}).click();
       assert.deepEqual(await page.locator('.public-rules-list-item>span:first-child').allInnerTexts(),['1.','2.','1.','3.','1.'],'reset restores the original list markers');
       row.rulesNumbering='nested ordered markers, filtered section, keyboard focus and anchor passed';
      }
      if(route==='/admin/rules'&&role==='ADMIN'){
       await page.getByRole('button',{name:'Просмотреть содержимое'}).click();
       const markers=await page.locator('.rules-admin-list-item').evaluateAll(items=>items.map(item=>item.textContent.trim().match(/^(?:\d+\.|•)/)?.[0]));
       assert.deepEqual(markers,['1.','2.','1.','3.','1.'],'light admin DOCX preview uses public numbering');
       row.rulesAdminPreview='numbered DOCX preview passed';
      }
      if(route==='/records')assert.equal(await page.locator('.public-record-card').count(),1,'published record fixture is rendered');
     if(route==='/cars')assert.equal(await page.locator('.p-car-card').count(),1,'public directory renders public cars');
     if(route==='/cars/car1')assert.match(await page.locator('.p-car-banner').innerText(),/Lada Vesta/);
     if(route==='/stages/stage1'){
      const labels=await page.locator('.public-stage-poster-placeholder').evaluateAll(posters=>posters.flatMap(poster=>[...poster.children].map(child=>{const r=child.getBoundingClientRect();return {top:r.top,bottom:r.bottom}})));
      assert.equal(labels.length,5,'stage fixture must render all five fallback poster labels');
      for(let i=1;i<labels.length;i++)assert.ok(labels[i].top>=labels[i-1].bottom,'fallback poster labels must not overlap');
      await page.locator('.public-stage-rules>summary').click();
      assert.deepEqual(await page.locator('.public-stage-rules .public-rules-list-item>span:first-child').allInnerTexts(),['1.','2.','1.','3.','1.'],'saved stage regulation keeps the same numbering');
      row.stageRules='saved revision expanded with nested ordered numbering';
     }

     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'interactive state fits viewport');
     const notice=page.locator('.cookie-notice');
     if(await notice.isVisible()){
      const overflow=await notice.locator('.cookie-notice__copy').evaluate(element=>({scroll:element.scrollWidth,width:element.clientWidth,whiteSpace:getComputedStyle(element.querySelector('p')).whiteSpace}));
      assert.ok(overflow.scroll<=overflow.width+1,'cookie notice copy must wrap '+JSON.stringify(overflow));
     }
     if(width<=760&&role==='PARTICIPANT'){
      for(const selector of ['.participant-refresh','.participant-logout']){
       const control=page.locator(selector);if(await control.count()){
        const size=await control.evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert.ok(size.scroll<=size.width+1,'account control content fits its button');
        assert.ok(await control.locator('svg').isVisible(),'account icon remains visible');
       }
      }
     }
     if(width<=760&&role==='PARTICIPANT'&&route.includes('/participant/configurations')){
      const nav=page.locator('.participant-tabs');
      assert.equal(await nav.locator('[aria-current="page"]').innerText(),'Мои автомобили','configuration pages keep garage navigation');
      const header=await page.locator('.participant-portal-header').boundingBox();
      assert.ok(header.height<=80,'mobile account header stays one row');
      const actions=await page.locator('.participant-header-actions').boundingBox();assert.ok(actions.x+actions.width<=width,'account actions fit the mobile viewport');
      assert.ok(await page.getByRole('button',{name:'Выйти из аккаунта',exact:true}).isVisible(),'logout remains accessible');
     }
     if(width<=740&&role===null&&['/','/stages','/results?stageId=stage1'].includes(route)){
      assert.equal(await page.locator('.u-mobile-dock [aria-current="page"]').count(),1,'public dock marks one current section');
     }
     if(width<=740&&role===null&&route==='/stages'){
      row.mobileChrome=[];
      for(const height of [568,844,960]){
       await page.setViewportSize({width,height});
       await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
       await page.waitForFunction(()=>{
        const notice=document.querySelector('.cookie-notice')?.getBoundingClientRect();
        const dock=document.querySelector('body>.u-mobile-dock')?.getBoundingClientRect();
        return notice&&dock&&notice.top>=0&&notice.bottom<=dock.top+1&&Math.abs(dock.bottom-innerHeight)<=1;
       });
       row.mobileChrome.push({height,...await page.evaluate(()=>({noticeBottom:document.querySelector('.cookie-notice').getBoundingClientRect().bottom,dockTop:document.querySelector('body>.u-mobile-dock').getBoundingClientRect().top}))});
      }
      await page.evaluate(()=>scrollTo(0,0));
     }
     if(width<=760&&await notice.isVisible()){
      const chrome=await page.evaluate(()=>{
       const rect=selector=>{const e=document.querySelector(selector);if(!e||!e.getClientRects().length)return null;return e.getBoundingClientRect().toJSON()};
       return {notice:rect('.cookie-notice'),dock:rect('.participant-tabs,.u-mobile-dock'),save:rect('.config-editor-actions')};
      });
      if(chrome.dock&&chrome.dock.height)assert.ok(chrome.notice.bottom<=chrome.dock.top+1,'cookie notice leaves bottom navigation reachable: '+JSON.stringify(chrome));
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      if(role==='PARTICIPANT'&&route==='/participant?tab=registrations'){
      const card=await page.locator('.participant-registration-list>article').first().boundingBox();
      const main=await page.locator('.participant-registration-main').first().boundingBox();
      assert.ok(main.width>=card.width-50,'registration content uses the card width instead of squeezing beside cancel');
      assert.ok(await page.getByRole('button',{name:/Открыть карточку регистрации/}).isVisible());
     }
     if(role==='PARTICIPANT'&&route==='/participant?tab=profile')assert.equal(await page.locator('main h1').innerText(),'Мой профиль');
     if(role==='PARTICIPANT'&&route.includes('&edit=')){
       const save=await page.locator('.config-editor-actions').boundingBox(),cookie=await notice.boundingBox();
       assert.ok(save.y+save.height<=cookie.y,'save button remains above the cookie notice');
      }
      await page.evaluate(()=>scrollTo(0,0));
     }
     if(role==='ADMIN'){
      const mainColor=await page.locator('.main').evaluate(e=>getComputedStyle(e).backgroundColor);
      assert.equal(mainColor,'rgb(243, 245, 248)','admin workspace stays light');
      assert.equal(await page.locator('.menu-button').isVisible(),width<=800,'responsive admin menu control');
      if(route==='/admin'&&width===390){
       await page.getByRole('button',{name:'Меню',exact:true}).click();
       await page.locator('.sidebar').waitFor({state:'visible'});
       const adminBackdrop=page.locator('.app-shell .mobile-backdrop');
       await adminBackdrop.waitFor({state:'visible'});
       const adminAlpha=await adminBackdrop.evaluate(el=>parseFloat(getComputedStyle(el).backgroundColor.split(',').at(-1)));
       assert.ok(adminAlpha>=.7,'admin drawer backdrop must hide the page with a dark premium scrim');
       assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','admin drawer locks page scroll');
       await adminBackdrop.click();
       assert.equal(await adminBackdrop.count(),0,'outside press closes admin drawer');
       assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden','admin drawer restores page scroll');
       await page.getByRole('button',{name:'Меню',exact:true}).click();
       await page.getByRole('button',{name:'Автомобили',exact:true}).click();
       await page.waitForURL(/\/admin\/cars$/);
       row.mobileAdminNavigation='passed';
       await page.goto(base+route,{waitUntil:'networkidle'});
      }
     }
     if(role==='ADMIN'&&['/admin/registrations','/admin/inspections'].includes(route)){
      const root=page.locator('.event-ops-page');
      await root.waitFor();
      const geometry=await root.evaluate(el=>({right:el.getBoundingClientRect().right,viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(geometry.right<=geometry.viewport+1,'event operations must not leave a viewport-overhanging right strip '+JSON.stringify(geometry));
      assert.ok(geometry.scroll<=geometry.viewport+1,'event operations cannot horizontally scroll the page '+JSON.stringify(geometry));
      await page.locator('.event-ops-results .data-table tbody tr').first().waitFor();
      if(width<=760){
       const display=await page.locator('.event-ops-results .data-table tbody tr').first().evaluate(el=>getComputedStyle(el).display);
       assert.equal(display,'block','event registrations/inspections must render mobile cards, not wide desktop tables');
      }
      if(route==='/admin/registrations'){
       assert.match(await page.locator('.event-ops-metrics').innerText(),/всего записей/);
       assert.equal(await page.locator('.event-ops-search [role="status"]').innerText(),'1 из 1');
      }else{
       assert.equal(await page.locator('.event-ops-inspection-metrics button[aria-pressed="true"]').count(),1);
       assert.equal(await page.getByRole('button',{name:/Сформировать итоговый список/}).isDisabled(),true,'cannot export roster with pending entrants');
       await page.getByRole('button',{name:/ожидают/i}).click();
       assert.equal(await page.locator('.event-ops-results .data-table tbody tr').count(),1,'pending queue includes unchecked registrations');
      }
      row.adminEventOperations='full-width responsive roster and status controls';
     }
     if(route==='/admin/cars'&&role==='ADMIN'){
      assert.equal(await page.locator('.data-table tbody tr').count(),25);
      await page.getByRole('button',{name:'Следующая страница автомобилей',exact:true}).click();
      assert.equal(await page.locator('.data-table tbody tr').count(),25);
      assert.match(await page.locator('.data-table tbody tr').first().innerText(),/Vesta 26/);
      await page.getByRole('button',{name:'Предыдущая страница автомобилей',exact:true}).click();
      row.carPagination='25 rows per page; next and previous passed';
     }
     if(route==='/participant'&&role==='PARTICIPANT'){
      await page.getByRole('link',{name:'Мои автомобили',exact:true}).click();await page.waitForURL(/tab=cars/);
      await page.goBack();assert.equal(await page.locator('.participant-tabs [aria-current="page"]').innerText(),'Обзор');
      if(width<=760){const box=await page.locator('.participant-tabs').boundingBox();assert.ok(box.y+box.height>=958,'bottom navigation must stay at the viewport edge')}
      row.participantHistory='passed';
     }
     if(role===null&&route==='/'&&width<=1100){
      const toggle=page.locator('.public-nav-toggle');await toggle.click();
      assert.equal(await toggle.getAttribute('aria-expanded'),'true');
      const publicBackdrop=page.locator('body > .public-nav-scrim');
      await publicBackdrop.waitFor({state:'visible'});
      const backdropAlpha=await publicBackdrop.evaluate(el=>parseFloat(getComputedStyle(el).backgroundColor.split(',').at(-1)));
      assert.ok(backdropAlpha>=.7,'mobile menu must darken the full page behind the popup');
      const menuBackground=await page.locator('.public-nav-links[data-open="true"]').evaluate(el=>getComputedStyle(el).backgroundColor);
      assert.match(menuBackground,/^rgb\(/,'public menu must have an opaque background, not show page content through it');
      assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden','opening the public menu must lock background scroll');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'public dropdown must fit screen without side strip');
      await page.keyboard.press('Escape');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
      assert.equal(await publicBackdrop.count(),0,'Escape removes the backdrop');
      assert.notEqual(await page.evaluate(()=>document.body.style.overflow),'hidden','closing menu restores page scroll');
      await toggle.click();await publicBackdrop.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false','tapping backdrop closes mobile menu');
      await toggle.click();await page.getByRole('navigation',{name:'Основная навигация'}).getByRole('link',{name:'Этапы',exact:true}).click();await page.waitForURL(/\/stages$/);
      assert.equal(await page.getByRole('button',{name:'Открыть меню',exact:true}).getAttribute('aria-expanded'),'false');
      row.mobilePublicNavigation='passed';
      await page.goto(base+route,{waitUntil:'networkidle'});
     }
     if(role==='PARTICIPANT'&&route==='/participant?tab=registrations'){
      const card=await page.locator('.participant-registration-list>article').first().boundingBox();
      const main=await page.locator('.participant-registration-main').first().boundingBox();
      assert.ok(main.width>=card.width-50,'registration content uses the card width instead of squeezing beside cancel');
      assert.ok(await page.getByRole('button',{name:/Открыть карточку регистрации/}).isVisible());
     }
     if(role==='PARTICIPANT'&&route==='/participant?tab=profile')assert.equal(await page.locator('main h1').innerText(),'Мой профиль');
     if(role==='PARTICIPANT'&&route==='/participant/register?stageId=stage1'){
      const next=page.getByRole('button',{name:'Перейти к классам',exact:true});
      assert.equal(await next.isEnabled(),false,'cannot skip vehicle selection');
      assert.equal(await page.getByRole('button',{name:'03 Подтверждение',exact:true}).isEnabled(),false);
      await page.getByLabel('Ваш автомобиль',{exact:true}).selectOption('car1');
      await page.getByLabel('Сохранённое оборудование',{exact:true}).selectOption('v1');
      assert.equal(await next.isEnabled(),true);
      await page.screenshot({path:path.join(output,'registration-step1-'+width+'.png'),fullPage:true});
      await next.click();
      await page.getByRole('heading',{name:'В каких классах участвуете?',exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'Проверить заявку',exact:true}).isEnabled(),false,'requires a class');
      await page.locator('.registration-class-option').filter({hasText:'Limited 2.0'}).click();
      await page.screenshot({path:path.join(output,'registration-step2-'+width+'.png'),fullPage:true});
      await page.getByRole('button',{name:'Проверить заявку',exact:true}).click();
      await page.getByRole('heading',{name:'Проверьте вашу заявку',exact:true}).waitFor();
      assert.equal(await page.locator('.registration-submit').isEnabled(),false,'requires rule consent');
      await page.locator('.registration-rules-consent input').check();
      assert.equal(await page.locator('.registration-submit').isEnabled(),true);
      await page.getByRole('button',{name:'Изменить классы',exact:true}).click();
      assert.equal(await page.locator('.registration-class-option input').first().isChecked(),true,'back preserves class selection');
      await page.getByRole('button',{name:'Назад',exact:true}).click();
      assert.equal(await page.getByLabel('Ваш автомобиль',{exact:true}).inputValue(),'car1');
      assert.equal(await page.getByLabel('Сохранённое оборудование',{exact:true}).inputValue(),'v1');
      await page.getByRole('button',{name:'Перейти к классам',exact:true}).click();
      await page.getByRole('button',{name:'Проверить заявку',exact:true}).click();
      row.registrationFlow='three steps; selection gates; back preserves choices; rule consent gate; no submission';
      const end=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(end.scroll<=end.width+1,'confirmation fits viewport');
      assert.equal(errors.length,0,'flow has no runtime errors');
     }
     if(role==='PARTICIPANT'&&route.includes('&edit=')){
      const requestCopy=await page.locator('.catalog-request-inline>.secondary-button').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));
      assert.ok(requestCopy.scroll<=requestCopy.width+1,'the model-request button text must fit on mobile');
      const nav=page.getByRole('navigation',{name:'Разделы конфигуратора'});
      for(const key of ['FRONT','REAR','POWER','BOX','NOTES','SETUP','SUB']){
       const tab=nav.locator('[data-section="'+key+'"]');await tab.click();
       assert.equal(await tab.getAttribute('aria-pressed'),'true');
      }
      const workspace=page.locator('.config-direction-workspace[data-direction="SUB"]');
      const before=await workspace.locator('.config-row').count();
      await workspace.getByRole('button',{name:'Добавить',exact:true}).first().click();
      const picker=page.getByRole('dialog',{name:'Добавить оборудование',exact:true});
      // A missing catalog must fail visibly, not masquerade as a broken select.
      await picker.getByRole('combobox',{name:/^Бренд/}).locator('option[value="Alphard"]').waitFor({state:'attached',timeout:10000});
      await picker.getByRole('combobox',{name:/^Бренд/}).selectOption('Alphard');
      await picker.getByLabel('Поиск модели').fill('missing-fixture');
      assert.equal(await picker.getByRole('button',{name:'Добавить в бас',exact:true}).isEnabled(),false,'unlisted models cannot be added');
      await picker.getByLabel('Поиск модели').fill('Machete');
      await picker.getByRole('button',{name:/Alphard Machete/}).click();
      const pickerBox=await picker.boundingBox(),footBox=await picker.locator('.member-config-picker-foot').boundingBox();
      assert.ok(footBox.y+footBox.height<=pickerBox.y+pickerBox.height+1,'catalog actions stay inside the dialog');
      await picker.getByRole('button',{name:'Добавить в бас',exact:true}).click();
      assert.equal(await workspace.locator('.config-row').count(),before+1,'catalog equipment appears in the chosen direction');
      const equipment=workspace.locator('.member-equipment-item').last();await equipment.locator('summary').click();
      await equipment.getByLabel('Общее количество сабвуферов в системе',{exact:true}).fill('3');assert.equal(await equipment.locator('.member-equipment-quantity').innerText(),'3 шт.');await equipment.locator('summary').click();
      assert.equal(await equipment.locator('input').first().isVisible(),false,'equipment parameters collapse into a readable card');
      if(width<=390){
       await page.setViewportSize({width,height:568});
       await workspace.getByRole('button',{name:'Добавить',exact:true}).first().click();
       const shortDialog=page.getByRole('dialog',{name:'Добавить оборудование',exact:true});
       const frame=await shortDialog.boundingBox(),footer=await shortDialog.locator('.member-config-picker-foot').boundingBox();
       assert.ok(footer.y+footer.height<=frame.y+frame.height+1,'catalog actions fit a 568px mobile viewport');
       await shortDialog.getByRole('button',{name:'Закрыть выбор оборудования',exact:true}).click();
       await page.setViewportSize({width,height:960});
       row.shortMobileCatalog='568px height; add action stays inside dialog';
      }
      row.configuratorInteraction='all seven sections; catalog search; absent-model rejection; add to SUB without saving';
      await page.evaluate(()=>scrollTo(0,0));
     }
     row.status='passed';
    }catch(error){row.status='failed';row.error=error.message;row.runtimeErrors=errors;report.failures.push({role:row.role,width,route,error:error.message})}
    const name=row.role+'-'+width+'-'+route.replace(/[^a-zA-Z0-9]/g,'_');
    await page.screenshot({path:path.join(output,name+'.png'),fullPage:true,timeout:10000}).catch(error=>{row.screenshotError=error.message});
    row.durationMs=Date.now()-startedAt;
    page.off('pageerror',onError);report.pages.push(row);console.log(JSON.stringify(row));
    await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
   }
   await context.close();
  }
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));report.finishedAt=new Date().toISOString();report.requests=[...requests];await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))}
console.log('CANDIDATE_QA_SUMMARY '+JSON.stringify({pages:report.pages.length,passed:report.pages.filter(p=>p.status==='passed').length,failures:report.failures,blocked}));
if(report.failures.length||blocked.length)process.exitCode=1;
