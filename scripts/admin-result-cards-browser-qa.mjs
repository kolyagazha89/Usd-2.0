import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';

const {chromium,webkit}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const engine=process.env.USD_RESULT_CARDS_ENGINE??'chromium';
assert.ok(['chromium','webkit'].includes(engine));
const output=path.resolve(process.env.USD_RESULT_CARDS_OUT??'admin-result-cards-browser-qa');await mkdir(output,{recursive:true});
const dist=path.resolve('frontend/dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 try{const pathname=new URL(req.url,'http://localhost').pathname,file=path.resolve(dist,'.'+pathname);if(!file.startsWith(dist+path.sep))return res.writeHead(403).end();let body,ext=path.extname(file);try{body=await readFile(file)}catch{body=await readFile(path.join(dist,'index.html'));ext='.html'}res.writeHead(200,{'Content-Type':types[ext]??'application/octet-stream'}).end(body)}catch{res.writeHead(500).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
const stage={id:'stage-cards',stageNumber:1,name:'Проверочный этап USD',date:'2026-11-25T12:00:00Z',status:'PUBLISHED',venueActive:true,season:{id:'s1',year:2026}};
const completed={...stage,id:'stage-closed',status:'COMPLETED',venueActive:false};
const user={id:'qa-admin',email:'admin@example.test',role:'ADMIN'};
const specimens=[
 {value:'150.25',place:1,name:'Limited 2.0',unit:'DB',number:7},
 {value:'139.90',place:null,name:'Очень длинное название класса BassRace для проверки переносов',unit:'DB',number:101,long:true},
 {value:'0',place:12,name:'Открытый класс',unit:'MPS',number:82,isHistorical:true},
];
const entries=specimens.map((spec,index)=>{
 const participant={id:'p'+index,lastName:spec.long?'Тестовый-Длиннофамильный':'Тестовый',firstName:'Иван',middleName:'Александрович',team:'Проверочная команда'};
 const car={id:'car'+index,brand:spec.long?'Mercedes-Benz':'Lada',model:spec.long?'Очень длинное название модели автомобиля':'Vesta',registrationNumber:'А123АА123',participantId:participant.id,participant};
 const klass={id:'class'+index,name:spec.name,unit:spec.unit,direction:{id:index===1?'bass':'spl',name:index===1?'BassRace':'SPL'}};
 const registrationClass={id:'rc'+index,classId:klass.id,class:klass,number:{number:spec.number}};
 const registration={id:'reg'+index,stageId:stage.id,stage,participant,participantId:participant.id,car,carId:car.id,status:'ACTIVE',participantNumber:spec.long?99:spec.number,classes:[registrationClass],numbers:spec.long?[{number:99},{number:101}]:[{number:spec.number}],stageInspection:{status:'PASSED'}};
 return {id:'result'+index,value:spec.value,place:spec.place,isHistorical:Boolean(spec.isHistorical),registrationClassId:registrationClass.id,registrationClass,registration,notes:'Проверочная запись без реальных данных'};
});
const report=[];let failure;
const browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch(getBrowserLaunchOptions());
try{
 for(const width of [320,390,402,1024,1440]){
  const context=await browser.newContext({viewport:{width,height:960},reducedMotion:'reduce',serviceWorkers:'block'});
  const writes=[],errors=[];let paging=false;
  const pagingEntries=Array.from({length:27},(_,index)=>{const source=entries[index%entries.length],id=String(index+1);const participant={...source.registration.participant,id:'paging-person-'+id,lastName:'Тестовый '+id};const car={...source.registration.car,id:'paging-car-'+id,participant,participantId:participant.id};const registrationClass={...source.registrationClass,id:'paging-class-'+id,number:{number:index+1}};const registration={...source.registration,id:'paging-reg-'+id,participant,participantId:participant.id,car,carId:car.id,participantNumber:index+1,classes:[registrationClass],numbers:[{number:index+1}]};return {...source,id:'paging-result-'+id,registrationClassId:registrationClass.id,registrationClass,registration}});
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin===base)return route.continue();
   if(url.origin!=='https://api.usd-russia.ru'){
    if(req.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><text y="50">USD</text></svg>'});
    return route.abort('blockedbyclient');
   }
   if(!['GET','HEAD','OPTIONS'].includes(req.method())&&url.pathname!=='/auth/refresh')writes.push({method:req.method(),path:url.pathname});
   const p=url.pathname;let data=[];
   if(p==='/auth/refresh')data={accessToken:'qa-only',user};
   else if(p==='/auth/me')data=user;
   else if(p==='/stages')data=[stage,completed];
   else if(p.startsWith('/results/admin/stage/'))data=(paging?pagingEntries:entries).map(row=>({...row,registration:{...row.registration,stageId:p.endsWith(completed.id)?completed.id:stage.id,stage:p.endsWith(completed.id)?completed:stage}}));
   else if(p==='/registrations')data=(paging?pagingEntries:entries).map((row,index)=>index===0&&paging?{...row.registration,classes:[...row.registration.classes,{id:'pending-class',class:{id:'pending-class',name:'Свободный класс',unit:'DB',direction:{id:'spl',name:'SPL'}}}]}:row.registration);
   else if(p.startsWith('/stages/')&&p.endsWith('/classes'))data=entries.map(row=>({classId:row.registrationClass.classId,class:row.registrationClass.class}));
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await page.clock.setFixedTime(new Date(stage.date));
  const record={engine,width,status:'passed'};
  try{
   await page.goto(base+'/admin/results?stageId='+stage.id,{waitUntil:'networkidle'});
   const rows=page.locator('.judging-results-table tbody tr.clickable-row');await rows.first().waitFor();assert.equal(await rows.count(),3);
   const cookie=page.getByRole('button',{name:'Только необходимые',exact:true});if(await cookie.isVisible())await cookie.click();
   await rows.first().scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(output,engine+'-'+width+'-cards.png'),fullPage:true});
   const layout=await rows.evaluateAll(elements=>elements.map(el=>{
    const box=el.getBoundingClientRect(),cell=label=>el.querySelector('td[data-label="'+label+'"]');
    const number=cell('Результат').querySelector('strong');
    return {height:box.height,width:box.width,right:box.right,display:getComputedStyle(el).display,
     scoreFont:parseFloat(getComputedStyle(number).fontSize),participant:cell('Участник').textContent,car:cell('Авто').textContent,score:cell('Результат').textContent,place:cell('Место').textContent,
     overflow:[...el.querySelectorAll('td')].filter(td=>td.scrollWidth>td.clientWidth+2).map(td=>td.dataset.label)};
   }));record.layout=layout;
   if(width>=1200){const table=await page.locator('.judging-results-table').evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));assert.ok(table.scroll<=table.client+2,'desktop table does not need sideways scrolling: '+JSON.stringify(table))}
   if(width<1200){
    for(const row of layout){assert.equal(row.display,'grid','tablet and phone use cards');assert.ok(row.height<=340,'result card stays compact: '+JSON.stringify(row));assert.ok(row.scoreFont>=24,'measured value is prominent');assert.ok(row.right<=width+1,'card stays inside screen');assert.deepEqual(row.overflow,[],'no clipped card fields')}
   }
   assert.ok(layout.find(row=>row.score.includes('139.90')).participant.includes('№101'),'BassRace displays its assigned class number');
   assert.ok(layout.every(row=>row.car.includes('А123АА123')),'plate identifies each car');
   assert.ok(layout.some(row=>row.score.includes('139.90')),'decimal value is preserved');
   const historic=rows.filter({hasText:'Исторический'});assert.equal(await historic.locator('td[data-label="Результат"] strong').innerText(),'0','zero is not hidden');
   assert.ok(layout.some(row=>row.place==='—'),'unknown place is not fabricated');
   assert.equal(await historic.getByRole('button',{name:'Исправить результат',exact:true}).count(),0,'historic result cannot be edited');
   await rows.first().getByRole('button',{name:'Удалить результат',exact:true}).click();
   const confirmation=rows.first().locator('.result-delete-confirm');await confirmation.getByRole('textbox',{name:'Причина удаления результата'}).waitFor();
   assert.equal(await confirmation.getByRole('button',{name:'Удалить',exact:true}).isDisabled(),true,'deletion still needs a reason');
   const overflow=await confirmation.evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.scrollWidth,client:el.clientWidth}));assert.ok(overflow.scroll<=overflow.client+2,'delete confirmation fits: '+JSON.stringify(overflow));
   await page.screenshot({path:path.join(output,engine+'-'+width+'-delete.png'),fullPage:true});
   await confirmation.getByRole('button',{name:'Отмена',exact:true}).click();
   await rows.first().focus();await page.keyboard.press('Enter');await page.getByRole('heading',{name:'Результат',exact:true}).waitFor();
   await page.goto(base+'/admin/results?stageId='+completed.id,{waitUntil:'networkidle'});await rows.first().waitFor();
   assert.equal(await rows.getByRole('button',{name:'Исправить результат',exact:true}).count(),0,'completed stage is read-only');
   assert.equal(await rows.getByRole('button',{name:'Удалить результат',exact:true}).count(),0,'completed results cannot be deleted');
   await rows.first().getByRole('button',{name:'Открыть',exact:true}).click();await page.getByRole('heading',{name:'Результат',exact:true}).waitFor();
   paging=true;record.worklists=[];
   for(const desk of ['registrations','inspections','results']){
    const url=base+'/admin/'+desk+'?stageId='+stage.id;
    await page.goto(url,{waitUntil:'networkidle'});
    const list=page.locator('table.data-table tbody tr.clickable-row');await list.first().waitFor();assert.equal(await list.count(),10,desk+' starts with 10 records');
    assert.equal(await page.locator('.usd-universal-pagination').count(),0,'no pagination panel');
    const primary=page.getByRole('group',{name:'Основные действия этапа'});await primary.waitFor();
    const bounds=await primary.locator('button').evaluateAll(els=>els.map(el=>({y:el.getBoundingClientRect().y,width:el.offsetWidth,height:el.offsetHeight})));
    assert.equal(bounds.length,2);assert.ok(Math.abs(bounds[0].y-bounds[1].y)<2,'primary actions share one line: '+JSON.stringify(bounds));assert.ok(bounds.every(box=>box.width>=44&&box.height>=44));
    assert.equal(await page.locator('.event-ops-actions-drawer .event-ops-primary-actions').count(),0,'primary actions are outside hidden tools');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'shared desk stays inside viewport');
    await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,engine+'-'+width+'-'+desk+'-header.png')});
    const first=await list.allTextContents(),more=page.getByRole('button',{name:/^Загрузить ещё:/});
    const position=await more.boundingBox(),last=await list.last().boundingBox();assert.ok(position.y>=last.y+last.height,'load more follows records');
    await more.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(output,engine+'-'+width+'-'+desk+'-more.png')});
    await more.click();await page.waitForFunction(()=>document.querySelectorAll('table.data-table tbody tr.clickable-row').length===20);
    const expanded=await list.allTextContents();assert.ok(first.every(text=>expanded.includes(text)),'load more retains previously visible rows');
    await list.nth(14).scrollIntoViewIfNeeded();await page.mouse.wheel(0,10);await list.nth(14).focus();await page.waitForTimeout(150);const before=await page.evaluate(()=>scrollY);
    await page.keyboard.press('Enter');await page.locator('.resource-editor-page').waitFor();
    await page.goto(url,{waitUntil:'networkidle'});await list.first().waitFor();assert.equal(await list.count(),20,'return restores expanded list');
    await page.waitForTimeout(150);const after=await page.evaluate(()=>scrollY);assert.ok(Math.abs(before-after)<5,'return restores row position: '+JSON.stringify({desk,before,after}));
    await more.click();await page.waitForFunction(()=>document.querySelectorAll('table.data-table tbody tr.clickable-row').length===27);assert.equal(await more.count(),0,'no load button after all records');
    const query=page.getByRole('searchbox',{name:desk==='results'?'Поиск результата':desk==='inspections'?'Поиск участников инспекции':'Поиск регистраций',exact:true});
    await query.fill('Никого-нет');await page.waitForFunction(()=>document.querySelectorAll('table.data-table tbody tr.clickable-row').length===0);await query.fill('');await list.first().waitFor();assert.equal(await list.count(),10,'new query resets expansion');
    const create=primary.getByRole('button',{name:desk==='results'?'Внести результат':'Регистрация на месте',exact:true});await create.click();
    await page.locator(desk==='results'?'.judging-entry-wizard':'.registration-profile-picker-heading').waitFor();
    await page.goto(url,{waitUntil:'networkidle'});await list.first().waitFor();
    await primary.getByRole('button',{name:'Сканировать QR',exact:true}).click();await page.locator('.qr-scanner-page').waitFor();
    if(desk==='results'){
     await page.getByRole('textbox',{name:'Или вставьте ссылку из QR-кода',exact:true}).fill(base+'/admin/inspections?stageId='+stage.id+'&registrationId=paging-reg-1');
     await page.getByRole('button',{name:'Открыть регистрацию',exact:true}).click();await page.locator('.judging-entry-wizard').waitFor();
    }else{
     await page.getByRole('button',{name:'К списку',exact:true}).click();await list.first().waitFor();assert.equal(new URL(page.url()).searchParams.has('scan'),false,'closing QR clears its one-shot URL intent');
    }
    record.worklists.push({desk,initial:10,expanded:20,total:27,scrollBefore:before,scrollAfter:after,primaryActions:'visible',status:'passed'});
   }
   assert.deepEqual(writes,[],'layout checks perform no result writes');assert.deepEqual(errors,[]);
  }catch(error){record.status='failed';record.error=error.message;failure??=error;await page.screenshot({path:path.join(output,engine+'-'+width+'-failure.png'),fullPage:true}).catch(()=>{})}
  report.push(record);await context.close();console.log(JSON.stringify(record));
 }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))}
if(failure)throw failure;
