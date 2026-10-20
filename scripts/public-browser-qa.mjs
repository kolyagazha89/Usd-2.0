import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';

const tooling=process.env.USD_BROWSER_TOOLING;
if(!tooling)throw new Error('Set USD_BROWSER_TOOLING to the temporary Playwright installation');
const {chromium}=createRequire(path.join(tooling,'package.json'))('playwright');
const base='https://usd-2-0.ultimatesounddestruction.workers.dev';
const output=path.resolve('public-browser-qa');
await mkdir(output,{recursive:true});
const report={base,startedAt:new Date().toISOString(),scope:'anonymous live public site; every non-read request is blocked',pages:[],failures:[],blockedRequests:[]};
const candidateResultCss=await readFile('frontend/src/participant-ui-polish.css','utf8');
const candidatePremiumCss=await readFile('frontend/src/premium-ui.css','utf8');
async function navigatePublic(page,label){
 const toggle=page.locator('.public-nav-toggle');
 if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
 const link=page.getByRole('link',{name:label,exact:true});
 if(await link.count())await link.click();else await page.getByRole('button',{name:label,exact:true}).click();
}
async function inspectResultText(page){
  return page.locator('.public-result-card').evaluateAll(cards=>cards.flatMap((card,index)=>
    [...card.querySelectorAll('.public-result-card-top,.public-result-card-bottom,.public-result-place,.public-result-place small,.public-result-class,.public-result-measure,.public-result-measure strong,.public-result-measure span,.public-result-person,.public-result-person strong,.public-result-person span,.public-result-arrow')].map(element=>{
      const style=getComputedStyle(element);
      return {card:index,element:element.className||element.tagName,text:(element.textContent??'').trim().slice(0,80),background:style.backgroundColor,backgroundImage:style.backgroundImage,shadow:style.boxShadow,borderWidth:style.borderWidth};
    })
  ));
}
const hasSurface=element=>!['transparent','rgba(0, 0, 0, 0)'].includes(element.background)||element.backgroundImage!=='none'||element.shadow!=='none';
const browser=await chromium.launch({headless:true});
const routes=['/','/stages?season=ALL','/stages?season=2025','/results','/records','/rules','/privacy','/terms','/consent','/login','/reset-password','/confirm-email-change'];
try{
  for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
    await context.route('**/*',async route=>{
      const request=route.request();
      if(['GET','HEAD','OPTIONS'].includes(request.method()))return route.continue();
      report.blockedRequests.push({method:request.method(),url:request.url().split('?')[0]});
      // Anonymous session bootstrap needs a deterministic response, with no live POST.
      if(new URL(request.url()).pathname==='/auth/refresh')return route.fulfill({status:401,contentType:'application/json',body:'{"message":"Anonymous QA session"}'});
      return route.abort('blockedbyclient');
    });
    const page=await context.newPage();
    for(const route of routes){
      const errors=[];
      const onError=error=>errors.push(error.message);
      page.on('pageerror',onError);
      const row={width,route};
      try{
        await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:60000});
        await page.locator('.public-site,.login-page').first().waitFor({state:'visible',timeout:40000});
        await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
        await page.waitForTimeout(1000);
        const originalResultText=await inspectResultText(page);
        await page.addStyleTag({content:candidateResultCss+'\n'+candidatePremiumCss});
        row.visualSource='live DOM with candidate branch CSS; candidate JavaScript is tested separately';
        Object.assign(row,await page.evaluate(()=>{
          const width=innerWidth;
          const textControls=[...document.querySelectorAll('input,select,textarea')].filter(element=>!['hidden','checkbox','radio','file','submit','button'].includes(element.type)&&element.getBoundingClientRect().width>0);
          return {
            title:document.title,heading:document.querySelector('h1')?.textContent??'',
            documentWidth:document.documentElement.scrollWidth,viewportWidth:width,
            overflowingElements:[...document.body.querySelectorAll('*')].map(element=>({element,rect:element.getBoundingClientRect()})).filter(({element,rect})=>rect.width>0&&(rect.right>width+1||rect.left< -1)&&getComputedStyle(element).position!=='fixed').slice(0,12).map(({element,rect})=>({tag:element.tagName,className:element.className,text:(element.textContent??'').trim().slice(0,90),left:Math.round(rect.left),right:Math.round(rect.right)})),
            smallEditableControls:textControls.filter(element=>parseFloat(getComputedStyle(element).fontSize)<16).map(element=>({tag:element.tagName,type:element.type,font:getComputedStyle(element).fontSize})),
            assets:[...document.scripts].map(script=>script.src).filter(Boolean),
          };
        }));
        if(row.documentWidth>row.viewportWidth+1)throw new Error('Horizontal document overflow: '+JSON.stringify(row));
        if(width===390&&row.smallEditableControls.length)throw new Error('Editable controls below 16px: '+JSON.stringify(row.smallEditableControls));
        if(errors.length)throw new Error('Browser runtime errors: '+errors.join('; '));
        if(route==='/stages?season=ALL'){
          const cards=await page.locator('.public-stage-grid .public-stage-card').allTextContents();
          row.stageCards=cards.map(card=>card.replace(/\s+/g,' ').trim());
          if(cards.length<2||new Set(cards).size!==cards.length)throw new Error('Stage cards missing or repeated: '+JSON.stringify(cards));
        }
        if(route==='/reset-password'||route==='/confirm-email-change'){
          if(!await page.getByRole('alert').filter({hasText:'Ссылка недействительна'}).count())throw new Error('Missing invalid-link page');
        }
        if(route==='/privacy'){
          await navigatePublic(page,'Главная');
          await page.waitForURL(base+'/');
          await page.goto(base+'/privacy',{waitUntil:'domcontentloaded'});
          await navigatePublic(page,'Этапы');
          await page.waitForURL(/\/stages(?:\?|$)/);
          row.privacyNavigation='Home and Stages clicks passed';
          await page.goto(base+'/privacy',{waitUntil:'domcontentloaded'});
          await page.locator('.public-site').waitFor();
        }
        if(route==='/'||route==='/results'){
          const before=originalResultText;
          row.resultTextSurfaceBefore=before.filter(hasSurface);
          if(route==='/results'&&!before.length)throw new Error('No public result cards available for text-style validation');
          if(before.length){
            await page.screenshot({path:path.join(output,width+'-'+(route==='/'?'home':'results')+'-live-before.png'),fullPage:false});
            // Preview this branch's CSS over the live public DOM. No site or data is changed.
            await page.addStyleTag({content:candidateResultCss});
            const after=await inspectResultText(page);
            row.resultTextStyleSource='candidate participant-ui-polish.css and premium-ui.css injected only in this QA browser';
            row.resultTextElementsChecked=after.length;
            row.resultTextSurfaceAfter=after.filter(hasSurface);
            row.resultClassBordersAfter=after.filter(element=>element.element==='public-result-class'&&element.borderWidth!=='0px');
            if(row.resultTextSurfaceAfter.length||row.resultClassBordersAfter.length)throw new Error('Result text must be unboxed: '+JSON.stringify({surfaces:row.resultTextSurfaceAfter,borders:row.resultClassBordersAfter}));
          }
        }
        row.status='passed';
      }catch(error){
        row.status='failed';row.error=error.message;
        report.failures.push({width,route,error:error.message});
      }
      const filename=width+'-'+route.replace(/[^a-zA-Z0-9]/g,'_')+'.png';
      await page.screenshot({path:path.join(output,filename),fullPage:false}).catch(error=>{row.screenshotError=error.message});
      page.off('pageerror',onError);
      report.pages.push(row);
      console.log(JSON.stringify(row));
    }
    await context.close();
  }
}finally{
  await browser.close();
  report.finishedAt=new Date().toISOString();
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log('PUBLIC_QA_SUMMARY '+JSON.stringify({pages:report.pages.length,passed:report.pages.filter(page=>page.status==='passed').length,failures:report.failures}));
if(report.failures.length)process.exitCode=1;
