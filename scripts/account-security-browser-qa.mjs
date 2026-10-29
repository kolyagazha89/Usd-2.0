import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isCandidateApiRequest} from './candidate-browser-qa-config.mjs';

assert.ok(process.env.USD_BROWSER_TOOLING,'Set USD_BROWSER_TOOLING to a directory containing Playwright.');
const {chromium}=createRequire(path.join(process.env.USD_BROWSER_TOOLING,'package.json'))('playwright');
const output=path.resolve(process.env.USD_ACCOUNT_QA_OUTPUT||'/tmp/usd-account-browser-qa');
await mkdir(output,{recursive:true});
const dist=path.resolve('frontend/dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(dist,'.'+pathname);
    if(!file.startsWith(dist+path.sep)&&file!==dist){res.writeHead(403).end();return}
    let body,ext=path.extname(file);
    try{body=await readFile(file)}catch{body=await readFile(path.join(dist,'index.html'));ext='.html'}
    res.writeHead(200,{'Content-Type':types[ext]??'application/octet-stream'}).end(body);
  }catch{res.writeHead(500).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const participant={id:'fixture-participant',firstName:'Тест',lastName:'Участник',phone:'+79000000000',isPublic:true};
const sessionFixtures=[{id:'session/one',familyId:'family-one',userAgent:'Chrome on Android · Synthetic device with a deliberately long label to verify wrapping on narrow screens',ipAddress:'192.0.2.1',createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-29T10:00:00Z',expiresAt:'2026-11-01T10:00:00Z'},
  {id:'session-two',familyId:'family-two',userAgent:null,ipAddress:null,createdAt:'2026-10-02T10:00:00Z',updatedAt:'2026-10-28T10:00:00Z',expiresAt:'2026-11-02T10:00:00Z'}];
const report={scope:'Local built frontend, every remote request intercepted, synthetic API and credentials only; no live acceptance.',pages:[],actions:[],blocked:[],failures:[]};
const browser=await chromium.launch({headless:true,...(process.env.USD_BROWSER_EXECUTABLE?{executablePath:process.env.USD_BROWSER_EXECUTABLE}:{})});

async function scenario(width,kind,linked=true){
  const user={id:'fixture-user',email:'fixture@example.test',role:kind==='ADMIN'?'ADMIN':'PARTICIPANT',participantId:linked?participant.id:null,
    ...(kind==='JUDGE'?{customRoleId:'judge',customRole:{id:'judge',key:'judge',name:'Судья',permissions:{results:['view']}}}:{})};
  const context=await browser.newContext({viewport:{width,height:1000}});
  const state={sessions:structuredClone(sessionFixtures),calls:[],listError:false,emailError:false,passwordError:false};
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===base)return route.continue();
    if(isCandidateApiRequest(url)){
      const method=request.method(),p=url.pathname;
      const body=request.postDataJSON();
      state.calls.push({path:p,method,body});
      let data={},status=200;
      if(p==='/auth/refresh')data={accessToken:'synthetic-access',refreshToken:'synthetic-refresh',user};
      else if(p==='/auth/sessions'&&method==='GET'){
        if(state.listError){status=503;data={message:'Список временно недоступен'}}else data=state.sessions;
      }else if(p==='/auth/sessions'&&method==='DELETE'){state.sessions=[];data={success:true,revoked:2}}
      else if(p.startsWith('/auth/sessions/')&&method==='DELETE'){state.sessions=state.sessions.filter(session=>session.id!==decodeURIComponent(p.slice('/auth/sessions/'.length)));data={success:true}}
      else if(p==='/auth/request-email-change'&&method==='POST'){
        if(state.emailError){status=409;data={message:'Этот email уже используется'}}else data={success:true};
      }else if(p==='/auth/change-password'&&method==='POST'){
        if(state.passwordError){status=401;data={message:'Неверный текущий пароль'}}else data={success:true};
      }else if(p==='/auth/logout'&&method==='POST')data={success:true};
      else if(method!=='GET'){report.blocked.push({method,path:p});return route.abort('blockedbyclient')}
      else if(p==='/participants/me')data={participant};
      else if(p==='/site-settings/public')data={settings:{branding:{siteName:'USD'},homepage:{blocks:[]},catalogs:{},legal:{}}};
      else if(['/participants/me/cars','/registrations/me','/stages/public','/participants/teams'].includes(p))data=[];
      else if(p==='/auth/legal-consent')data={legalReady:false};
      return route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    }
    if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
    if(request.resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80"><text x="5" y="60" fill="white" font-size="55">USD</text></svg>'});
    report.blocked.push({method:request.method(),host:url.hostname,path:url.pathname});
    return route.abort('blockedbyclient');
  });
  const page=await context.newPage();
  page.on('pageerror',error=>report.failures.push(error.message));
  await page.goto(base+'/participant?tab=profile');
  const cookieNotice=page.getByRole('button',{name:'Понятно',exact:true});
  if(await cookieNotice.isVisible())await cookieNotice.click();
  const security=page.locator('.participant-account-security');
  await security.getByRole('heading',{name:'Безопасность аккаунта'}).waitFor();
  await security.getByText('Неизвестное устройство',{exact:true}).waitFor();
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,inputSizes:[...document.querySelectorAll('.participant-account-security input')].map(input=>parseFloat(getComputedStyle(input).fontSize)),dark:getComputedStyle(document.querySelector('.account-security-card')).backgroundImage}));
  assert.equal(layout.overflow,false,`${kind} ${width}: horizontal overflow`);
  assert.ok(layout.inputSizes.every(size=>size>=16),'iOS inputs must be at least 16px');
  assert.ok(layout.dark.includes('linear-gradient'),'security cards must retain their dark skin for staff');
  await security.screenshot({path:path.join(output,`${kind.toLowerCase()}-${linked?'linked':'unlinked'}-${width}.png`)});
  report.pages.push({width,role:kind,linked,...layout});
  return {context,page,security,state};
}

try{
  for(const width of [1440,390,320]){
    for(const [role,linked]of [['PARTICIPANT',true],['ADMIN',true],['JUDGE',true],['ADMIN',false],['JUDGE',false]]){
      const candidate=await scenario(width,role,linked);
      await candidate.context.close();
    }
  }
  for(const width of [1440,390,320]){
    const {context,page,security,state}=await scenario(width,'PARTICIPANT');
    const writes=()=>state.calls.filter(call=>call.method!=='GET'&&call.path!=='/auth/refresh');
    await security.getByLabel('Новый email',{exact:true}).fill('new.address@example.test');
    await page.locator('#account-email-password').fill('Synthetic-current-password');
    state.emailError=true;
    await security.getByRole('button',{name:'Запросить смену email',exact:true}).click();
    await security.getByRole('alert').filter({hasText:'Этот email уже используется'}).waitFor();
    state.emailError=false;
    await security.getByRole('button',{name:'Запросить смену email',exact:true}).click();
    await security.getByRole('status').filter({hasText:'new.address@example.test'}).waitFor();
    assert.deepEqual(writes().at(-1).body,{email:'new.address@example.test',currentPassword:'Synthetic-current-password'});
    assert.equal(await page.locator('#account-email-password').inputValue(),'');
    state.listError=true;
    await security.getByRole('button',{name:'Обновить сеансы'}).click();
    await security.getByRole('alert').filter({hasText:'Список временно недоступен'}).waitFor();
    state.listError=false;
    await security.getByRole('button',{name:'Обновить сеансы'}).click();
    const revoke=security.getByRole('button',{name:'Завершить сеанс: '+sessionFixtures[0].userAgent,exact:true});
    await revoke.click();
    assert.equal(writes().filter(call=>call.method==='DELETE').length,0);
    await security.getByRole('button',{name:'Отмена',exact:true}).click();
    await revoke.click();
    await security.getByRole('button',{name:'Да, завершить сеанс',exact:true}).click();
    await revoke.waitFor({state:'detached'});
    assert.equal(writes().at(-1).path,'/auth/sessions/session%2Fone');
    await security.getByRole('button',{name:'Завершить все сеансы',exact:true}).click();
    await security.getByRole('button',{name:'Да, завершить все и выйти',exact:true}).click();
    await page.getByRole('heading',{name:'С возвращением'}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('usd_refresh_token')),null);
    report.actions.push({width,scenario:'email conflict/retry, session list error/retry, selected cancel/revoke, bulk revoke/sign-out',mutations:writes().map(({method,path})=>({method,path}))});
    await context.close();

    const password=await scenario(width,'JUDGE');
    await password.page.locator('#account-current-password').fill('Synthetic-current-password');
    await password.page.locator('#account-new-password').fill('Synthetic-new-password');
    await password.page.locator('#account-password-confirmation').fill('Mismatch-password');
    await password.security.getByRole('button',{name:'Сменить пароль',exact:true}).click();
    await password.security.getByRole('alert').filter({hasText:'Пароли не совпадают'}).waitFor();
    await password.page.locator('#account-password-confirmation').fill('Synthetic-new-password');
    await password.security.getByRole('button',{name:'Сменить пароль',exact:true}).click();
    assert.equal(password.state.calls.some(call=>call.path==='/auth/change-password'),false);
    password.state.passwordError=true;
    await password.security.getByRole('button',{name:'Сменить пароль и выйти',exact:true}).click();
    await password.security.getByRole('alert').filter({hasText:'Неверный текущий пароль'}).waitFor();
    password.state.passwordError=false;
    await password.security.getByRole('button',{name:'Сменить пароль',exact:true}).click();
    await password.security.getByRole('button',{name:'Сменить пароль и выйти',exact:true}).click();
    await password.page.getByRole('heading',{name:'С возвращением'}).waitFor();
    assert.equal(await password.page.evaluate(()=>localStorage.getItem('usd_refresh_token')),null);
    assert.deepEqual(password.state.calls.find(call=>call.path==='/auth/change-password').body,{currentPassword:'Synthetic-current-password',newPassword:'Synthetic-new-password'});
    report.actions.push({width,scenario:'judge password mismatch, confirmation, error/retry and sign-out'});
    await password.context.close();
  }
  assert.deepEqual(report.blocked,[],'unexpected outbound requests or mutations were blocked');
  assert.deepEqual(report.failures,[],'browser runtime errors');
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({scope:report.scope,pages:report.pages.length,actions:report.actions.length,blocked:report.blocked.length,failures:report.failures.length,output},null,2));
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
