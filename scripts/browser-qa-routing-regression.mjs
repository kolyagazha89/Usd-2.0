import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
import {handleLiveQaRoute} from './public-browser-qa-routing.mjs';

const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
let deniedHits=0;
const denied=createServer((_req,res)=>{deniedHits++;res.end('must never be contacted')});
await new Promise(resolve=>denied.listen(0,'127.0.0.1',resolve));
const source=createServer((req,res)=>{
 if(req.url==='/disconnect')return req.socket.destroy();
 if(req.url==='/redirect')return res.writeHead(302,{location:'http://127.0.0.1:'+denied.address().port+'/denied'}).end();
 if(req.url==='/primary-redirect')return res.writeHead(302,{location:'https://usd-russia.ru/'}).end();
 res.writeHead(200,{'Content-Type':'text/html'}).end('<h1>Local routing fixture</h1>');
});
await new Promise(resolve=>source.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch(getBrowserLaunchOptions());
const blocked=[],fetched=[];
try{
 // Even a regressed handler cannot send Chromium to the literal primary-site
 // redirect below. APIRequestContext fetches still reach the loopback fixture.
 const context=await browser.newContext({serviceWorkers:'block',offline:true});
 await context.route('**/*',route=>{
  // The browser sees the real allowlist host, but every approved read goes
  // only to a loopback fixture. This test performs no remote network access.
  const localRoute={
   request:()=>route.request(),abort:reason=>route.abort(reason),fulfill:options=>route.fulfill(options),
   fetch:options=>{
    const requestUrl=new URL(route.request().url());
    fetched.push(requestUrl.origin+requestUrl.pathname);
    return route.fetch({...options,url:'http://127.0.0.1:'+source.address().port+requestUrl.pathname});
   },
  };
  return handleLiveQaRoute(localRoute,blocked);
 });
 const page=await context.newPage();
 await page.goto('https://app.usd-russia.ru/ok');
 assert.equal(await page.locator('h1').innerText(),'Local routing fixture','approved read is fulfilled');
 for(const route of ['/redirect','/primary-redirect']){
  const redirectedPage=await context.newPage();
  await assert.rejects(redirectedPage.goto('https://app.usd-russia.ru'+route),/ERR_(?:BLOCKED_BY_CLIENT|FAILED)/);
  await redirectedPage.close();
 }
 assert.equal(deniedHits,0,'redirect destinations are never contacted');
 assert.equal(fetched.some(url=>!url.startsWith('https://app.usd-russia.ru/')),false,'only approved reads reach the network adapter');
 assert.equal(blocked.filter(request=>request.reason==='redirect').length,2,'both redirects fail closed');
 const disconnectedPage=await context.newPage();
 await assert.rejects(disconnectedPage.goto('https://app.usd-russia.ru/disconnect'),/ERR_FAILED/);
 await disconnectedPage.close();
 assert.equal(blocked.filter(request=>request.reason==='read failed').length,1,'network failure is reported and explicitly aborted');
 const before=fetched.length;
 const refresh=await page.evaluate(async()=>{const response=await fetch('https://api.usd-russia.ru/auth/refresh',{method:'POST'});return response.status});
 assert.equal(refresh,401,'anonymous bootstrap is synthetic');
 await page.evaluate(()=>fetch('https://api.usd-russia.ru/registrations',{method:'POST'}).catch(()=>null));
 assert.equal(fetched.length,before,'mutations never reach the network adapter');
 await assert.rejects(page.goto('https://usd-russia.ru/'),/ERR_(?:BLOCKED_BY_CLIENT|FAILED)/);
 assert.equal(fetched.length,before,'the primary domain is blocked before network access');
 console.log('BROWSER_ROUTING_REGRESSION passed: approved reads, redirect isolation, synthetic bootstrap, blocked mutations and primary domain');
 await context.close();
}finally{
 await browser.close();
 await Promise.all([new Promise(resolve=>source.close(resolve)),new Promise(resolve=>denied.close(resolve))]);
}
