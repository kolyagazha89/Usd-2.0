import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isCandidateApiRequest} from './candidate-browser-qa-config.mjs';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
import {fileURLToPath} from 'node:url';

const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const output=path.resolve(process.env.USD_PARTNER_QA_OUTPUT||'partner-image-browser-qa');
await mkdir(output,{recursive:true});
const dist=fileURLToPath(new URL('../frontend/dist',import.meta.url));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2'};
const sample='<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320"><rect width="320" height="320" fill="#08090d"/><text x="160" y="170" text-anchor="middle" fill="#ef1839" font-size="55" font-family="sans-serif" font-weight="bold">USD</text><text x="160" y="200" text-anchor="middle" fill="white" font-size="16">PARTNER</text></svg>';
const server=createServer(async(req,res)=>{
 try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/qa-partner-image'){
   const local=process.env.USD_PARTNER_QA_IMAGE;
   res.writeHead(200,{'Content-Type':local?(types[path.extname(local)]||'image/png'):'image/svg+xml'}).end(local?await readFile(local):sample);return;
  }
  if(pathname==='/qa-broken-image'){res.writeHead(404).end();return}
  const file=path.resolve(dist,'.'+pathname);
  if(!file.startsWith(dist+path.sep)&&file!==dist){res.writeHead(403).end();return}
  let body,ext=path.extname(file);
  try{body=await readFile(file)}catch{body=await readFile(path.join(dist,'index.html'));ext='.html'}
  res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'}).end(body);
 }catch{res.writeHead(500).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(getBrowserLaunchOptions());
const report={checks:[],blocked:[],failures:[]};
try{
 for(const width of [320,390,768,1440]){
  const settings={branding:{siteName:'USD'},homepage:{blocks:[]},contacts:{},catalogs:{},legal:{},partners:[
   {id:'aura',name:'Aura Sound Equipment',tier:'PREMIUM',isActive:true,isPublished:true,photoUrl:'/qa-partner-image',imageLayout:{mode:'LOGO',aspectWidth:16,aspectHeight:9,scale:100,positionX:50,positionY:50}},
   {id:'broken',name:'Изображение недоступно',tier:'PREMIUM',isActive:true,isPublished:true,photoUrl:'/qa-broken-image',imageLayout:{mode:'LOGO',aspectWidth:1,aspectHeight:1}},
   {id:'legacy',name:'Без настроек',tier:'REGULAR',isActive:true,isPublished:true,photoUrl:'/qa-partner-image'},
  ]};
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  const errors=[];const saves=[];
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),method=request.method();
   if(url.origin===base)return route.continue();
   if(isCandidateApiRequest(url)){
    let data=[];
    if(url.pathname==='/auth/refresh'||url.pathname==='/auth/me'){
     const user={id:'qa-admin',email:'fixture@example.test',role:'ADMIN',participantId:null};
     data=url.pathname==='/auth/refresh'?{accessToken:'synthetic-partner-fixture',user}:user;
    }else if(url.pathname==='/site-settings'&&method==='PATCH'){
     const saved=request.postDataJSON();saves.push(saved);Object.assign(settings,saved);data={settings};
    }else if(url.pathname==='/site-settings'||url.pathname==='/site-settings/public')data={settings};
    else if(!['GET','HEAD','OPTIONS'].includes(method)){
     report.blocked.push({method,path:url.pathname});return route.abort('blockedbyclient');
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
   }
   if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
   if(request.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:sample});
   report.blocked.push({method,host:url.hostname,path:url.pathname});return route.abort('blockedbyclient');
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const assertViewport=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow at '+width);
  try{
   await page.goto(base+'/admin/partners',{waitUntil:'networkidle'});
   const cookies=page.getByRole('button',{name:'Только необходимые',exact:true});
   if(await cookies.isVisible())await cookies.click();
   const edit=()=>page.locator('tr').filter({hasText:'Aura Sound Equipment'}).getByTitle('Изменить').click();
   await edit();await page.locator('[name="imageAspect"]').selectOption('custom');
   await page.locator('[name="imageAspectWidth"]').fill('5');await page.locator('[name="imageAspectHeight"]').fill('2');
   await page.locator('[name="imageMode"]').selectOption('BANNER');
   await page.locator('[name="imageScale"]').focus();await page.keyboard.press('ArrowRight');
   assert.equal(await page.locator('[name="imageScale"]').inputValue(),'105');
   await assertViewport();
   if([390,1440].includes(width)){
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(output,`editor-${width}.png`),fullPage:true});
   }
   await page.getByRole('button',{name:'Сохранить партнёра',exact:true}).click();
   await page.locator('.data-table').waitFor();assert.equal(saves.length,1);
   assert.deepEqual(saves[0].partners[0].imageLayout,{mode:'BANNER',aspectWidth:5,aspectHeight:2,scale:105,positionX:50,positionY:50});
   await edit();assert.equal(await page.locator('[name="imageAspectWidth"]').inputValue(),'5');
   await page.goto(base+'/partners',{waitUntil:'networkidle'});
   const card=page.locator('.usd-partner-card').filter({hasText:'Aura Sound Equipment'});
   const frame=card.locator('.partner-image-frame');
   const box=await frame.boundingBox();assert.ok(Math.abs(box.width/box.height-2.5)<0.03);
   const style=await frame.locator('img').evaluate(img=>{
    const css=getComputedStyle(img),matrix=new DOMMatrixReadOnly(css.transform);
    return {fit:css.objectFit,x:matrix.a,y:matrix.d,position:css.objectPosition};
   });
   assert.equal(style.fit,'cover');assert.equal(style.x,style.y);assert.ok(Math.abs(style.x-1.05)<.001);
   await page.locator('.usd-partner-card').filter({hasText:'Изображение недоступно'}).locator('.p-photo-fallback').waitFor();
   assert.equal(await page.locator('.usd-partner-card').filter({hasText:'Без настроек'}).locator('.p-partner-logo').count(),1);
   await assertViewport();
   if([390,1440].includes(width))await page.screenshot({path:path.join(output,`partners-${width}.png`),fullPage:true});
   await page.goto(base+'/admin/partners',{waitUntil:'networkidle'});await edit();
   await page.locator('[name="imageMode"]').selectOption('LOGO');
   await page.locator('[name="imageAspect"]').selectOption('16:9');
   await page.locator('[name="imagePositionX"]').focus();await page.keyboard.press('Home');
   await page.locator('[name="imagePositionY"]').focus();await page.keyboard.press('End');
   await page.getByRole('button',{name:'Сохранить партнёра',exact:true}).click();await page.locator('.data-table').waitFor();
   await page.goto(base+'/partners',{waitUntil:'networkidle'});
   const logoStyle=await page.locator('.usd-partner-card').filter({hasText:'Aura Sound Equipment'}).locator('.partner-image-frame img').evaluate(img=>({fit:getComputedStyle(img).objectFit,position:getComputedStyle(img).objectPosition}));
   assert.equal(logoStyle.fit,'contain');assert.equal(logoStyle.position,'0% 100%');
   await page.goto(base+'/admin/partners',{waitUntil:'networkidle'});await edit();
   await page.getByRole('button',{name:'Сбросить оформление',exact:true}).click();
   const imageGeometry=img=>{const s=getComputedStyle(img);return {height:s.height,paddingTop:s.paddingTop,paddingBottom:s.paddingBottom,fit:s.objectFit}};
   const resetPreview=await page.locator('.partner-image-preview img').evaluate(imageGeometry);
   await page.getByRole('button',{name:'Сохранить партнёра',exact:true}).click();await page.locator('.data-table').waitFor();
   await page.goto(base+'/partners',{waitUntil:'networkidle'});
   const resetPublic=await page.locator('.usd-partner-card').filter({hasText:'Aura Sound Equipment'}).locator('img').evaluate(imageGeometry);
   assert.deepEqual(resetPreview,resetPublic,'reset preview must reproduce saved legacy image geometry');
   assert.deepEqual(errors,[]);report.checks.push({width,saveReload:true,customRatio:'5:2',banner:'cover',logo:'contain',keyboardScale:true,uniformScale:true,legacy:true,brokenImage:true});
  }catch(e){report.failures.push({width,message:String(e)});await page.screenshot({path:path.join(output,`failure-${width}.png`),fullPage:true})}
  finally{await context.close()}
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))}
console.log(JSON.stringify(report,null,2));assert.equal(report.failures.length,0);assert.equal(report.blocked.length,0);
