import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../../src/App';

let root:ReturnType<typeof createRoot>|undefined;
let calls:Array<{path:string;method:string;body:any}>=[];
let mutation:(path:string,body:any)=>Promise<any>;
let listSessions:()=>Promise<any>;
let failLogout=false;
let logoutRequest:()=>Promise<any>;
const sessions=[{id:'session/one',familyId:'family-one',userAgent:'Chrome on Android',ipAddress:'192.0.2.1',createdAt:'2026-10-01T10:00:00Z',updatedAt:'2026-10-29T10:00:00Z',expiresAt:'2026-11-01T10:00:00Z'},
  {id:'session-two',familyId:'family-two',userAgent:null,ipAddress:null,createdAt:'2026-10-02T10:00:00Z',updatedAt:'2026-10-28T10:00:00Z',expiresAt:'2026-11-02T10:00:00Z'}];
const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))})};
const section=()=>{const node=document.querySelector<HTMLElement>('.participant-account-security');assert.ok(node,'account settings must be available inside the cabinet');return node};
const button=(text:string,scope:ParentNode=section())=>{const node=[...scope.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text);assert.ok(node,'missing button: '+text);return node};
const click=async(text:string)=>{await act(async()=>button(text).click());await flush()};
const fillInput=async(input:HTMLInputElement,value:string)=>{assert.ok(input);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}))})};
const fill=async(id:string,value:string)=>fillInput(document.getElementById(id) as HTMLInputElement,value);
const submit=async(id:string)=>{const form=document.getElementById(id)!;assert.ok(form);await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))});await flush()};
const writes=()=>calls.filter(c=>c.method!=='GET'&&c.path!=='/auth/refresh');

async function mount(role='PARTICIPANT',linked=true,judge=false){
  if(root)await act(async()=>root!.unmount());
  history.replaceState({},'','/participant?tab=profile');
  localStorage.clear();calls=[];
  const user={id:'fixture-user',email:'fixture@example.test',role,participantId:linked?'fixture-participant':null,
    ...(judge?{customRoleId:'judge',customRole:{id:'judge',key:'judge',name:'Судья',permissions:{results:['view']}}}:{})};
  mutation=async()=>({success:true});listSessions=async()=>sessions;failLogout=false;logoutRequest=async()=>({success:true});
  (globalThis as any).__securityFetch=async(url:string,init:RequestInit={})=>{
    const path=new URL(url).pathname,method=init.method??'GET',body=init.body?JSON.parse(String(init.body)):undefined;
    calls.push({path,method,body});
    let data:any={};let status=200;
    try{
      if(path==='/auth/refresh')data={accessToken:'synthetic-access',refreshToken:'synthetic-refresh',user};
      else if(path==='/auth/sessions'&&method==='GET')data=await listSessions();
      else if(path==='/auth/logout'){if(failLogout)throw Object.assign(Error('Сервис выхода временно недоступен'),{status:503});data=await logoutRequest();}
      else if(method!=='GET')data=await mutation(path,body);
      else if(path==='/participants/me')data={participant:{id:'fixture-participant',firstName:'Тест',lastName:'Участник',isPublic:true}};
      else if(['/participants/me/cars','/registrations/me','/stages/public','/participants/teams'].includes(path))data=[];
      else if(path==='/auth/legal-consent')data={legalReady:false};
    }catch(cause){if((cause as Error).name==='TypeError')throw cause;status=(cause as {status?:number}).status??400;data={message:(cause as Error).message}}
    return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  };
  root=createRoot(document.getElementById('root')!);
  await act(async()=>root!.render(<App/>));await flush();
}

export async function runAccountSecurity(){
  try{
    // A role restriction or participant-link prerequisite must not hide personal security.
    for(const [role,linked,judge]of [['PARTICIPANT',true,false],['ADMIN',true,false],['PARTICIPANT',true,true],['ADMIN',false,false],['PARTICIPANT',false,true]] as const){
      await mount(role,linked,judge);
      assert.match(section().textContent??'',/Безопасность аккаунта/);
      assert.match(section().textContent??'',/fixture@example.test/);
      assert.ok(calls.some(c=>c.path==='/auth/sessions'));
      assert.equal(calls.some(c=>c.path.startsWith('/auth/admin/')),false);
    }

    await mount();
    await fill('account-current-password','Current-password');
    await fill('account-new-password','short');await fill('account-password-confirmation','short');
    await submit('account-password-form');
    assert.match(section().querySelector('[role="alert"]')?.textContent??'',/8.*128/);assert.equal(writes().length,0);
    await fill('account-new-password','New-password');await fill('account-password-confirmation','Different-password');await submit('account-password-form');
    assert.match(section().querySelector('[role="alert"]')?.textContent??'',/не совпадают/);assert.equal(writes().length,0);
    await fill('account-password-confirmation','New-password');button('Сменить пароль').focus();await submit('account-password-form');
    assert.equal(writes().length,0,'the first submit must explain and confirm the sign-out');
    await click('Отмена');assert.equal(writes().length,0);
    assert.equal(document.activeElement===button('Сменить пароль'),true,'cancelling password confirmation restores keyboard focus to its trigger');
    await submit('account-password-form');
    mutation=async()=>{throw Object.assign(Error('Неверный текущий пароль'),{status:401})};
    await click('Сменить пароль и выйти');
    assert.match(section().querySelector('[role="alert"]')?.textContent??'',/Неверный текущий пароль/);
    assert.equal(localStorage.getItem('usd_refresh_token'),'synthetic-refresh');
    assert.equal(writes().filter(call=>call.path==='/auth/change-password').length,2,'HTTP 401 checks the existing refresh-and-retry client behavior');
    let finishPassword:()=>void=()=>{};
    mutation=()=>new Promise(resolve=>{finishPassword=()=>resolve({success:true})});
    await submit('account-password-form');
    const passwordWrites=writes().length;
    await act(async()=>{button('Сменить пароль и выйти').click();button('Сменить пароль и выйти').click()});
    assert.equal(writes().length,passwordWrites+1,'password changes must ignore duplicate confirmations');
    assert.equal(button('Меняем пароль…').disabled,true);
    await act(async()=>finishPassword());await flush();
    assert.deepEqual(writes().filter(c=>c.path==='/auth/change-password').at(-1),{path:'/auth/change-password',method:'POST',body:{currentPassword:'Current-password',newPassword:'New-password'}});
    assert.equal(localStorage.getItem('usd_refresh_token'),null,'password rotation must end local auth after success');
    assert.match(document.querySelector('h1')?.textContent??'',/С возвращением/);

    // A remote logout failure after password rotation must not turn a successful
    // password change into a false failure or keep the local session alive.
    await mount();
    failLogout=true;
    await fill('account-current-password','Current-password');
    await fill('account-new-password','Rotated-password');
    await fill('account-password-confirmation','Rotated-password');
    await submit('account-password-form');
    await click('Сменить пароль и выйти');
    assert.equal(writes().filter(call=>call.path==='/auth/change-password').length,1);
    assert.equal(localStorage.getItem('usd_refresh_token'),null,'local logout is mandatory even when remote logout fails');
    assert.match(document.querySelector('h1')?.textContent??'',/С возвращением/);

    await mount();
    await fill('account-new-email',' FIXTURE@example.test ');await fill('account-email-password','Current-password');await submit('account-email-form');
    assert.match(section().querySelector('[role="alert"]')?.textContent??'',/совпадает/);assert.equal(writes().length,0);
    await fill('account-new-email','broken');await submit('account-email-form');assert.equal(writes().length,0);
    await fill('account-new-email',' New.Address@example.test ');
    let finish:()=>void=()=>{};
    mutation=()=>new Promise(resolve=>{finish=()=>resolve({success:true})});
    await act(async()=>{const form=document.getElementById('account-email-form')!;for(let i=0;i<2;i++)form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))});
    assert.equal(writes().length,1,'email confirmation request must ignore duplicate submits');
    assert.deepEqual(writes()[0],{path:'/auth/request-email-change',method:'POST',body:{email:'new.address@example.test',currentPassword:'Current-password'}});
    assert.equal(button('Отправляем…').disabled,true);
    await act(async()=>finish());await flush();
    assert.match(section().querySelector('[role="status"]')?.textContent??'',/new.address@example.test/);
    assert.equal((document.getElementById('account-email-password') as HTMLInputElement).value,'');
    assert.equal(localStorage.getItem('usd_refresh_token'),'synthetic-refresh','pending email change keeps the current email/session');
    assert.match(section().textContent??'',/fixture@example.test/);

    await mount();
    mutation=async()=>{throw Error('Этот email уже используется')};
    await fill('account-new-email','occupied@example.test');await fill('account-email-password','Current-password');await submit('account-email-form');
    assert.match(section().querySelector('[role="alert"]')?.textContent??'',/Этот email уже используется/);
    assert.equal(localStorage.getItem('usd_refresh_token'),'synthetic-refresh');
    mutation=async()=>({success:true});await fill('account-new-email','available@example.test');await submit('account-email-form');
    assert.match(section().querySelector('[role="status"]')?.textContent??'',/available@example.test/);

    await mount();
    assert.match(section().textContent??'',/Chrome on Android/);assert.match(section().textContent??'',/Неизвестное устройство/);
    assert.equal(section().querySelectorAll('.account-security-current-label').length,0,'a client without server proof must not label a current device');
    const revoke=section().querySelector<HTMLButtonElement>('[aria-label="Завершить сеанс: Chrome on Android"]')!;
    await act(async()=>revoke.click());await flush();assert.equal(writes().length,0);
    await click('Отмена');assert.equal(writes().length,0);
    await act(async()=>revoke.click());await flush();
    mutation=async()=>{throw Error('Сеанс уже завершён')};
    await click('Да, завершить сеанс');assert.match(section().querySelector('[role="alert"]')?.textContent??'',/Сеанс уже завершён/);
    mutation=async()=>({success:true});
    await act(async()=>revoke.click());await flush();await click('Да, завершить сеанс');
    assert.equal(section().querySelector('[aria-label="Завершить сеанс: Chrome on Android"]'),null);
    assert.equal(writes().at(-1)?.path,'/auth/sessions/session%2Fone');
    assert.equal(localStorage.getItem('usd_refresh_token'),'synthetic-refresh','single revocation cannot identify whether it was this device');
    await click('Завершить все сеансы');assert.equal(writes().filter(c=>c.path==='/auth/sessions').length,0);
    mutation=async()=>{throw Error('Не удалось завершить все сеансы')};await click('Да, завершить все и выйти');
    assert.match(section().querySelector('[role="alert"]')?.textContent??'',/Не удалось завершить все сеансы/);
    assert.equal(localStorage.getItem('usd_refresh_token'),'synthetic-refresh','failed bulk revoke must not sign out locally');
    await click('Завершить все сеансы');
    let finishRevoke:()=>void=()=>{};
    mutation=()=>new Promise(resolve=>{finishRevoke=()=>resolve({success:true})});
    const previousWrites=writes().length;
    await act(async()=>{button('Да, завершить все и выйти').click();button('Да, завершить все и выйти').click()});
    assert.equal(writes().length,previousWrites+1,'bulk revocation must ignore duplicate confirmations');
    await act(async()=>finishRevoke());await flush();
    assert.equal(writes().filter(c=>c.path==='/auth/sessions'&&c.method==='DELETE').length,2);
    assert.equal(localStorage.getItem('usd_refresh_token'),null);

    // Bulk session revocation is committed server-side even if the subsequent
    // remote logout endpoint is unavailable; the browser must still sign out.
    await mount();
    failLogout=true;
    await click('Завершить все сеансы');
    await click('Да, завершить все и выйти');
    assert.equal(writes().filter(call=>call.path==='/auth/sessions'&&call.method==='DELETE').length,1);
    assert.equal(localStorage.getItem('usd_refresh_token'),null,'bulk revoke must clear local auth despite remote logout failure');
    assert.match(document.querySelector('h1')?.textContent??'',/С возвращением/);

    await mount();
    const racingRevoke=section().querySelector<HTMLButtonElement>('[aria-label="Завершить сеанс: Chrome on Android"]')!;
    await act(async()=>racingRevoke.click());await flush();
    let finishStaleList:(value:any)=>void=()=>{};
    listSessions=()=>new Promise(resolve=>{finishStaleList=resolve});await click('Обновить сеансы');
    await click('Да, завершить сеанс');
    assert.equal(section().querySelector('[aria-label="Завершить сеанс: Chrome on Android"]'),null);
    await act(async()=>finishStaleList(sessions));await flush();
    assert.equal(Boolean(section().querySelector('[aria-label="Завершить сеанс: Chrome on Android"]')),false,'a GET started before successful revocation must not restore the revoked session');
    assert.match(section().textContent??'',/Неизвестное устройство/,'remaining sessions must be visible after revocation');

    await mount();
    listSessions=async()=>[{...sessions[0],isCurrent:true},sessions[1]];await click('Обновить сеансы');
    assert.equal(section().querySelectorAll('.account-security-current-label').length,1);
    assert.equal(section().querySelector('.account-security-current-label')?.textContent,'Это устройство');
    const currentRevoke=section().querySelector<HTMLButtonElement>('[aria-label="Завершить сеанс: Chrome on Android"]')!;
    await act(async()=>currentRevoke.click());await flush();
    assert.match(section().querySelector('[aria-label="Подтверждение завершения сеансов"]')?.textContent??'',/сразу выйдете/);
    mutation=async()=>{throw Error('Не удалось завершить сеанс')};await click('Да, завершить и выйти');
    assert.equal(localStorage.getItem('usd_refresh_token'),'synthetic-refresh','failed current-device revocation must keep local auth');
    mutation=async()=>({success:true});
    let finishLogout:()=>void=()=>{};
    logoutRequest=()=>new Promise(resolve=>{finishLogout=()=>resolve({success:true})});
    await act(async()=>currentRevoke.click());await flush();await click('Да, завершить и выйти');
    assert.equal(localStorage.getItem('usd_refresh_token'),null,'proven current-device revocation must clear local auth before remote logout cleanup finishes');
    assert.match(document.querySelector('h1')?.textContent??'',/С возвращением/);
    assert.equal(writes().filter(call=>call.method==='DELETE').at(-1)?.path,'/auth/sessions/session%2Fone');
    mutation=async path=>path==='/auth/login'?{accessToken:'new-access',refreshToken:'new-refresh',user:{id:'fixture-user',email:'fixture@example.test',role:'PARTICIPANT',participantId:'fixture-participant'}}:{success:true};
    await fillInput(document.querySelector<HTMLInputElement>('.login-card input[type="email"]')!,'fixture@example.test');
    await fillInput(document.querySelector<HTMLInputElement>('.login-card input[type="password"]')!,'New-password');
    await act(async()=>document.querySelector('.login-card form')!.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));await flush();
    assert.equal(calls.filter(call=>call.path==='/auth/login').length,0,'new login must wait for pending logout cookie cleanup');
    await act(async()=>finishLogout());await flush();
    assert.equal(calls.filter(call=>call.path==='/auth/login').length,1);
    assert.equal(localStorage.getItem('usd_refresh_token'),'new-refresh','old logout must not clear a subsequent successful login');
    assert.ok(section());

    await mount();
    let finishList:(value:any)=>void=()=>{};
    listSessions=()=>new Promise(resolve=>{finishList=resolve});
    await click('Обновить сеансы');
    assert.match(section().querySelector('[role="status"]')?.textContent??'',/Загружаем сеансы/);
    assert.equal(button('Обновить сеансы').disabled,true);
    await act(async()=>finishList(sessions));await flush();
    listSessions=async()=>{throw Error('Список временно недоступен')};await click('Обновить сеансы');
    assert.match(section().querySelector('[role="alert"]')?.textContent??'',/Список временно недоступен/);
    assert.equal(section().textContent?.includes('Активных сеансов нет'),false,'loading failure must not look like an empty list');
    listSessions=async()=>[];await click('Обновить сеансы');
    assert.match(section().textContent??'',/Активных сеансов нет/);
    assert.equal(button('Завершить все сеансы').disabled,true);
    listSessions=async()=>{throw new TypeError('Failed to fetch')};await click('Обновить сеансы');
    assert.match(section().querySelector('[role="alert"]')?.textContent??'',/Failed to fetch/);
    assert.equal(localStorage.getItem('usd_refresh_token'),'synthetic-refresh','network rejection keeps local auth');
    listSessions=async()=>sessions;await click('Обновить сеансы');
    assert.match(section().textContent??'',/Chrome on Android/);
  }finally{
    if(root)await act(async()=>root!.unmount());root=undefined;
  }
}
