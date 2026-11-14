import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
import {isCandidateApiRequest} from './candidate-browser-qa-config.mjs';

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
let checks=0;
try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
  let mode='ready',role='ADMIN',setupCalls=0;
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
  downloaded=page.waitForEvent('download');
  await main.getByRole('button',{name:'Повторно скачать ключ судей',exact:true}).click();
  assert.equal((await readFile(await (await downloaded).path(),'utf8')).trim(),'D'.repeat(43));
  checks++;
  mode='tamper';await main.getByRole('button',{name:'Скачать файл этапа',exact:true}).click();
  await main.getByRole('alert').filter({hasText:'не прошёл проверку'}).waitFor();checks++;
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(overflow,false,'horizontal overflow at '+width);
  await page.screenshot({path:path.join(output,'venue-'+width+'.png'),fullPage:true});checks++;
  for(const state of ['missing','error','empty']){
   mode=state;await page.reload();await main.getByText('Подготовка файла настоящего этапа',{exact:true}).click();
   if(state==='missing')await main.getByText('Для настоящего этапа нужна однократная настройка подписи на сервере.',{exact:false}).waitFor();
   if(state==='error')await main.getByRole('alert').filter({hasText:'Сервер временно недоступен'}).waitFor();
   if(state==='empty')assert.equal(await main.getByRole('button',{name:'Скачать файл этапа',exact:true}).isDisabled(),true);
   assert.equal(await main.getByRole('link',{name:'Скачать для Windows',exact:true}).count(),1);checks++;
  }
  role='PARTICIPANT';const callsBefore=setupCalls;await page.reload();
  await main.getByRole('alert').filter({hasText:'только администратору'}).waitFor();
  assert.equal(setupCalls,callsBefore);assert.equal(await main.getByRole('link',{name:'Скачать для Windows',exact:true}).count(),0);checks++;
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log(JSON.stringify({passed:checks,widths:[320,390,768,1440],screenshots:output,realNetworkWrites:0}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
