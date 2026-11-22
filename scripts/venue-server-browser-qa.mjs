import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
import {isCandidateApiRequest} from './candidate-browser-qa-config.mjs';
import {venueCertificatePage} from '../backend/src/stages/venue-certificate-page.ts';
import {venueLiveRowsPerScreen} from '../frontend/src/public/venue-live-model.ts';
import {X509Certificate} from 'node:crypto';

const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const dist=fileURLToPath(new URL('../frontend/dist',import.meta.url));
const output=path.resolve(process.env.USD_VENUE_QA_OUTPUT||'/tmp/usd-venue-browser-qa');
await mkdir(output,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.zip':'application/zip','.json':'application/json'};
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const file=path.resolve(dist,'.'+pathname);
  if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
  let body,ext=path.extname(file);
  try{body=await readFile(file)}catch{
   if(pathname.startsWith('/downloads/')){res.writeHead(404).end();return;}
   body=await readFile(path.join(dist,'index.html'));ext='.html';
  }
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'}).end(body);
 }catch{res.writeHead(500).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(getBrowserLaunchOptions());
const publicKeyPem='-----BEGIN PUBLIC KEY-----\nfixture\n-----END PUBLIC KEY-----\n';
const setup={signing:{ready:true,publicKeyPem,fingerprint:'a'.repeat(64)},centralSyncReady:false,fieldAcceptanceComplete:false};
const stages=[{id:'one',name:'USD — длинное название этапа для проверки переноса текста',city:'Екатеринбург',date:'2026-11-13',status:'PUBLISHED'},{id:'draft',name:'Черновик',status:'DRAFT'}];
const rootPem=await readFile(new URL('../deploy/venue-lan/test-fixtures/public-root-ca.crt',import.meta.url),'utf8');
const rootCert=new X509Certificate(rootPem);
const certificate={available:true,sha256:rootCert.fingerprint256.replace(/:/g,'').toLowerCase(),notAfter:rootCert.validTo,updatedAt:new Date().toISOString()};
let checks=0;
try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
  let mode='ready',role='ADMIN',setupCalls=0;
  const reviewId='8b596264-15dd-46d8-92aa-c4e1c50c0208';
  const sourceId='e510f672-79f7-44eb-8173-2a8ff94b1c0e';
  const targetId='8b596264-15dd-46d8-92aa-c4e1c50c0205';
  const reviewKey='Participant:'+sourceId;
  let reviewStatus='PENDING',submittedReview=null;
  const errors=[];
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin===base)return route.continue();
   if(!isCandidateApiRequest(url))return route.abort();
   let data=[];
   if(url.pathname==='/auth/refresh'||url.pathname==='/auth/me'){
    const user={id:'synthetic-admin',email:'fixture@example.test',role,customRoleId:role==='ADMIN'?null:'judge',customRole:role==='ADMIN'?null:{name:'Судья',permissions:{stages:['view']}}};
    data=url.pathname==='/auth/refresh'?{accessToken:'synthetic-test-token',user}:user;
   }else if(url.pathname==='/stages/venue/setup'){
    setupCalls++;
    if(mode==='error')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Сервер временно недоступен'})});
    data=mode==='missing'?{...setup,signing:{ready:false,publicKeyPem:null,fingerprint:null}}:setup;
   }else if(url.pathname==='/stages/venue/returns')data={items:mode==='review'?[{id:reviewId,stageId:'c510f672-79f7-44eb-8173-2a8ff94b1c0e',status:reviewStatus,journalEndHash:'a'.repeat(64),version:0,createdAt:new Date().toISOString(),conflictCount:1}]:[],page:1,pageSize:20,total:mode==='review'?1:0};
   else if(url.pathname==='/stages/venue/returns/'+reviewId&&route.request().method()==='GET')data={id:reviewId,stageId:'c510f672-79f7-44eb-8173-2a8ff94b1c0e',status:reviewStatus,journalEndHash:'a'.repeat(64),version:0,createdAt:new Date().toISOString(),conflicts:[{key:reviewKey,table:'Participant',sourceId,source:{id:sourceId,name:'Иванов Иван'},candidates:[{id:targetId,name:'Иванов Иван',city:'Тюмень'}]}]};
   else if(url.pathname==='/stages/venue/returns/'+reviewId+'/decisions'&&route.request().method()==='POST'){
    submittedReview=JSON.parse(route.request().postData()||'{}');
    reviewStatus='APPROVED';data={status:reviewStatus};
   }
   else if(url.pathname==='/stages/venue/certificate')data=certificate;
   else if(url.pathname==='/stages/venue/certificate/install')return route.fulfill({status:200,contentType:'text/html',body:venueCertificatePage(certificate.sha256,new Date(certificate.notAfter))});
   else if(url.pathname.startsWith('/stages/venue/certificate/download/')){
    const format=url.pathname.endsWith('/cer')?'cer':'crt';
    assert.equal(url.searchParams.get('sha256'),certificate.sha256);
    return route.fulfill({status:200,headers:{'Content-Type':format==='cer'?'application/pkix-cert':'application/x-x509-ca-cert','Content-Disposition':'attachment; filename="USD-Venue-CA.'+format+'"'},body:format==='cer'?rootCert.raw:Buffer.from(rootPem)});
   }else if(url.pathname==='/stages')data=mode==='empty'?[]:stages;
   else if(url.pathname==='/stages/venue/one/staff-export'&&route.request().method()==='POST'){
    const now=Date.now();
    data={signed:{snapshot:{stageId:mode==='tamper'?'other':'one',generatedAt:new Date(now).toISOString(),expiresAt:new Date(now+10000).toISOString(),syncAuthorization:{token:'A'.repeat(43),expiresAt:new Date(now+3600000).toISOString()},staffAccess:{format:1,algorithm:'AES-256-GCM',nonce:'A'.repeat(16),tag:'B'.repeat(22),ciphertext:'C'.repeat(120)}},integrity:{algorithm:'Ed25519',signature:'b'.repeat(86),sha256:'c'.repeat(64),publicKeyFingerprint:'a'.repeat(64)}},staffKey:'D'.repeat(43),staffCount:3};
   }else if(url.pathname==='/site-settings'||url.pathname==='/site-settings/public')data={branding:{siteName:'USD'},homepage:{blocks:[]}};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/admin/venue-server?stageId=one');
  await page.getByRole('heading',{name:'Офлайн-сервер',exact:true}).waitFor();
  const main=page.locator('.venue-server-page');
  await main.getByRole('heading',{name:'Возврат данных · Конфликты',exact:true}).waitFor();
  await main.getByText('Новых конфликтов пока нет.',{exact:false}).waitFor();
  await main.getByRole('button',{name:'Скопировать ссылку для MAX',exact:true}).waitFor();
  const installLink=main.getByRole('link',{name:'Открыть страницу установки',exact:true});
  assert.equal(new URL(await installLink.getAttribute('href')).searchParams.get('sha256'),certificate.sha256);
  const popup=page.waitForEvent('popup');await installLink.click();const installPage=await popup;
  await installPage.getByRole('heading',{name:'USD — сертификат для судей',exact:true}).waitFor();
  for(const format of ['cer','crt']){
   const download=installPage.waitForEvent('download');
   await installPage.getByRole('link',{name:format==='cer'?'Скачать для iPhone (.cer)':'Скачать для Android (.crt)',exact:true}).click();
   const file=await download;assert.equal(file.suggestedFilename(),'USD-Venue-CA.'+format);
   const actual=new X509Certificate(await readFile(await file.path()));
   assert.equal(actual.fingerprint256,rootCert.fingerprint256);checks++;
  }
  assert.equal(await installPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await installPage.screenshot({path:path.join(output,'certificate-'+width+'.png'),fullPage:true});
  await installPage.close();checks++;
  await main.getByRole('heading',{name:'Сохраните результаты в защищённый файл'}).waitFor();
  await main.getByText('USD-Export.cmd',{exact:true}).waitFor();
  await main.getByText('Подготовка файла настоящего этапа',{exact:true}).click();
  await main.getByRole('button',{name:'Скачать файл этапа',exact:true}).waitFor();
  assert.equal(await page.locator('select option').filter({hasText:'Черновик'}).count(),0);
  for(const name of ['Скачать для Windows','Скачать инструкцию']){
   const downloaded=page.waitForEvent('download');await main.getByRole('link',{name,exact:true}).click();
   const file=await downloaded;
   const bytes=await readFile(await file.path());
   if(name==='Скачать для Windows'){assert.equal(bytes.subarray(0,2).toString(),'PK');assert.equal(file.suggestedFilename(),'USD-Offline-Windows.zip');}
   else assert.ok(bytes.toString().includes('Доверие сертификатам'));
   checks++;
  }
  let downloaded=page.waitForEvent('download');await main.getByRole('button',{name:'Скачать открытый ключ',exact:true}).click();
  assert.equal(await readFile(await (await downloaded).path(),'utf8'),publicKeyPem);checks++;
  downloaded=page.waitForEvent('download');await main.getByRole('button',{name:'Скачать файл этапа',exact:true}).click();
  assert.equal(JSON.parse(await readFile(await (await downloaded).path(),'utf8')).snapshot.stageId,'one');checks++;
  // Browsers can block a second automatic file from one gesture.
  // The key must be an explicit separate download, never auto-triggered.
  await main.getByRole('button',{name:'Скачать ключ судей (.key)',exact:true}).waitFor();
  downloaded=page.waitForEvent('download');
  await main.getByRole('button',{name:'Скачать ключ судей (.key)',exact:true}).click();
  assert.equal((await readFile(await (await downloaded).path(),'utf8')).trim(),'D'.repeat(43));
  checks++;
  if(width===390){
   mode='review';await page.reload();
   await main.locator('.venue-return-review-item').waitFor();
   await main.locator('.venue-return-review-item').click();
   await main.getByRole('combobox',{name:'Решение по '+reviewKey}).selectOption('LINK:'+targetId);
   await main.getByRole('textbox',{name:'Основание решения'}).fill('Проверил госномер и историю выступлений');
   await main.getByRole('button',{name:'Сохранить решения с аудитом'}).click();
   await main.getByText('Решение сохранено с аудитом.',{exact:false}).waitFor();
   assert.equal(submittedReview?.version,0);
   assert.deepEqual(submittedReview?.decisions?.map(d=>({key:d.key,action:d.action,targetId:d.targetId})),
    [{key:reviewKey,action:'LINK',targetId}]);checks++;
   mode='ready';await page.reload();
   await main.getByText('Подготовка файла настоящего этапа',{exact:true}).click();
  }
  mode='tamper';await main.getByRole('button',{name:'Скачать файл этапа',exact:true}).click();
  await main.getByRole('alert').filter({hasText:'не прошёл проверку'}).waitFor();checks++;
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(overflow,false,'horizontal overflow at '+width);
  await page.screenshot({path:path.join(output,'venue-'+width+'.png'),fullPage:true});checks++;
  for(const state of ['missing','error','empty']){
   mode=state;await page.reload();await main.getByText('Подготовка файла настоящего этапа',{exact:true}).click();
   if(state==='missing')await main.getByText('Для загрузки настоящего этапа требуется настройка ключа подписи на основной Ubuntu.',{exact:false}).waitFor();
   if(state==='error')await main.getByRole('alert').filter({hasText:'Сервер временно недоступен'}).waitFor();
   if(state==='empty')assert.equal(await main.getByRole('button',{name:'Скачать файл этапа',exact:true}).isDisabled(),true);
   assert.equal(await main.getByRole('link',{name:'Скачать для Windows',exact:true}).count(),1);checks++;
  }
  role='PARTICIPANT';const callsBefore=setupCalls;await page.reload();
  await main.getByRole('alert').filter({hasText:'только администратору'}).waitFor();
  assert.equal(setupCalls,callsBefore);assert.equal(await main.getByRole('link',{name:'Скачать для Windows',exact:true}).count(),0);checks++;
  assert.deepEqual(errors,[]);await context.close();
 }
 const venueConfig=await readFile(new URL('../deploy/venue-lan/config/venue-config.js',import.meta.url),'utf8');
 for(const {width,height} of [{width:390,height:664},{width:667,height:366},{width:1366,height:650},{width:1920,height:1080}]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<700,hasTouch:width<700,serviceWorkers:'block'});
  const capacity=venueLiveRowsPerScreen(height,width);
  let resultCount=1;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!==base)return route.abort();
   if(url.pathname==='/usd-venue-config.js')return route.fulfill({contentType:'text/javascript',body:venueConfig});
   if(url.pathname==='/venue-api/results/venue-live'){
    assert.equal(route.request().method(),'GET');
    return route.fulfill({json:{
     stage:{id:'live-test',name:'Тестовый этап'},updatedAt:new Date().toISOString(),
     rows:Array.from({length:resultCount},(_,index)=>({
      id:String(index),value:String(150-index),unit:'DB',place:index+1,number:index+1,
      participant:'Участник '+(index+1),car:'Тестовое авто',
      class:{id:'spl',name:'1×2',direction:{name:'SPL'}},
     })),
    }});
   }
   return route.continue();
  });
  const page=await context.newPage();
  const rows=page.locator('.venue-tv-result');
  const heading=page.locator('.venue-tv-table-head');
  const panel=page.locator('.venue-tv-content');
  const heights=[];
  for(const count of [1,capacity]){
   resultCount=count;
   await page.goto(base+'/venue/live?screen=spl');
   await rows.nth(count-1).waitFor();
   assert.equal(await rows.count(),count);
   const [header,first,last,bounds]=await Promise.all([heading.boundingBox(),rows.first().boundingBox(),rows.last().boundingBox(),panel.boundingBox()]);
   assert.ok(Math.abs(first.y-header.y-header.height)<1,'First LIVE row starts at the column heading');
   assert.ok(first.height>=28&&first.height<=89,'LIVE row has a readable, capped height');
   assert.ok(last.y+last.height<=bounds.y+bounds.height,'Last LIVE row fits on screen');
   heights.push(first.height);
   checks++;
  }
  assert.ok(Math.abs(heights[0]-heights[1])<1,'One result and a full page use the same row height');
  await context.close();
 }
 console.log(JSON.stringify({passed:checks,widths:[320,390,768,1440],screenshots:output,realNetworkWrites:0}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
