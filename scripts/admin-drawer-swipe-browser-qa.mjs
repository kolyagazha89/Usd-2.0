import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const dist=path.join(root,'frontend/dist'),out=path.resolve(process.env.USD_SWIPE_QA_OUT??'admin-drawer-swipe-browser-qa');await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const file=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(dist+path.sep))return res.writeHead(403).end();let body,ext=path.extname(file);try{body=await readFile(file)}catch{body=await readFile(path.join(dist,'index.html'));ext='.html'}res.writeHead(200,{'Content-Type':mime[ext]??'application/octet-stream'}).end(body)}catch{res.writeHead(500).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(getBrowserLaunchOptions()),report=[];
try{
 for(const width of [390,768,1024]){
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true,isMobile:width<=800,reducedMotion:'reduce'});
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin===base)return route.continue();let data=[];if(url.pathname==='/auth/refresh')data={accessToken:'synthetic',user:{id:'fixture-admin',email:'admin@example.test',role:'ADMIN'}};else if(url.pathname==='/cars')data=Array.from({length:25},(_,i)=>({id:'car-'+i,brand:'Lada',model:'Vesta '+i,isActive:true,configurations:[]}));else if(url.pathname.startsWith('/site-settings'))data={settings:{branding:{}}};return route.fulfill({json:data})});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/admin/cars?previous=1');await page.locator('tbody tr').first().waitFor();await page.goto(base+'/admin/cars');await page.locator('tbody tr').first().waitFor();const cookie=page.getByRole('button',{name:'Только необходимые',exact:true});if(await cookie.isVisible())await cookie.click();
  const initial=await page.evaluate(()=>({url:location.href,history:history.length,overflow:document.body.style.overflow}));
  const session=await context.newCDPSession(page);
  const swipe=async(x,y,endX,endY)=>{await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=5;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(endX-x)*i/5,y:y+(endY-y)*i/5}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(150)};
  await swipe(4,350,165,355);
  if(width<=800){
   await page.locator('.sidebar.open').waitFor();assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'),'true');assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
   await page.screenshot({path:path.join(out,'open-'+width+'.png'),fullPage:false});
   await swipe(240,350,70,355);await page.waitForFunction(()=>!document.querySelector('.sidebar.open'));assert.equal(await page.locator('.menu-button').getAttribute('aria-expanded'),'false');assert.equal(await page.evaluate(()=>document.body.style.overflow),initial.overflow);
   await swipe(45,620,47,200);await page.waitForFunction(()=>scrollY>100);assert.equal(await page.locator('.sidebar.open').count(),0);
   await page.getByRole('button',{name:'Меню',exact:true}).click();await page.locator('.sidebar.open').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('.sidebar.open'));
   await page.getByRole('button',{name:'Меню',exact:true}).click();await page.getByRole('button',{name:'Закрыть меню',exact:true}).filter({has:page.locator('svg')}).click();await page.waitForFunction(()=>!document.querySelector('.sidebar.open'));
  }else assert.equal(await page.locator('.sidebar.open').count(),0);
  const final=await page.evaluate(()=>({url:location.href,history:history.length}));assert.equal(final.url,initial.url);assert.equal(final.history,initial.history);assert.deepEqual(errors,[]);report.push({width,...final,errors});await context.close();
 }
 await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){for(const context of browser.contexts())for(const page of context.pages()){await page.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(out,'failure.txt'),String(error)+'\n'+await page.locator('body').innerText().catch(()=>''));}throw error;}finally{await browser.close();await new Promise(r=>server.close(r))}
