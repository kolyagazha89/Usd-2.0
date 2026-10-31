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
const report={scope:'Local built frontend, every remote request intercepted, synthetic API and credentials only; no live acceptance.',pages:[],actions:[],viewportChecks:[],blocked:[],failures:[]};
const browser=await chromium.launch({headless:true,...(process.env.USD_BROWSER_EXECUTABLE?{executablePath:process.env.USD_BROWSER_EXECUTABLE}:{})});
const widths=process.env.USD_ACCOUNT_QA_WIDTHS?process.env.USD_ACCOUNT_QA_WIDTHS.split(',').map(Number):[1440,390,320];
assert.ok(widths.length&&widths.every(width=>Number.isInteger(width)&&width>=320&&width<=2560),'Invalid USD_ACCOUNT_QA_WIDTHS');

const settleViewport=page=>page.evaluate(()=>new Promise((resolve,reject)=>{
  let lastX=scrollX,lastY=scrollY,stable=0;
  const started=performance.now();
  function frame(){
    if(performance.now()-started>5000){reject(new Error('Viewport scroll did not settle'));return}
    if(scrollX===lastX&&scrollY===lastY)stable++;else stable=0;
    lastX=scrollX;lastY=scrollY;
    if(stable>=8)resolve();else requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}));
async function captureFocused(page,locator,name){
  await settleViewport(page);
  const geometry=await locator.evaluate(element=>{
    const rect=element.getBoundingClientRect();
    const fixed=[...document.querySelectorAll('.participant-portal-header,.participant-tabs')].filter(chrome=>['fixed','sticky'].includes(getComputedStyle(chrome).position)).map(chrome=>{const box=chrome.getBoundingClientRect();return {name:chrome.className,top:box.top,bottom:box.bottom,left:box.left,right:box.right}});
    const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
    return {focused:document.activeElement===element,rect:{top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right},viewport:{width:innerWidth,height:innerHeight},chrome:fixed,covered:fixed.some(box=>rect.left<box.right&&rect.right>box.left&&rect.top<box.bottom&&rect.bottom>box.top),hit:hit===element||element.contains(hit)};
  });
  const screenshot=name+'.png';
  await page.screenshot({path:path.join(output,screenshot)});
  report.viewportChecks.push({screenshot,...geometry});
  assert.equal(geometry.focused,true,name+': expected keyboard focus '+JSON.stringify(geometry));
  assert.equal(geometry.covered,false,name+': focused control overlaps cabinet chrome '+JSON.stringify(geometry));
  assert.ok(geometry.rect.top>=0&&geometry.rect.bottom<=geometry.viewport.height,name+': focused control outside viewport '+JSON.stringify(geometry));
  assert.equal(geometry.hit,true,name+': focused control is obscured '+JSON.stringify(geometry));
}
async function scenario(width,kind,linked=true,checkFocused=false,markCurrent=false){
  const user={id:'fixture-user',email:'fixture@example.test',role:kind==='ADMIN'?'ADMIN':'PARTICIPANT',participantId:linked?participant.id:null,
    ...(kind==='JUDGE'?{customRoleId:'judge',customRole:{id:'judge',key:'judge',name:'Судья',permissions:{results:['view']}}}:{})};
  const context=await browser.newContext({viewport:{width,height:1000}});
  const state={sessions:structuredClone(sessionFixtures),calls:[],listError:false,emailError:false,passwordError:false,logoutError:false,revokeError:false,holdLogout:false,releaseLogout:()=>{}};
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===base)return route.continue();
    if(isCandidateApiRequest(url)){
      const method=request.method(),p=url.pathname;
      const body=request.postDataJSON();
      state.calls.push({path:p,method,body});
      let data={},status=200;
      if(p==='/auth/refresh')data={accessToken:'synthetic-access',refreshToken:'synthetic-refresh',user};
      else if(p==='/auth/login'&&method==='POST'){
        state.sessions=structuredClone(sessionFixtures);
        data={accessToken:'synthetic-new-access',refreshToken:'synthetic-new-refresh',user};
      }
      else if(p==='/auth/sessions'&&method==='GET'){
        if(state.listError){status=503;data={message:'Список временно недоступен'}}else data=state.sessions.map(session=>markCurrent&&session.id===sessionFixtures[0].id?{...session,isCurrent:true}:session);
      }else if(p==='/auth/sessions'&&method==='DELETE'){state.sessions=[];data={success:true,revoked:2}}
      else if(p.startsWith('/auth/sessions/')&&method==='DELETE'){
        if(state.revokeError){status=400;data={message:'Не удалось завершить сеанс'}}
        else{state.sessions=state.sessions.filter(session=>session.id!==decodeURIComponent(p.slice('/auth/sessions/'.length)));data={success:true}}
      }
      else if(p==='/auth/request-email-change'&&method==='POST'){
        if(state.emailError){status=409;data={message:'Этот email уже используется'}}else data={success:true};
      }else if(p==='/auth/change-password'&&method==='POST'){
        if(state.passwordError){status=401;data={message:'Неверный текущий пароль'}}else data={success:true};
      }else if(p==='/auth/logout'&&method==='POST'){
        if(state.holdLogout)await new Promise(resolve=>{state.releaseLogout=resolve});
        if(state.logoutError){status=503;data={message:'Сервис выхода недоступен'}}else data={success:true};}
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
  if(!linked){
    const onboarding=page.locator('.profile-match-page.usd-member');
    await onboarding.getByRole('heading',{name:/Все ваши выступления/}).waitFor();
    assert.equal(await security.count(),0,'unlinked participants should see the identity onboarding, not account security');
    assert.equal(state.calls.some(call=>call.path==='/auth/sessions'),false,'no session settings request before identity association');
    const layout=await page.evaluate(()=>({
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      backdrop:getComputedStyle(document.querySelector('.profile-match-page.usd-member')).backgroundColor,
    }));
    assert.equal(layout.overflow,false,`${kind} unlinked ${width}: onboarding overflows viewport`);
    assert.ok(['rgb(7, 9, 13)','rgb(8, 11, 16)'].includes(layout.backdrop),'first-login backdrop must be dark');
    const screenshot=`${kind.toLowerCase()}-unlinked-${width}-onboarding.png`;
    await page.screenshot({path:path.join(output,screenshot)});
    report.pages.push({width,role:kind,linked:false,securityHidden:true,screenshot,...layout});
    return {context,page,security,state};
  }
  await security.getByRole('heading',{name:'Безопасность аккаунта'}).waitFor();
  await security.getByText('Неизвестное устройство',{exact:true}).waitFor();
  assert.equal(await security.locator('.account-security-current-label').count(),markCurrent?1:0,'label only a server-proven current device');
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,inputSizes:[...document.querySelectorAll('.participant-account-security input')].map(input=>parseFloat(getComputedStyle(input).fontSize)),dark:getComputedStyle(document.querySelector('.account-security-card')).backgroundImage,titleBackgrounds:[...document.querySelectorAll('.account-security-card-title,.account-security-card-title h3')].map(element=>({tag:element.tagName,background:getComputedStyle(element).backgroundColor}))}));
  assert.equal(layout.overflow,false,`${kind} ${width}: horizontal overflow`);
  assert.ok(layout.inputSizes.every(size=>size>=16),'iOS inputs must be at least 16px');
  assert.ok(layout.dark.includes('linear-gradient'),'security cards must retain their dark skin for staff');
  assert.ok(layout.titleBackgrounds.every(title=>title.background==='rgba(0, 0, 0, 0)'),`card titles must not inherit rectangular card backgrounds: ${JSON.stringify(layout.titleBackgrounds)}`);
  const prefix=`${kind.toLowerCase()}-${linked?'linked':'unlinked'}-${width}`;
  await writeFile(path.join(output,prefix+'-layout.json'),JSON.stringify(layout,null,2));
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await settleViewport(page);
  await page.screenshot({path:path.join(output,prefix+'-profile-top.png')});
  await security.evaluate(element=>{const header=document.querySelector('.participant-portal-header')?.getBoundingClientRect();scrollTo({top:scrollY+element.getBoundingClientRect().top-(header?.height??0)-24,behavior:'instant'})});
  await settleViewport(page);await page.screenshot({path:path.join(output,prefix+'-security-heading.png')});
  if(checkFocused){
    for(const id of ['account-current-password','account-new-password','account-password-confirmation','account-new-email','account-email-password']){
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await settleViewport(page);
      const field=page.locator('#'+id);await field.focus();
      await captureFocused(page,field,prefix+'-focus-'+id);
    }
  }
  report.pages.push({width,role:kind,linked,markCurrent,screenshots:{profileTop:prefix+'-profile-top.png',securityHeading:prefix+'-security-heading.png'},...layout});
  return {context,page,security,state};
}

try{
  for(const width of widths){
    for(const [role,linked]of [['PARTICIPANT',true],['ADMIN',true],['JUDGE',true],['ADMIN',false],['JUDGE',false]]){
      const candidate=await scenario(width,role,linked,role==='PARTICIPANT');
      await candidate.context.close();
    }
  }
  for(const width of widths){
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
    await captureFocused(page,security.getByRole('button',{name:'Да, завершить сеанс',exact:true}),`participant-${width}-confirm-selected`);
    assert.equal(writes().filter(call=>call.method==='DELETE').length,0);
    await security.getByRole('button',{name:'Отмена',exact:true}).click();
    await revoke.click();
    await security.getByRole('button',{name:'Да, завершить сеанс',exact:true}).click();
    await revoke.waitFor({state:'detached'});
    assert.equal(writes().at(-1).path,'/auth/sessions/session%2Fone');
    await security.getByRole('button',{name:'Завершить все сеансы',exact:true}).click();
    await captureFocused(page,security.getByRole('button',{name:'Да, завершить все и выйти',exact:true}),`participant-${width}-confirm-all`);
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
    await captureFocused(password.page,password.security.getByRole('button',{name:'Сменить пароль и выйти',exact:true}),`judge-${width}-confirm-password`);
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

    const current=await scenario(width,'PARTICIPANT',true,false,true);
    const badge=current.security.getByText('Это устройство',{exact:true});
    await badge.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));await settleViewport(current.page);
    await current.page.screenshot({path:path.join(output,`participant-${width}-proven-current.png`)});
    const currentRevoke=current.security.getByRole('button',{name:'Завершить сеанс: '+sessionFixtures[0].userAgent,exact:true});
    await currentRevoke.click();
    const currentConfirm=current.security.getByRole('button',{name:'Да, завершить и выйти',exact:true});
    await captureFocused(current.page,currentConfirm,`participant-${width}-confirm-current`);
    current.state.revokeError=true;await currentConfirm.click();
    await current.security.getByRole('alert').filter({hasText:'Не удалось завершить сеанс'}).waitFor();
    assert.equal(await current.page.evaluate(()=>localStorage.getItem('usd_refresh_token')),'synthetic-refresh','failed current revoke preserves local auth');
    current.state.revokeError=false;current.state.holdLogout=true;
    await currentRevoke.click();
    const cleanupStarted=current.page.waitForRequest(request=>new URL(request.url()).pathname==='/auth/logout');
    await currentConfirm.click();await cleanupStarted;
    await current.page.getByRole('heading',{name:'С возвращением'}).waitFor();
    assert.equal(await current.page.evaluate(()=>localStorage.getItem('usd_refresh_token')),null,'current revoke signs out before cookie cleanup responds');
    await current.page.getByLabel('Email',{exact:true}).fill('fixture@example.test');
    await current.page.getByLabel('Пароль',{exact:true}).fill('Synthetic-current-password');
    await current.page.getByRole('button',{name:'Войти',exact:true}).click();
    await current.page.getByRole('button',{name:'Входим…',exact:true}).waitFor();
    assert.equal(current.state.calls.filter(call=>call.path==='/auth/login').length,0,'new login must wait for pending cookie cleanup');
    current.state.releaseLogout();
    await current.page.getByRole('heading',{name:'Безопасность аккаунта'}).waitFor();
    assert.equal(await current.page.evaluate(()=>localStorage.getItem('usd_refresh_token')),'synthetic-new-refresh','completed old cleanup must not erase new credentials');
    report.actions.push({width,scenario:'proven current-device label, revoke confirmation, failure/retry, immediate local sign-out and safe relogin during pending cookie cleanup'});
    await current.context.close();

    const currentFailure=await scenario(width,'PARTICIPANT',true,false,true);
    currentFailure.state.logoutError=true;
    await currentFailure.security.getByRole('button',{name:'Завершить сеанс: '+sessionFixtures[0].userAgent,exact:true}).click();
    await currentFailure.security.getByRole('button',{name:'Да, завершить и выйти',exact:true}).click();
    await currentFailure.page.getByRole('heading',{name:'С возвращением'}).waitFor();
    assert.equal(await currentFailure.page.evaluate(()=>localStorage.getItem('usd_refresh_token')),null);
    assert.equal(currentFailure.state.calls.filter(call=>call.method==='DELETE').length,1);
    report.actions.push({width,scenario:'current-device revoke with failed remote logout still clears local auth'});
    await currentFailure.context.close();

    // The server may revoke sessions / rotate the password while the separate
    // logout request fails. Verify both successful mutations still sign out.
    const bulkFailure=await scenario(width,'PARTICIPANT');
    bulkFailure.state.logoutError=true;
    await bulkFailure.security.getByRole('button',{name:'Завершить все сеансы',exact:true}).click();
    await bulkFailure.security.getByRole('button',{name:'Да, завершить все и выйти',exact:true}).click();
    await bulkFailure.page.getByRole('heading',{name:'С возвращением'}).waitFor();
    assert.equal(await bulkFailure.page.evaluate(()=>localStorage.getItem('usd_refresh_token')),null);
    assert.equal(bulkFailure.state.calls.filter(call=>call.path==='/auth/sessions'&&call.method==='DELETE').length,1);
    report.actions.push({width,scenario:'bulk revoke with failed remote logout still clears local auth'});
    await bulkFailure.context.close();

    const passwordFailure=await scenario(width,'JUDGE');
    passwordFailure.state.logoutError=true;
    await passwordFailure.page.locator('#account-current-password').fill('Synthetic-current-password');
    await passwordFailure.page.locator('#account-new-password').fill('Synthetic-rotated-password');
    await passwordFailure.page.locator('#account-password-confirmation').fill('Synthetic-rotated-password');
    await passwordFailure.security.getByRole('button',{name:'Сменить пароль',exact:true}).click();
    await passwordFailure.security.getByRole('button',{name:'Сменить пароль и выйти',exact:true}).click();
    await passwordFailure.page.getByRole('heading',{name:'С возвращением'}).waitFor();
    assert.equal(await passwordFailure.page.evaluate(()=>localStorage.getItem('usd_refresh_token')),null);
    assert.equal(passwordFailure.state.calls.filter(call=>call.path==='/auth/change-password').length,1);
    report.actions.push({width,scenario:'password rotation with failed remote logout still clears local auth'});
    await passwordFailure.context.close();
  }
  assert.deepEqual(report.blocked,[],'unexpected outbound requests or mutations were blocked');
  assert.deepEqual(report.failures,[],'browser runtime errors');
  await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({scope:report.scope,pages:report.pages.length,actions:report.actions.length,viewportChecks:report.viewportChecks.length,blocked:report.blocked.length,failures:report.failures.length,output},null,2));
}finally{
  await browser.close();await new Promise(resolve=>server.close(resolve));
}
