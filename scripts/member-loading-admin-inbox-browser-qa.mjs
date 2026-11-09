import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const dist=path.resolve('frontend/dist'),output=path.resolve('member-inbox-browser-qa');await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{
 const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(dist,'.'+pathname);
 if(!file.startsWith(dist+path.sep)&&file!==dist){res.writeHead(403).end();return}
 let body;try{body=await readFile(file)}catch{body=await readFile(path.join(dist,'index.html'))}
 const ext=path.extname(file),type={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'}[ext]??'text/html';res.writeHead(200,{'Content-Type':type}).end(body);
 }catch{res.writeHead(500).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(getBrowserLaunchOptions());const results=[];
try{
 for(const width of [390,1440]){
  let role='ADMIN',receipt=false,done=false,releaseProfile;
  const writes=[],errors=[];
  const notification={id:'123e4567-e89b-42d3-a456-426614174001',kind:'CATALOG_REQUEST',title:'Запрос на добавление комплектующего',body:'Проверьте запрос оборудования.',path:'/admin/components?tab=requests',createdAt:'2026-11-09T08:00:00Z'};
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'no-preference',serviceWorkers:'block'});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url()),p=url.pathname;
   if(url.origin===base)return route.continue();
   if(request.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"/>'});
   if(url.hostname!=='api.usd-russia.ru')return route.abort();
   const user={id:'fixture-user',email:'fixture@example.invalid',role,participantId:'fixture-person'};
   let value=[];
   if(p==='/auth/refresh')value={accessToken:'synthetic-only',user};
   else if(p==='/participants/me'){
    if(releaseProfile===null)await new Promise(resolve=>{releaseProfile=resolve});
    value={participant:{id:'fixture-person',firstName:'Тест',lastName:'Участник',isPublic:true}};
   }else if(p==='/participants/me/historical-final-configuration')value={required:false};
   else if(p==='/auth/legal-consent')value={legalReady:false};
   else if(p==='/site-settings'||p==='/site-settings/public')value={settings:{branding:{},catalogs:{},legal:{},homepage:{}}};
   else if(p.startsWith('/media/'))value={url:''};
   else if(p==='/admin/inbox/summary')value={unread:!receipt&&!done?1:0};
   else if(p==='/admin/inbox'){
    const status=done?'DONE':receipt?'READ':'UNREAD',filter=url.searchParams.get('status');
    const items=!filter||filter==='all'||filter===status.toLowerCase()?[{...notification,status,readAt:receipt?'2026-11-09T08:01:00Z':null,completedAt:done?'2026-11-09T08:02:00Z':null}]:[];
    value={items,counts:{total:1,unread:!receipt&&!done?1:0,read:receipt&&!done?1:0,done:done?1:0},nextCursor:null};
   }else if(p.startsWith('/admin/inbox/')&&request.method()==='PATCH'){
    const payload=request.postDataJSON();writes.push(payload.status);receipt=true;if(payload.status==='DONE')done=true;value={success:true};
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  try{
   await page.goto(base+'/admin/inbox');
   const cookie=page.getByRole('button',{name:'Только необходимые',exact:true});if(await cookie.isVisible())await cookie.click();
   await page.getByRole('heading',{name:notification.title,exact:true}).waitFor();
   await page.getByRole('link',{name:'Уведомления: 1 непросмотренных',exact:true}).waitFor();
   assert.equal(writes.length,0,'opening the inbox must not mark all events read');
   await page.getByRole('button',{name:'Отметить просмотренным',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.admin-inbox-card.is-read'));
   await page.getByRole('link',{name:'Уведомления: 0 непросмотренных',exact:true}).waitFor();
   await page.getByRole('button',{name:'Отметить выполненным',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('.admin-inbox-card.is-done'));
   await page.getByRole('button',{name:/^Не просмотрено/}).click();await page.getByRole('heading',{name:'Уведомлений нет',exact:true}).waitFor();
   await page.getByRole('button',{name:/^Выполнено/}).click();await page.getByRole('heading',{name:notification.title,exact:true}).waitFor();
   assert.deepEqual(writes,['READ','DONE']);
   await page.getByRole('button',{name:/^Открыть раздел/}).click();
   await page.waitForFunction(()=>document.querySelector('.component-request-queue'));
   assert.ok(page.url().endsWith('/admin/components?tab=requests'),'notification must open the request queue directly');
   await page.goto(base+'/admin/inbox');await page.getByRole('heading',{name:notification.title,exact:true}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'inbox must not overflow on mobile');
   await page.screenshot({path:path.join(output,'inbox-'+width+'.png'),fullPage:true});
   role='PARTICIPANT';releaseProfile=null;
   await page.goto(base+'/participant?tab=profile');
   const dock=page.locator(width<=760?'body > .participant-tabs':'.participant-tabs');await dock.waitFor();
   await page.waitForFunction(()=>document.querySelector('.participant-loading'));
   const loading=await dock.boundingBox();assert.ok(loading);
   if(width<=760)assert.equal(await dock.evaluate(e=>getComputedStyle(e).backdropFilter),'none','opaque dock must not create a Safari backdrop compositing layer during loading');
   await page.screenshot({path:path.join(output,'member-loading-'+width+'.png')});
   if(width<=760)assert.ok(Math.abs(loading.y+loading.height-844)<1,'loading dock must touch viewport bottom');
   assert.equal(typeof releaseProfile,'function','profile data is still pending when geometry is sampled');
   releaseProfile();await page.waitForFunction(()=>!document.querySelector('.participant-loading'));
   const loaded=await dock.boundingBox();
   if(width<=760){assert.ok(Math.abs(loaded.y-loading.y)<1,'dock top moved after profile data');assert.ok(Math.abs(loaded.height-loading.height)<1,'dock height changed after profile data')}
   assert.equal(await page.getByRole('link',{name:/^Уведомления:/}).count(),0,'participant cannot see ADMIN inbox controls');
   await page.screenshot({path:path.join(output,'member-loaded-'+width+'.png')});
   assert.deepEqual(errors,[]);results.push({width,status:'passed',loadingDock:loading,loadedDock:loaded});
  }catch(error){results.push({width,status:'failed',error:error.message});await page.screenshot({path:path.join(output,'failed-'+width+'.png')})}
  finally{if(typeof releaseProfile==='function')releaseProfile();await context.close()}
 }
}finally{await browser.close();server.close();await writeFile(path.join(output,'report.json'),JSON.stringify(results,null,2))}
console.log(JSON.stringify(results,null,2));if(results.some(row=>row.status==='failed'))process.exitCode=1;
