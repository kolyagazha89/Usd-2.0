import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import assert from 'node:assert/strict';
import App from '../../src/App';
const state=globalThis as any;
let root:ReturnType<typeof createRoot>|undefined;
let calls:Array<{path:string;body:any}>=[];
const flush=async()=>{await act(async()=>{await new Promise(r=>setTimeout(r,0))})};
const button=(text:RegExp)=>[...document.querySelectorAll('button')].find(b=>text.test(b.textContent??''))!;
async function click(b:HTMLElement){assert.ok(b);await act(async()=>b.click());await flush();}
async function fill(input:HTMLInputElement,value:string){assert.ok(input);await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));});}
async function submit(form:HTMLFormElement){assert.ok(form);await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))});await flush();}
async function mount(emailSent=true){
 if(root)await act(async()=>root!.unmount());history.replaceState({},'','/login');calls=[];
 state.__signupPost=async(path:string,body:any)=>{calls.push({path,body});return {success:true,emailSent,retryAfterSeconds:60}};
 root=createRoot(document.getElementById('root')!);await act(async()=>root!.render(<App/>));await flush();
}
export async function runSignupEmailResend(){try{
 for(const emailSent of [true,false]){
  await mount(emailSent);await click(button(/Нет аккаунта/));
  await fill(document.querySelector('input[type=email]')!,'driver@example.com');
  for(const input of document.querySelectorAll<HTMLInputElement>('input[type=password]'))await fill(input,'Strong-password1');
  for(const input of [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].slice(0,2))await click(input);
  await submit(document.querySelector('form')!);
  const resend=button(/Отправить письмо повторно/);assert.ok(resend,'signup, including failed SMTP, must expose verification resend');
  assert.equal(resend.disabled,true);assert.match(document.querySelector('.verification-resend')?.textContent??'',/driver@example.com/);
  assert.equal((document.querySelector('input[type=password]') as HTMLInputElement)?.value,'');
  await fill(document.querySelector('input[type=email]')!,'other@example.com');
  await act(async()=>state.__advanceResendClock(61_000));assert.equal(resend.disabled,false);
  let resolve:any;state.__signupPost=(path:string,body:any)=>{calls.push({path,body});return new Promise(r=>{resolve=r})};
  await act(async()=>{resend.click();resend.click()});
  const sends=calls.filter(c=>c.path==='/auth/resend-verification');assert.equal(sends.length,1);assert.equal(sends[0].body.email,'driver@example.com');
  await act(async()=>resolve({success:true,retryAfterSeconds:60,message:'Проверьте почту.'}));await flush();
  assert.equal(resend.disabled,true);assert.match(document.querySelector('.verification-resend [role=status]')?.textContent??'',/Проверьте почту/);
 }
 await mount();await click(button(/Нет аккаунта/));
 await fill(document.querySelector('input[type=email]')!,'waiting@example.com');
 for(const input of document.querySelectorAll<HTMLInputElement>('input[type=password]'))await fill(input,'Strong-password1');
 for(const input of [...document.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].slice(0,2))await click(input);
 let resolveSignup:any;state.__signupPost=()=>new Promise(r=>{resolveSignup=r});
 await submit(document.querySelector('form')!);
 assert.equal(button(/Уже есть аккаунт/).disabled,true,'pending signup must prevent stale completion in password recovery');
 await act(async()=>resolveSignup({success:true,emailSent:true}));await flush();
 assert.ok(document.querySelector('.verification-resend'));
 await mount();await click(button(/Не пришло письмо подтверждения/));
 assert.ok(document.querySelector('.verification-resend input[type=email]'));
 await fill(document.querySelector('.verification-resend input[type=email]')!,'pending@example.com');
 state.__signupPost=async(path:string,body:any)=>{calls.push({path,body});throw new Error('Слишком много запросов. Повторите попытку позже.')};
 await submit(document.querySelector('.verification-resend form')!);
 assert.match(document.querySelector('.verification-resend [role=alert]')?.textContent??'',/Слишком много запросов/);
 assert.equal(button(/Отправить письмо повторно/).disabled,true);
 await click(button(/Забыли пароль/));assert.equal(document.querySelector('.verification-resend'),null);
}finally{if(root)await act(async()=>root!.unmount())}}
