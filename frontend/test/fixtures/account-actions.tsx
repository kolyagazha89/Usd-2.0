import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../../src/App';

const state=globalThis as any;
const token='a'.repeat(64);
const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0))})};
let root:ReturnType<typeof createRoot>|undefined;
let calls:Array<{path:string;body:any}>=[];
async function mount(path:string,user:any=null){
  if(root)await act(async()=>root!.unmount());
  history.replaceState({},'',path);
  state.__accountUser=user;
  state.__clearedSessions=0;
  calls=[];
  state.__postAction=async(path:string,body:any)=>{calls.push({path,body});return {success:true}};
  root=createRoot(document.getElementById('root')!);
  await act(async()=>root!.render(<App/>));
  await flush();
}
async function fill(id:string,value:string){
  const input=document.getElementById(id) as HTMLInputElement;
  assert.ok(input);
  await act(async()=>{
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);
    input.dispatchEvent(new window.Event('input',{bubbles:true}));
  });
}
async function submit(){
  const form=document.querySelector('form');
  assert.ok(form);
  await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))});
  await flush();
}
export async function runAccountActions(){
  try{
    // Public email actions must win over the authenticated admin/participant shells.
    for(const user of [null,{id:'admin',email:'admin@example.test',role:'ADMIN'},{id:'participant',email:'participant@example.test',role:'PARTICIPANT'}]){
      for(const action of ['reset-password','confirm-email-change']){
        await mount('/'+action+'?token='+token,user);
        assert.match(document.querySelector('h1')?.textContent??'',action==='reset-password'?/Новый пароль/:/Подтверждение нового email/);
        assert.equal(calls.length,0,'opening a mail link must not change account data');
        assert.ok(document.querySelector('form'));
        assert.equal(document.querySelector('.sidebar'),null);
      }
    }
    for(const action of ['reset-password','confirm-email-change']){
      for(const suffix of ['', '?token=broken']){
        await mount('/'+action+suffix);
        assert.match(document.querySelector('[role="alert"]')?.textContent??'',/Ссылка недействительна/);
        assert.equal(document.querySelector('form'),null);
        assert.equal(calls.length,0);
        const back=[...document.querySelectorAll('button')].find(button=>button.textContent?.includes('Вернуться ко входу'))!;
        await act(async()=>back.click());await flush();
        assert.equal(location.pathname,'/login');
      }
    }
    await mount('/reset-password?token='+token);
    await fill('recovery-password','short');
    await fill('recovery-confirmation','short');
    await submit();
    assert.match(document.querySelector('[role="alert"]')?.textContent??'',/от 8 до 128/);
    assert.equal(calls.length,0);
    await fill('recovery-password','Strong-test-password');
    await fill('recovery-confirmation','Different-test-password');
    await submit();
    assert.match(document.querySelector('[role="alert"]')?.textContent??'',/не совпадают/);
    assert.equal(calls.length,0);

    await fill('recovery-confirmation','Strong-test-password');
    state.__postAction=async(path:string,body:any)=>{calls.push({path,body});throw new Error('Срок действия токена восстановления истёк')};
    await submit();
    assert.match(document.querySelector('[role="alert"]')?.textContent??'',/истёк/);
    assert.equal(state.__clearedSessions,0,'failed reset must keep the existing session');
    assert.equal((document.querySelector('button[type="submit"]') as HTMLButtonElement).disabled,false);
    state.__postAction=async(path:string,body:any)=>{calls.push({path,body});return {success:true}};
    await submit();
    assert.equal(calls.length,2);
    assert.deepEqual(calls[1],{path:'/auth/reset-password',body:{token,password:'Strong-test-password'}});
    assert.equal(state.__clearedSessions,1);
    assert.match(document.querySelector('[role="status"]')?.textContent??'',/Пароль успешно изменён/);
    assert.equal(document.querySelector('input[type="password"]'),null);
    await act(async()=>document.querySelector<HTMLButtonElement>('.primary-button')!.click());await flush();
    assert.equal(location.pathname,'/login');
    assert.match(document.querySelector('h1')?.textContent??'',/С возвращением/);

    await mount('/confirm-email-change?token='+token);
    let resolveRequest:()=>void=()=>{};
    state.__postAction=(path:string,body:any)=>{calls.push({path,body});return new Promise(resolve=>{resolveRequest=()=>resolve({success:true})})};
    const form=document.querySelector('form')!;
    await act(async()=>{
      form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
      form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
    });
    assert.equal(calls.length,1,'double click must not consume a one-time token twice');
    assert.deepEqual(calls[0],{path:'/auth/confirm-email-change',body:{token}});
    assert.equal((document.querySelector('button[type="submit"]') as HTMLButtonElement).disabled,true);
    assert.equal(state.__clearedSessions,0);
    await act(async()=>resolveRequest());await flush();
    assert.equal(state.__clearedSessions,1);
    assert.match(document.querySelector('[role="status"]')?.textContent??'',/Email успешно изменён/);
    assert.equal(document.querySelector('form'),null);
  }finally{
    if(root)await act(async()=>root!.unmount());
    root=undefined;
  }
}
