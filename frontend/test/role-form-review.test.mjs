import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {journeyReviewRows} from '../src/admin/form-journey-model.ts';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');
test('admin review exposes human-readable values but never secrets',()=>{
 const fields=[{name:'name',label:'Название',required:true},{name:'secret',label:'API секрет',type:'password'},{name:'active',label:'Активен',type:'checkbox'},{name:'count',label:'Количество',type:'number'},{name:'notes',label:'Комментарий'}];
 assert.deepEqual(journeyReviewRows(fields,{name:'  Этап USD ',secret:'do-not-disclose',active:true,count:0,notes:''}),[
  {name:'name',label:'Название',value:'Этап USD'},
  {name:'active',label:'Активен',value:'Да'},
  {name:'count',label:'Количество',value:'0'},
  {name:'notes',label:'Комментарий',value:'Не указано'},
 ]);
});
test('entry registration, judging and long admin forms have explicit accessible review steps',async()=>{
 const [walkIn,judge,admin]=await Promise.all([
  read('../src/admin/InspectionsPage.tsx'),read('../src/admin/ResultsPage.tsx'),read('../src/admin/FormComponents.tsx')]);
 assert.match(walkIn,/aria-label="Шаги регистрации на месте"/);
 assert.match(walkIn,/walkInStepProgress\(/);
 assert.match(walkIn,/Подтверждение регистрации/);
 assert.match(walkIn,/hidden=\{walkInStep!==0\}/);
 assert.match(walkIn,/hidden=\{walkInStep!==1\}/);
 assert.match(walkIn,/hidden=\{walkInStep!==2\}/);
 assert.match(judge,/aria-label="Шаги внесения результата"/);
 assert.match(judge,/hidden=\{judgingStep!==0\}/);
 assert.match(judge,/hidden=\{judgingStep!==1\}/);
 assert.match(judge,/hidden=\{judgingStep!==2\}/);
 assert.match(admin,/journeyReviewRows\(fields,v\)/);
 assert.match(admin,/Проверка перед сохранением/);
 assert.match(admin,/role="status"/);
});

test('admin equipment configuration offers direct sections and a final version review',async()=>{
 const [source,css]=await Promise.all([read('../src/admin/ConfigurationsPage.tsx'),read('../src/admin/form-journey.css')]);
 assert.match(source,/aria-label="Этапы редактирования конфигурации"/);
 assert.match(source,/activeView==='REVIEW'/);
 assert.match(source,/hidden=\{admin&&activeView!=='SETUP'\}/);
 assert.match(source,/hidden=\{admin&&activeView!=='POWER'\}/);
 assert.match(source,/hidden=\{admin&&activeView!==direction\}/);
 assert.match(source,/Проверить конфигурацию/);
 assert.match(css,/\.configuration-editor-page \[hidden\]/);
});

test('mobile catalog combobox chooses on touch before blur removes the option',async()=>{
 const form=await read('../src/admin/FormComponents.tsx');
 assert.match(form,/onPointerDown=\{event=>\{/);
 assert.match(form,/event\.pointerType==='touch'/);
 assert.match(form,/choose\(option\)/);
});
