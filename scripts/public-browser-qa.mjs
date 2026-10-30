import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {getLiveQaConfig} from './public-browser-qa-config.mjs';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
import {handleLiveQaRoute} from './public-browser-qa-routing.mjs';

const tooling=process.env.USD_BROWSER_TOOLING;
if(!tooling)throw new Error('Set USD_BROWSER_TOOLING to the temporary Playwright installation');
const {chromium}=createRequire(path.join(tooling,'package.json'))('playwright');
const {base,injectCandidateCss,visualSource}=getLiveQaConfig();
const output=path.resolve('public-browser-qa');
await mkdir(output,{recursive:true});
const report={base,visualSource,injectCandidateCss,startedAt:new Date().toISOString(),scope:'anonymous live public site; every non-read request is blocked',pages:[],failures:[],blockedRequests:[]};
let candidateCss='';
if(injectCandidateCss){
const candidateResultCss=await readFile('frontend/src/participant-ui-polish.css','utf8');
const candidatePremiumCss=await readFile('frontend/src/premium-ui.css','utf8');
const candidatePublicCss=await readFile('frontend/src/public/premium-public.css','utf8');
const candidateBaseCss=await readFile('frontend/src/public/premium-base.css','utf8');
const candidateMemberCss=await readFile('frontend/src/public/premium-member.css','utf8');
const candidateVelocityCss=await readFile('frontend/src/dark-velocity-sitewide.css','utf8');
candidateCss=[candidateResultCss,candidatePremiumCss,candidateBaseCss,candidatePublicCss,candidateMemberCss,candidateVelocityCss].join('\n');
}
async function navigatePublic(page,label){
 const toggle=page.locator('.public-nav-toggle');
 if(await toggle.isVisible()&&await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
 const link=page.getByRole('navigation',{name:'Основная навигация'}).getByRole('link',{name:label,exact:true});
 if(await link.count())await link.click();else await page.getByRole('button',{name:label,exact:true}).click();
}
async function inspectResultText(page){
  return page.locator('.public-result-card').evaluateAll(cards=>cards.flatMap((card,index)=>
    [...card.querySelectorAll('.public-result-card-top,.public-result-card-bottom,.public-result-place,.public-result-place small,.public-result-class,.public-result-measure,.public-result-measure strong,.public-result-measure span,.public-result-person,.public-result-person strong,.public-result-person span,.public-result-arrow')].map(element=>{
      const style=getComputedStyle(element);
      return {card:index,element:element.className||element.tagName,textLength:(element.textContent??'').trim().length,background:style.backgroundColor,backgroundImage:style.backgroundImage,shadow:style.boxShadow,borderWidth:style.borderWidth};
    })
  ));
}
const hasSurface=element=>!['transparent','rgba(0, 0, 0, 0)'].includes(element.background)||element.backgroundImage!=='none'||element.shadow!=='none';
const browser=await chromium.launch(getBrowserLaunchOptions());
const routes=['/','/stages?season=ALL','/stages?season=2025','/results','/records','/rules','/privacy','/terms','/consent','/login','/reset-password','/confirm-email-change'];
try{
  for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1,serviceWorkers:'block'});
    await context.route('**/*',route=>handleLiveQaRoute(route,report.blockedRequests));
    const page=await context.newPage();
    for(const route of routes){
      const errors=[];
      const onError=error=>errors.push(error.message);
      page.on('pageerror',onError);
      const row={width,route};
      const startedAt=Date.now();
      console.log('PUBLIC_QA_START '+JSON.stringify(row));
      try{
        await page.goto(base+route,{waitUntil:'domcontentloaded',timeout:60000});
        await page.locator('.usd-live,.public-site,.login-page').first().waitFor({state:'visible',timeout:40000});
        await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
        await page.waitForTimeout(1000);
        const originalResultText=await inspectResultText(page);
        if(injectCandidateCss)await page.addStyleTag({content:candidateCss});
        row.visualSource=visualSource;
        Object.assign(row,await page.evaluate(()=>{
          const width=innerWidth;
          const textControls=[...document.querySelectorAll('input,select,textarea')].filter(element=>!['hidden','checkbox','radio','file','submit','button'].includes(element.type)&&element.getBoundingClientRect().width>0);
          return {
            title:document.title,heading:document.querySelector('h1')?.textContent??'',
            documentWidth:document.documentElement.scrollWidth,viewportWidth:width,
            overflowingElements:[...document.body.querySelectorAll('*')].map(element=>({element,rect:element.getBoundingClientRect()})).filter(({element,rect})=>rect.width>0&&(rect.right>width+1||rect.left< -1)&&getComputedStyle(element).position!=='fixed').slice(0,12).map(({element,rect})=>({tag:element.tagName,className:element.className,left:Math.round(rect.left),right:Math.round(rect.right)})),
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
          await page.locator('.usd-live,.public-site').waitFor();
        }
        if(route==='/'||route==='/results'){
          const before=originalResultText;
          row.resultTextSurfaceBefore=before.filter(hasSurface);
          if(route==='/results'&&!before.length)throw new Error('No public result cards available for text-style validation');
          if(before.length){
            await page.screenshot({path:path.join(output,width+'-'+(route==='/'?'home':'results')+'-live-before.png'),fullPage:false});
            const after=await inspectResultText(page);
            row.resultTextStyleSource=visualSource;
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
      row.durationMs=Date.now()-startedAt;
      report.pages.push(row);
      console.log(JSON.stringify(row));
      await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
    }
    await context.close();
  }
}finally{
  await browser.close();
  for(const request of report.blockedRequests.filter(request=>['redirect','read failed'].includes(request.reason)))report.failures.push({route:request.url,error:request.reason==='redirect'?'Live QA blocked an HTTP redirect before following it':'Live QA read failed before a response was available'});
  report.finishedAt=new Date().toISOString();
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
}
console.log('PUBLIC_QA_SUMMARY '+JSON.stringify({pages:report.pages.length,passed:report.pages.filter(page=>page.status==='passed').length,failures:report.failures}));
if(report.failures.length)process.exitCode=1;
