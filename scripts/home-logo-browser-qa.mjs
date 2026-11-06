import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
const root=process.cwd(),output=path.resolve('home-logo-browser-qa');await mkdir(output,{recursive:true});
const bundle=await mkdtemp(path.join(output,'fixture-'));
const {build}=createRequire(path.join(root,'frontend/package.json'))('esbuild');
await build({entryPoints:{fixture:path.join(root,'frontend/test/fixtures/logo-arrival.tsx')},bundle:true,splitting:true,format:'esm',outdir:bundle,logLevel:'silent'});
const html='<!doctype html><html lang="ru"><head><link rel="stylesheet" href="/fixture.css"></head><body style="background:#0b0e13"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>';
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname;if(p==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}const file=p==='/usd/usd-original.png'?path.join(root,'frontend/public/usd/usd-original.png'):path.resolve(bundle,'.'+p);if(p!=='/usd/usd-original.png'&&!file.startsWith(bundle+path.sep)){res.writeHead(403).end();return}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/javascript');res.end(await readFile(file))}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const browser=await chromium.launch(getBrowserLaunchOptions());const report={cases:[]};let activePage,activeCase;const runtimeErrors=[];
try{
 for(const width of [390,1440])for(const reducedMotion of ['no-preference','reduce']){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion});const page=await context.newPage();activePage=page;activeCase={width,reducedMotion};page.on('pageerror',e=>runtimeErrors.push(e.message));await page.clock.install();await page.goto(base);await page.locator('.u-logo-showcase').waitFor({state:'attached'});await page.clock.runFor(2500);
  assert.equal(await page.locator('.u-logo-showcase.is-arriving').count(),0,'hidden home must not consume the intro');
  await page.getByRole('button',{name:'Reveal home',exact:true}).click();
  if(reducedMotion==='no-preference'){
   await page.locator('.u-logo-showcase.is-arriving').waitFor({state:'attached',timeout:45000});
   await page.screenshot({path:path.join(output,width+'-visible-intro.png')});
   await page.clock.runFor(1900);assert.equal(await page.locator('.u-logo-showcase.is-arriving').count(),0,'intro is finite');
   await page.reload();await page.locator('.u-logo-showcase').waitFor({state:'attached'});await page.clock.runFor(2500);await page.getByRole('button',{name:'Reveal home',exact:true}).click();await page.locator('.u-logo-showcase.is-arriving').waitFor({state:'attached',timeout:45000});
  }else{await page.clock.runFor(100);assert.equal(await page.locator('.u-logo-showcase.is-arriving').count(),0,'reduced motion stays static')}
  report.cases.push({width,reducedMotion,motion:await page.locator('.u-logo-showcase').getAttribute('data-motion'),status:'passed'});await context.close();
 }
}catch(error){report.failure={...activeCase,error:error.message,runtimeErrors,motion:await activePage?.locator('.u-logo-showcase').getAttribute('data-motion').catch(()=>null),classes:await activePage?.locator('.u-logo-showcase').getAttribute('class').catch(()=>null)};await activePage?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2))}
console.log(JSON.stringify(report));
