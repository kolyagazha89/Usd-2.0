import {createRequire} from 'node:module';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';

const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const {transform}=createRequire(path.resolve('frontend/package.json'))('esbuild');
const output=path.resolve('safe-area-browser-qa');
await mkdir(output,{recursive:true});
const assets=await readdir('frontend/dist/assets');
const cssName=assets.find(name=>/^index-.*\.css$/.test(name));
assert.ok(cssName,'Build the candidate frontend before checking its complete stylesheet cascade');
const originalCss=await readFile('frontend/dist/assets/'+cssName,'utf8');
const observer=await transform(await readFile('frontend/src/navigation/header-size.ts','utf8'),{loader:'ts',format:'iife',globalName:'HeaderSize'});
const browser=await chromium.launch(getBrowserLaunchOptions());
const report={scope:'Built production stylesheet cascade with native CSS env values substituted; synthetic markup, no network access; not physical iOS acceptance',cases:[],failures:[]};
try{
 for(const [width,top,bottom] of [[390,47,34],[320,59,34],[740,0,21]]){
  for(const surface of ['public','member']){
   const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
   await context.route('**/*',route=>route.request().resourceType()==='stylesheet'?route.fulfill({contentType:'text/css',body:''}):route.abort());
   const page=await context.newPage();
   const member=surface==='member';
   const header=member?'.participant-portal-header':'.p-public-header';
   const shell=member?'.participant-portal.usd-member':'.usd-live';
   const css=originalCss.replace(/env\(safe-area-inset-top(?:\s*,[^)]*)?\)/g,top+'px')
    .replace(/env\(safe-area-inset-bottom(?:\s*,[^)]*)?\)/g,bottom+'px');
   const controls='<button class="secondary-button compact participant-refresh">Обновить</button><button class="secondary-button compact participant-site-return">На сайт</button><button class="secondary-button compact participant-logout">Выйти</button>';
   await page.setContent('<div class="'+(member?'participant-portal usd-member':'usd usd-live')+'">'+
    (member?'<header class="participant-portal-header usd-member-header"><button class="public-brand"><span class="participant-brand-logo">USD</span><span>Личный кабинет</span></button><div class="participant-header-actions">'+controls+'</div></header>':
     '<header class="u-header p-public-header"><div class="u-container u-header-inner"><button class="u-brand">USD</button><nav class="public-nav"><button class="public-nav-toggle">Меню</button></nav></div></header>')+
    '<main id="public-content" class="'+(member?'participant-portal-main':'u-container p-inner-page')+'" style="min-height:2400px"><h1>Проверка шапки</h1></main></div>'+
    '<nav class="'+(member?'participant-tabs participant-tabs-with-team':'u-mobile-dock')+'" aria-label="Навигация"><a href="#">Обзор</a><a href="#">Профиль</a><a href="#">Автомобили</a><a href="#">Регистрации</a><a href="#">Команда</a></nav><div class="usd-scroll-progress" style="transform:scaleX(1)"></div>');
   await page.addStyleTag({content:css});
   await page.addScriptTag({content:observer.code});
   await page.evaluate(({header,member})=>window.HeaderSize.observeHeaderSize(document.querySelector(header),member?'--usd-member-header-size':'--usd-public-header-size'),{header,member});
   const row={surface,width,top,bottom};
   try{
    for(const height of [568,844,960]){
     await page.setViewportSize({width,height});
     await page.evaluate(()=>scrollTo(0,0));
     await page.waitForFunction(({header,shell})=>Math.abs(parseFloat(getComputedStyle(document.querySelector(shell)).paddingTop)-document.querySelector(header).getBoundingClientRect().height)<=1,{header,shell});
     const geometry=await page.evaluate(({header,shell})=>{
      const h=document.querySelector(header),p=document.querySelector('.usd-scroll-progress'),dock=document.querySelector('body>nav');
      return {header:h.getBoundingClientRect().toJSON(),content:document.querySelector('main').getBoundingClientRect().toJSON(),
       controls:[...h.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().toJSON()),
       progress:p.getBoundingClientRect().toJSON(),progressLayer:Number(getComputedStyle(p).zIndex),headerLayer:Number(getComputedStyle(h).zIndex),
       dock:dock.getBoundingClientRect().toJSON(),dockItems:[...dock.querySelectorAll('a')].map(e=>e.getBoundingClientRect().toJSON())};
     },{header,shell});
     row.geometry=geometry;
     assert.ok(geometry.controls.every(box=>box.top>=top),'header controls must remain below the status bar: '+JSON.stringify(geometry.controls));
     assert.ok(geometry.content.top>=geometry.header.bottom-1,'page content must reserve the whole header');
     assert.equal(geometry.progress.top,top,'scroll progress belongs below the notch/status bar');
     assert.ok(geometry.progressLayer>geometry.headerLayer,'member header must not hide scroll progress');
     assert.ok(Math.abs(geometry.dock.bottom-height)<=1,'dock must remain at the viewport bottom');
     assert.ok(geometry.dockItems.every(box=>box.bottom<=height-bottom+1),'dock controls must remain above the home indicator');
     await page.evaluate(()=>scrollTo(0,400));
     assert.equal(await page.locator(header).evaluate(e=>e.getBoundingClientRect().top),0,'header stays fixed while scrolling');
     assert.equal(await page.locator('.usd-scroll-progress').evaluate(e=>e.getBoundingClientRect().top),top,'progress stays in its safe area while scrolling');
    }
    row.status='passed';
   }catch(error){row.status='failed';row.error=error.message;report.failures.push({surface,width,top,error:error.message})}
   await page.screenshot({path:path.join(output,surface+'-'+width+'-safe-'+top+'.png')});
   report.cases.push(row);
   await context.close();
  }
 }
}finally{
 await browser.close();
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
if(report.failures.length)process.exitCode=1;
