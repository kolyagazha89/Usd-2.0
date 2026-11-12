import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const out=path.resolve('participant-car-browser-qa');await mkdir(out,{recursive:true});
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
 for(const width of [320,768,1366]){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});
  try{
   const person={id:'person-1',lastName:'Тестовый',firstName:'Участник',isPublic:false};
   const config={id:'config-1',name:'Сохранённая система',currentVersion:1,versions:[]};
   const car={id:'private-car',participantId:person.id,participant:person,brand:'Лада',model:'Веста',registrationCountry:'RU',registrationNumber:'А123АА181',isPublic:false,isActive:true,configurations:[config]};
   const second={...car,id:'car-2',brand:'УАЗ',model:'Патриот',configurations:[]};
   await context.route('**/*',async route=>{
    const url=new URL(route.request().url());if(url.origin===base)return route.continue();
    let data=[];
    if(url.pathname.startsWith('/media/public-file/'))return route.fulfill({contentType:'image/png',body:await readFile(path.join(root,'frontend/public/usd/usd-original.png'))});
    if(url.pathname==='/auth/refresh')data={accessToken:'synthetic',user:{id:'fixture-admin',email:'admin@example.test',role:'ADMIN'}};
    else if(url.pathname==='/admin/participants')data=[person];
    else if(url.pathname==='/participants/person-1/cars')data=[car,second];
    else if(url.pathname==='/history/participant/person-1')data={registrations:[]};
    else if(url.pathname==='/cars')data=[...Array.from({length:29},(_,index)=>({...car,id:'other-'+index,participantId:'other-person',brand:'Чужой',model:'Автомобиль'})),car,second];
    else if(url.pathname==='/cars/private-car/configurations')data=[config];
    else if(url.pathname.startsWith('/site-settings'))data={settings:{branding:{},homepage:{blocks:[]}}};
    return route.fulfill({json:data});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const capture=async name=>{
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' has no page overflow at '+width);
    await page.screenshot({path:path.join(out,name+'-'+width+'.png'),fullPage:true});
   };
   await page.goto(base+'/admin/participants?view=person-1');
   const open=page.getByRole('button',{name:'Открыть автомобиль Лада Веста',exact:true});await open.waitFor();
   const cookie=page.getByRole('button',{name:'Только необходимые',exact:true});if(await cookie.isVisible())await cookie.click();
   assert.equal(await page.getByRole('button',{name:'Открыть автомобиль УАЗ Патриот',exact:true}).count(),1);
   const controls=await page.locator('.participant-car-item button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width,height:r.height,scroll:b.scrollWidth,client:b.clientWidth}}));
   for(const b of controls)assert.ok(b.left>=0&&b.right<=width+1&&b.height>=40&&b.scroll<=b.client+1,'car links fit and are touchable: '+JSON.stringify({width,b}));
   await capture('participant');await open.click();
   await page.locator('.detail-grid').getByText('Веста',{exact:true}).waitFor();
   assert.equal(new URL(page.url()).searchParams.get('view'),'private-car');assert.equal(await page.locator('.data-table tbody tr').count(),0);
   await capture('car');
   await page.getByRole('button',{name:'Деактивировать автомобиль',exact:true}).click();
   await page.getByRole('group',{name:'Подтверждение деактивации автомобиля',exact:true}).getByText('Деактивировать Лада Веста?',{exact:true}).waitFor();
   assert.equal(new URL(page.url()).searchParams.get('view'),'private-car');
   await capture('car-confirmation');await page.getByRole('button',{name:'Отмена',exact:true}).click();
   await page.getByRole('button',{name:'Открыть конфигурации',exact:true}).click();
   await page.locator('.config-list').getByText('Сохранённая система',{exact:true}).waitFor();
   assert.equal(new URL(page.url()).searchParams.get('carId'),'private-car');await capture('configurations');
   await page.getByRole('button',{name:'Назад к автомобилю',exact:true}).click();
   await page.locator('.detail-grid').getByText('Веста',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Редактировать',exact:true}).click();
   await page.getByRole('button',{name:'К автомобилю',exact:true}).click();
   await page.locator('.detail-grid').getByText('Веста',{exact:true}).waitFor();
   await page.reload();await page.locator('.detail-grid').getByText('Веста',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Назад',exact:true}).click();
   await open.waitFor();assert.equal(new URL(page.url()).pathname,'/admin/participants');
   await page.getByRole('button',{name:'Конфигурации автомобиля Лада Веста',exact:true}).click();
   await page.locator('.config-list').getByText('Сохранённая система',{exact:true}).waitFor();
   assert.deepEqual(errors,[]);report.push({width,privateCarDirect:true,configurationsDirect:true,returnToParticipant:true,reloadPreservesCar:true,buttonsFit:true,noPageErrors:true});
  }finally{await context.close()}
 }
}finally{await browser?.close();await new Promise(r=>server.close(r))}
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
