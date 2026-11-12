import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const out=path.resolve('stage-actions-browser-qa');await mkdir(out,{recursive:true});
const dist=path.join(root,'frontend/dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{
  const file=path.resolve(dist,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return}
  let body,ext=path.extname(file);
  try{body=await readFile(file)}catch{body=await readFile(path.join(dist,'index.html'));ext='.html'}
  res.writeHead(200,{'Content-Type':mime[ext]??'application/octet-stream'}).end(body);
 }catch{res.writeHead(500).end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,report=[];
let browser;
try{
 browser=await chromium.launch(getBrowserLaunchOptions());
 for(const width of [320,390,768,1024,1366,1440]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  try{
   const stage={id:'stage-11',stageNumber:11,name:'USD Winter Cup Краснодар',city:'Краснодар',date:'2026-11-28T12:00:00',status:'PUBLISHED',registrationOpen:true,seasonId:'season',season:{year:2026},resultsPublishedAt:'2026-11-12T12:00:00Z'};
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin===base)return route.continue();
    let data=[];
    if(url.pathname==='/auth/refresh')data={accessToken:'synthetic',user:{id:'fixture-admin',email:'admin@example.test',role:'ADMIN'}};
    else if(url.pathname==='/stages')data=[stage,{...stage,id:'stage-10',stageNumber:10,name:'Финал Волгоград',city:'Волгоград',registrationOpen:false,status:'COMPLETED'}];
    else if(url.pathname==='/seasons')data=[{id:'season',year:2026}];
    else if(url.pathname.startsWith('/site-settings'))data={settings:{branding:{},homepage:{blocks:[]}}};
    return route.fulfill({json:data});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/admin/stages');
   const row=page.locator('tbody tr').first();await row.waitFor();
   const cookie=page.getByRole('button',{name:'Только необходимые',exact:true});if(await cookie.isVisible())await cookie.click();
   assert.equal(await row.locator('button').count(),2,'list contains registration and edit only');
   const controls=await row.locator('td.row-actions button').evaluateAll(buttons=>buttons.map(b=>{
    const rect=b.getBoundingClientRect(),cell=b.closest('td').getBoundingClientRect();
    return {text:b.textContent,left:rect.left,right:rect.right,cellLeft:cell.left,cellRight:cell.right,scroll:b.scrollWidth,client:b.clientWidth};
   }));
   for(const button of controls){
    assert.ok(button.left>=button.cellLeft-1&&button.right<=button.cellRight+1,'button fits its cell: '+JSON.stringify({width,button}));
    assert.ok(button.scroll<=button.client+1,'button text is not clipped: '+JSON.stringify({width,button}));
   }
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'list has no page overflow at '+width);
   await page.screenshot({path:path.join(out,'list-'+width+'.png'),fullPage:true});
   await row.locator('td').nth(1).click();
   await page.getByRole('heading',{name:'Быстрые действия',exact:true}).waitFor();
   for(const label of ['Афиша','Скрыть результаты','Отменить этап','Удалить навсегда'])assert.equal(await page.getByRole('button',{name:label,exact:true}).count(),1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'card has no page overflow at '+width);
   const cardButtons=await page.locator('.detail-actions button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {text:b.textContent,left:r.left,right:r.right}}));
   for(const button of cardButtons)assert.ok(button.left>=0&&button.right<=width+1,'card button stays visible: '+JSON.stringify({width,button}));
   await page.screenshot({path:path.join(out,'card-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'Редактировать',exact:true}).click();
   await page.getByRole('heading',{name:'Редактирование · Этапы',exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Афиша',exact:true}).count(),0);
   assert.equal(await page.getByRole('button',{name:'Удалить навсегда',exact:true}).count(),0);
   assert.deepEqual(errors,[]);
   report.push({width,twoListActions:true,buttonsFit:true,cardQuickActions:true,cleanEditor:true,noPageErrors:true});
  }finally{await context.close()}
 }
}finally{await browser?.close();await new Promise(r=>server.close(r))}
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
