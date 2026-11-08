import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {getBrowserLaunchOptions} from './browser-qa-config.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const out=path.resolve(process.env.USD_VERIFICATION_QA_OUTPUT??'verification-resend-browser-qa');await mkdir(out,{recursive:true});
const dist=path.join(root,'frontend/dist'),mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'};
const server=createServer(async(req,res)=>{try{const p=new URL(req.url,'http://localhost').pathname,file=path.resolve(dist,'.'+p);if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return}let b,ext=path.extname(file);try{b=await readFile(file)}catch{b=await readFile(path.join(dist,'index.html'));ext='.html'}res.writeHead(200,{'Content-Type':mime[ext]??'application/octet-stream'}).end(b)}catch{res.writeHead(500).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch(getBrowserLaunchOptions()),report=[];
try{for(const width of [320,390,768,1440])for(const emailSent of [true,false]){
 const ctx=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'});let resendCalls=0,verifyCalls=0;const recipients=[],verifiedTokens=[],errors=[];
 try{
  await ctx.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin===base)return route.continue();
   if(u.pathname.startsWith('/media/public-file/'))return route.fulfill({contentType:'image/png',body:await readFile(path.join(root,'frontend/public/usd/usd-original.png'))});
   if(u.pathname==='/auth/refresh')return route.fulfill({status:401,json:{message:'Synthetic anonymous session'}});
   let data={};
   if(u.pathname==='/site-settings/public')data={settings:{legal:{legalApproved:true,ipName:'USD',privacyText:'policy',termsText:'terms',consentText:'consent'},branding:{}}};
   if(u.pathname==='/auth/register')data={success:true,emailSent,retryAfterSeconds:60,message:emailSent?'Аккаунт создан! Проверьте почту.':'Аккаунт создан, но письмо не отправилось.'};
   if(u.pathname==='/auth/resend-verification'){resendCalls++;recipients.push(req.postDataJSON().email);data={success:true,retryAfterSeconds:60,message:'Если аккаунт ожидает подтверждения, проверьте «Входящие» и «Спам».'}}
   if(u.pathname==='/auth/verify-email'){verifyCalls++;verifiedTokens.push(req.postDataJSON().token);data={success:true,message:'Email успешно подтверждён'}}
   return route.fulfill({json:data});
  });
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(base+'/login');
  const cookie=page.getByRole('button',{name:'Только необходимые',exact:true});if(await cookie.isVisible())await cookie.click();
  await page.getByRole('button',{name:'Нет аккаунта? Зарегистрироваться',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill('driver@example.com');
  await page.locator('input[autocomplete=new-password]').first().fill('Strong-password1');await page.getByLabel('Повторите пароль',{exact:true}).fill('Strong-password1');
  await page.locator('input[type=checkbox]').nth(0).check();await page.locator('input[type=checkbox]').nth(1).check();
  await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();
  const panel=page.locator('.verification-resend'),resend=panel.getByRole('button',{name:'Отправить письмо повторно',exact:true});await panel.waitFor();
  assert.equal(await resend.isDisabled(),true);assert.equal(await page.getByLabel('Пароль',{exact:true}).inputValue(),'');
  await page.screenshot({path:path.join(out,'signup-'+(emailSent?'sent':'failed')+'-'+width+'.png'),fullPage:true});
  await page.getByLabel('Email',{exact:true}).fill('different@example.com');await page.clock.fastForward(61_000);await resend.click();
  await panel.getByRole('status').waitFor();assert.equal(resendCalls,1);assert.deepEqual(recipients,['driver@example.com']);assert.equal(await resend.isDisabled(),true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'auth page overflow at'+width);
  await resend.scrollIntoViewIfNeeded();assert.ok(await resend.evaluate(el=>{const r=el.getBoundingClientRect();return r.width>=44&&r.height>=44}),'touch target');
  await page.screenshot({path:path.join(out,'resend-'+(emailSent?'sent':'failed')+'-'+width+'.png'),fullPage:true});assert.deepEqual(errors,[]);
  // Mail security scanners may visit verification links via GET. Nothing is
  // confirmed until the human explicitly presses the button.
  await page.goto(base+'/verify-email#token='+('a'.repeat(64)));
  const confirm=page.getByRole('button',{name:'Подтвердить email',exact:true});
  await confirm.waitFor();
  assert.equal(verifyCalls,0,'opening a verification link must not consume its token');
  await page.clock.fastForward(2000);
  assert.equal(verifyCalls,0,'page load, timers and prefetch must not consume the token');
  await confirm.click();
  await page.getByRole('heading',{name:'Почта успешно подтверждена'}).waitFor();
  assert.deepEqual(verifiedTokens,['a'.repeat(64)],'explicit POST uses exact fragment token');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'verification page overflow at '+width);
  assert.deepEqual(errors,[],'verification page has no console exceptions');
  report.push({width,initialMail:emailSent?'sent':'failed',resendCalls,recipientPreserved:true,noOverflow:true,noPageErrors:true,explicitVerification:true});
 }finally{await ctx.close()}
}}finally{await browser.close();await new Promise(r=>server.close(r))}
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
