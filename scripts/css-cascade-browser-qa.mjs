import {createRequire} from 'node:module';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';

const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const output=path.resolve('css-cascade-browser-qa');
await mkdir(output,{recursive:true});
const assets=await readdir('frontend/dist/assets');
const cssName=assets.find(name=>/^index-.*\.css$/.test(name));
assert.ok(cssName,'Build the production frontend before checking its CSS cascade');
const css=await readFile(path.join('frontend/dist/assets',cssName),'utf8');
const browser=await chromium.launch(getBrowserLaunchOptions());
const report={scope:'Built CSS, synthetic markup, no external requests; not physical iOS acceptance',cases:[],failures:[]};
try{
 for(const width of [320,390,740,1024,1440]){
  for(const surface of ['public','member','admin']){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
   await context.route('**/*',route=>route.request().resourceType()==='stylesheet'?route.fulfill({contentType:'text/css',body:''}):route.abort());
   const page=await context.newPage();
   const fixture='<div class="vehicle-catalog-field"><label for="make">Марка</label><input id="make" value="Lada"><ul class="vehicle-catalog-suggestions"><li><button>Vesta</button></li><li><button>Granta</button></li></ul></div>';
   const shell=surface==='admin'?'<div class="app-shell"><aside class="sidebar"></aside><main class="main"><div class="content">'+fixture+'</div></main></div>':
    '<main class="'+(surface==='member'?'participant-portal usd-member':'usd usd-live')+'">'+fixture+'</main>';
   await page.setContent(shell);
   await page.addStyleTag({content:css});
   const row={surface,width};
   try{
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    row.styles=await page.locator('.vehicle-catalog-suggestions button').first().evaluate(button=>{
     const style=getComputedStyle(button),list=getComputedStyle(button.closest('ul'));
     return {focused:button.matches(':focus-visible'),color:style.color,background:style.backgroundColor,list:list.backgroundColor};
    });
    assert.ok(row.styles.focused,'suggestion must be reachable with native Tab navigation');
    if(surface==='admin'){
     assert.equal(row.styles.list,'rgb(255, 255, 255)','staff popup must stay light');
     assert.equal(row.styles.color,'rgb(144, 21, 43)','staff keyboard focus must not inherit white public text');
     assert.equal(row.styles.background,'rgb(255, 240, 242)');
    }else{
     assert.equal(row.styles.list,'rgb(21, 30, 41)','public/member popup must stay dark');
     assert.equal(row.styles.color,'rgb(255, 255, 255)','public/member keyboard focus remains white over selected state');
     assert.equal(row.styles.background,'rgba(228, 47, 70, 0.18)','public/member selected item must use the shared burgundy emphasis');
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'popup must fit the viewport');
    row.status='passed';
   }catch(error){row.status='failed';row.error=error.message;report.failures.push({surface,width,error:error.message})}
   await page.screenshot({path:path.join(output,surface+'-'+width+'.png')});
   report.cases.push(row);
   await context.close();
  }
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  await context.route('**/*',route=>route.request().resourceType()==='stylesheet'?route.fulfill({contentType:'text/css',body:''}):route.abort());
  const page=await context.newPage();
  const cards=Array.from({length:6},(_,i)=>'<article class="usd-partner-card">Партнёр '+i+'</article>').join('');
  await page.setContent('<div class="usd usd-live"><div class="usd-partner-showcase--home"><section class="usd-partner-tier--regular"><div class="usd-partner-carousel" tabindex="0">'+cards+'</div></section></div><div class="usd-partner-showcase--full"><section class="usd-partner-tier--regular"><div class="usd-partner-grid">'+cards+'</div></section></div></div>');
  await page.addStyleTag({content:css});
  const row={surface:'partners',width};
  try{
   row.geometry=await page.evaluate(()=>{
    const rail=document.querySelector('.usd-partner-carousel'),directory=document.querySelector('.usd-partner-grid');
    return {display:getComputedStyle(rail).display,scrollWidth:rail.scrollWidth,clientWidth:rail.clientWidth,
     directoryColumns:getComputedStyle(directory).gridTemplateColumns.split(' ').length,scroll:document.documentElement.scrollWidth};
   });
   assert.equal(row.geometry.display,'flex');
   assert.ok(row.geometry.scrollWidth>row.geometry.clientWidth+1,'home partners must form a swipeable rail');
   assert.equal(row.geometry.directoryColumns,1,'partner directory must stay in one column');
   assert.ok(row.geometry.scroll<=width+1,'rail must not expand the page');
   row.status='passed';
  }catch(error){row.status='failed';row.error=error.message;report.failures.push({surface:row.surface,width,error:error.message})}
  await page.screenshot({path:path.join(output,'partners-'+width+'.png')});
  report.cases.push(row);
  await context.close();
 }
}finally{
 await browser.close();
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report,null,2));
if(report.failures.length)process.exitCode=1;
