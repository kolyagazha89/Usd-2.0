import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const source=rel=>readFile(path.resolve(here,rel),'utf8');

test('site settings progress reports filled values without mislabeling legal approval',async()=>{
 const bundle=await build({entryPoints:[path.resolve(here,'../src/admin/site-settings-progress.ts')],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 const logic=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 assert.equal(logic.SITE_SETTING_SECTIONS.length,11);
 assert.equal(logic.HOME_EDITOR_STEPS.length,3);
 assert.equal(logic.normalizeSiteSection('legal'),'legal');
 assert.equal(logic.normalizeSiteSection('unknown'),'branding');
 assert.equal(logic.normalizeHomeEditorStep('copy'),'copy');
 assert.equal(logic.normalizeHomeEditorStep('xxx'),'hero');
 const settings={legal:{ipName:'USD',inn:'123',legalApproved:false},seo:{title:'USD',description:'Два поля'}};
 const legal=logic.siteSettingProgress(settings,'legal');
 assert.equal(legal.approved,false);
 assert.equal(legal.label,'Не утверждено');
 assert.equal(legal.count,2);
 const seo=logic.siteSettingProgress(settings,'seo');
 assert.equal(seo.total,7);
 assert.equal(seo.count,2);
 assert.equal(logic.siteSettingProgress({legal:{...settings.legal,legalApproved:true}},'legal').approved,true);
 const hero=logic.homeEditorProgress({},'hero');
 assert.ok(hero.total>hero.done);
 const copy=logic.homeEditorProgress({copy:{},valuesCards:[]},'copy');
 assert.equal(copy.done,0);
 assert.ok(copy.total>=24,'homepage has many copy fields and must show honest denominator');
});

test('site settings form is split into eleven deep-linkable pages and three home steps',async()=>{
 const [page,routes,nav,css]=await Promise.all([
  source('../src/admin/SiteSettingsPage.tsx'),source('../src/admin/AdminRoutes.tsx'),
  source('../src/admin/SiteSettingsJourney.tsx'),source('../src/admin/site-settings-journey.css')]);
 assert.match(routes,/routePath=\{path\} go=\{go\}/);
 assert.match(page,/normalizeSiteSection\(query\.get\('section'\)\)/);
 assert.match(page,/normalizeHomeEditorStep\(query\.get\('step'\)\)/);
 assert.match(page,/function SiteSettingsPage\([\s\S]*?routePath,go/);
 assert.match(page,/go\('\/admin\/site-settings\?section='\+section/);
 assert.match(page,/<SiteSettingsJourney settings=\{settings\}/);
 for(const id of ['hero','copy','blocks'])assert.match(page,new RegExp("homeStep==='"+id+"'&&<section"));
 assert.match(page,/className="homepage-hero-upload"/,'hero image stays with the hero editor');
 assert.match(page,/className="block-sort-list"/,'block management remains editable');
 assert.match(page,/setSavedSnapshot\(JSON\.stringify\(r\.settings\)\)/);
 assert.match(page,/const dirty=Boolean\(settings&&savedSnapshot/);
 assert.match(nav,/aria-label="Разделы настроек сайта"/);
 assert.match(nav,/aria-label="Этапы оформления главной"/);
 assert.match(nav,/aria-current=\{section===item\.id\?'step':undefined\}/);
 assert.match(nav,/Несохранён|несохранённые изменения/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(css,/background:#fff/,'admin must remain white');
});

test('car editor is a three-screen journey with actual car identity and plate validation',async()=>{
 const [page,css]=await Promise.all([source('../src/admin/CarsPage.tsx'),source('../src/admin/car-editor-journey.css')]);
 for(const x of ['Автомобиль и владелец','Регистрация','Публикация'])assert.ok(page.includes(x),x);
 for(const x of [0,1,2])assert.ok(page.includes('step==='+x),'step '+x);
 assert.match(page,/isValidPlate\(String\(v\.registrationCountry/);
 assert.match(page,/const identityReady=Boolean/);
 assert.match(page,/const plateReady=Boolean/);
 assert.match(page,/aria-label="Этапы заполнения автомобиля"/);
 assert.match(page,/role="progressbar"/);
 assert.match(page,/aria-valuenow=\{Number\(identityReady\)\+Number\(plateReady\)\}/);
 assert.match(page,/void onSubmit\(clean\(v\)\)/,'persist only from final review');
 assert.match(page,/type="submit" className="primary-button"/);
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(css,/\.usd-car-editor-summary/);
 assert.match(css,/background:#fff/);
});

test('generic long admin resource forms are progressively grouped with required-field completeness',async()=>{
 const bundle=await build({entryPoints:[path.resolve(here,'../src/admin/form-journey-model.ts')],bundle:true,platform:'node',format:'esm',write:false,logLevel:'silent'});
 const logic=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
 const fields=[{name:'name',label:'Название',required:true},{name:'year',label:'Год',type:'number',required:true},{name:'city',label:'Город'},{name:'date',label:'Дата',required:true},{name:'status',label:'Статус'},{name:'open',label:'Открыта',type:'checkbox'},{name:'place',label:'Площадка'},{name:'address',label:'Адрес'},{name:'notes',label:'Описание'},{name:'seasonId',label:'Сезон',required:true}];
 const grouped=logic.groupFormFields(fields,5);
 assert.equal(grouped.length,2);
 assert.deepEqual(grouped.map(x=>x.length),[5,5]);
 assert.equal(logic.groupFormFields(fields.slice(0,6),5).length,1,'short forms stay on one page');
 assert.equal(logic.isJourneyFieldFilled(fields[1],0),true,'zero can be meaningful numeric input');
 assert.equal(logic.isJourneyFieldFilled(fields[5],false),false,'an unchecked required consent never counts');
 assert.equal(logic.missingJourneyField(fields,{}).name,'name');
 assert.deepEqual(logic.journeyRequiredProgress(fields,{name:'USD',year:2026,date:'2026-11-03',seasonId:'s1'}),{done:4,total:4});
});

test('the generic resource editor preserves existing field types and validates each page before final save',async()=>{
 const [form,css,resource]=await Promise.all([source('../src/admin/FormComponents.tsx'),source('../src/admin/form-journey.css'),source('../src/admin/ResourcePage.tsx')]);
 assert.match(form,/groupFormFields\(fields,5\)/);
 assert.match(form,/missingJourneyField\(visible,v\)/);
 assert.match(form,/journeyRequiredProgress\(fields,v\)/);
 assert.match(form,/aria-label="Этапы заполнения формы"/);
 assert.match(form,/role="progressbar"/);
 assert.match(form,/setStep\(activeStep\+1\)/);
 assert.match(form,/void onSubmit\(clean\(v\)\)/);
 assert.match(form,/f\.type==='checkbox'/);
 assert.match(form,/f\.type==='textarea'/);
 assert.match(form,/f\.optionsPath/);
 assert.match(form,/isValidInternationalPhone/);
 assert.match(form,/isValidPlate/);
 assert.match(resource,/<EntityForm key=\{modal\.id\?\?'new-record'\}/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/\.entity-form-step-nav/);
});
