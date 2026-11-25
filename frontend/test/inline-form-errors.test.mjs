import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {build} from 'esbuild';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';

test('registration search and configuration errors are local to the action',async t=>{
 const base=path.dirname(fileURLToPath(import.meta.url)),scratch=await mkdtemp(path.join(base,'.inline-errors-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://usd.test/admin/inspections'});
 const globals={window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,location:dom.window.location,history:dom.window.history,IS_REACT_ACT_ENVIRONMENT:true};
 const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 try{
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});
  globalThis.__formGet=async url=>url==='/participants/lookup'?[{id:'person',lastName:'Тестовый',firstName:'Участник'}]:url==='/site-settings/public'?{settings:{legal:{legalApproved:true,legalVersion:'test',ipName:'USD',privacyText:'test',consentText:'test',termsText:'test',documents:{officialProtocolConsent:{targetId:'legal-document-officialProtocolConsent-test',url:'/test'}}}}}:url.includes('/cars')?[{id:'car',brand:'Lada',model:'Vesta'}]:url.endsWith('/classes')?[{classId:'class',class:{id:'class',name:'Тестовый класс',direction:{id:'spl',name:'SPL'}}}]:[];
  const outfile=path.join(scratch,'forms.mjs');
  await build({stdin:{contents:"export {InspectionRegistrationModal,InspectionDetailPage} from './InspectionsPage';export {ConfigurationEditor} from './ConfigurationsPage';export {ResultEditor} from './ResultsPage'",resolveDir:path.join(base,'../src/admin'),loader:'tsx'},bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile,packages:'external',loader:{'.css':'empty'},plugins:[{name:'test-boundaries',setup(b){
   b.onLoad({filter:/InspectionsPage\.tsx$/},async args=>({loader:'tsx',contents:await readFile(args.path,'utf8')+'\nexport {InspectionRegistrationModal,InspectionDetailPage};'}));
   b.onLoad({filter:/ResultsPage\.tsx$/},async args=>({loader:'tsx',contents:await readFile(args.path,'utf8')+'\nexport {ResultEditor};'}));
   b.onLoad({filter:/[\\/]api\.ts$/},()=>({loader:'ts',contents:'export const apiGet=(url)=>globalThis.__formGet(url);export const apiPost=async()=>{throw new Error("Сервер отклонил запись")};export const apiPut=apiPost;export const apiPatch=apiPost;export const listData=v=>Array.isArray(v)?v:[];export const getSiteSettings=()=>apiGet("/site-settings/public");export const getPublicSiteSettings=()=>apiGet("/site-settings/public");'}));
   b.onLoad({filter:/use-vehicle-directory\.ts$/},()=>({loader:'ts',contents:'export const useVehicleDirectory=()=>({makes:["Lada"],modelsFor:()=>["Vesta"],loaded:true,error:""});'}));
  }}]});
  const React=await import('react'),{act}=React,{createRoot}=await import('react-dom/client');
  const {InspectionRegistrationModal,InspectionDetailPage,ConfigurationEditor,ResultEditor}=await import(pathToFileURL(outfile).href);
  let root;
  const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes(text));
  const click=async el=>{assert.ok(el);await act(async()=>el.click())};
  const input=async(el,value)=>{assert.ok(el);await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?window.HTMLSelectElement.prototype:window.HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}))})};
  const mount=async component=>{root=createRoot(document.getElementById('root'));await act(async()=>root.render(component))};
  const unmount=async()=>act(async()=>root.unmount());
  const Select=({value,options,onChange,ariaLabel})=>React.createElement('select',{'aria-label':ariaLabel,value,onChange:e=>onChange(e.target.value)},React.createElement('option',{value:''},'Выберите'),...options.map(o=>React.createElement('option',{key:o.id,value:o.id},o.label)));
  const walkIn=()=>React.createElement(InspectionRegistrationModal,{stageId:'stage',onClose(){},onSaved:async()=>{},SearchableSelect:Select,displayCarName:()=>'',LoadingPage:()=>null,enumLabel:String});
  await t.test('empty and cleared search hide all participants',async()=>{
   await mount(walkIn());try{
    assert.equal(document.querySelectorAll('.registration-profile-choice').length,0);
    assert.equal(button('Показать все профили'),undefined);
    await input(document.querySelector('.registration-profile-search input'),'тест');
    assert.equal(document.querySelectorAll('.registration-profile-choice').length,1);
    await input(document.querySelector('.registration-profile-search input'),'   ');
    assert.equal(document.querySelectorAll('.registration-profile-choice').length,0);
   }finally{await unmount()}
  });
  await t.test('profile validation and API errors appear next to create button',async()=>{
   await mount(walkIn());try{
    await click(button('Новый участник на въезде'));
    const form=document.querySelector('[aria-label="Создание нового участника на въезде"]');
    await input(form.querySelector('[autocomplete="family-name"]'),'Тестовый');await input(form.querySelector('[autocomplete="given-name"]'),'Новичок');
    await input(form.querySelector('[aria-label="Марка автомобиля"]'),'Lada');await input(form.querySelector('[aria-label="Модель автомобиля"]'),'Vesta');
    const plate=form.querySelector('input[placeholder="А001УР01"]');await input(plate,'А001УР00');
    for(const box of document.querySelectorAll('.consent-option input'))await click(box);
    await click(button('Создать профиль и автомобиль'));
    assert.match(form.querySelector('[role="alert"]')?.textContent??'',/формат и регион/);
    await input(plate,'А001УР01');await click(button('Создать профиль и автомобиль'));
    assert.match(form.querySelector('[role="alert"]')?.textContent??'',/Сервер отклонил запись/);
    assert.equal(button('Создать профиль и автомобиль').disabled,false);
   }finally{await unmount()}
  });
  await t.test('car and final registration failures stay with their submit actions',async()=>{
   await mount(walkIn());try{
    await input(document.querySelector('.registration-profile-search input'),'тест');
    await click(document.querySelector('.registration-profile-choice'));
    await click(button('Добавить автомобиль на въезде'));
    const form=document.querySelector('[aria-label="Новый автомобиль существующего участника"]');
    await input(form.querySelector('[aria-label="Марка автомобиля"]'),'Lada');await input(form.querySelector('[aria-label="Модель автомобиля"]'),'Vesta');
    await input(form.querySelector('input[placeholder="А001УР01"]'),'А001УР01');
    for(const box of document.querySelectorAll('.consent-option input'))await click(box);
    await click(button('Добавить автомобиль и продолжить'));
    assert.match(form.querySelector('[role="alert"]')?.textContent??'',/Сервер отклонил запись/);
    await click(button('Скрыть добавление автомобиля'));
    const carSelect=[...document.querySelectorAll('select')].find(el=>el.parentElement.textContent==='АвтомобильВыберитеLada · Vesta');
    assert.ok(carSelect);await input(carSelect,'car');
    await click(button('Продолжить'));await click(document.querySelector('#walk-in-classes input'));
    await click(button('Продолжить'));await click(button('Подтвердить и зарегистрировать'));
    assert.match(document.querySelector('.form-wizard-actions [role="alert"]')?.textContent??'',/Сервер отклонил запись/);
    assert.equal(document.querySelectorAll('[role="alert"]').length,1,'no stale error at another action');
   }finally{await unmount()}
  });
  await t.test('inspection rejection error stays in the reason confirmation panel',async()=>{
   await mount(React.createElement(InspectionDetailPage,{registration:{id:'reg',stageId:'stage',classes:[],car:{id:'car'}},user:{id:'admin',role:'ADMIN'},readOnly:false,onBack(){},onSaved:async()=>{},go(){},displayCarName:()=>''}));try{
    await click(button('Не прошёл'));
    const textarea=document.querySelector('.inspection-confirm-box textarea');
    await act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'Тестовая причина');textarea.dispatchEvent(new window.Event('input',{bubbles:true}))});
    await click(button('Подтвердить: не прошёл'));
    assert.match(document.querySelector('.inspection-confirm-box [role="alert"]')?.textContent??'',/Сервер отклонил запись/);
   }finally{await unmount()}
  });
  await t.test('judging editor displays server feedback beside confirmation',async()=>{
   await mount(React.createElement(ResultEditor,{value:{id:'result',registrationId:'reg',value:120},registrations:[],results:[],saving:false,error:'Ошибка записи измерения',onClose(){},onSubmit:async()=>{},displayCarName:()=>'',enumLabel:String}));try{
    assert.match(document.querySelector('.judging-submit [role="alert"]')?.textContent??'',/Ошибка записи измерения/);
   }finally{await unmount()}
  });
  await t.test('configuration API failure stays next to save button',async()=>{
   await mount(React.createElement(ConfigurationEditor,{carId:'car',configuration:{name:'Тест'},admin:true,onClose(){},onSaved:async()=>{},saveOverride:async()=>{throw new Error('Ошибка записи конфигурации')}}));try{
    await click(button('Проверить конфигурацию'));await click(button('Создать конфигурацию'));
    assert.match(document.querySelector('.config-editor-actions [role="alert"]')?.textContent??'',/Ошибка записи конфигурации/);
    assert.equal(button('Создать конфигурацию').disabled,false);
   }finally{await unmount()}
  });
 }finally{
  dom.window.close();delete globalThis.__formGet;
  for(const [key,d] of previous){if(d)Object.defineProperty(globalThis,key,d);else delete globalThis[key]}
  await rm(scratch,{recursive:true,force:true});
 }
});
