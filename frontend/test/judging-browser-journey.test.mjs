import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('browser QA follows judge three-step workflow rather than selecting hidden controls',async()=>{
 const source=await readFile(new URL('../../scripts/candidate-browser-qa.mjs',import.meta.url),'utf8');
 const start=source.indexOf("if(role==='ADMIN'&&route.startsWith('/admin/results')){");
 const section=source.slice(start,source.indexOf("if(role==='ADMIN'&&['/admin/registrations'",start));
 assert.ok(start>=0);
 assert.match(section,/await wizard\.getByRole\('button',\{name:'Продолжить'\}\)\.click\(\);/);
 assert.match(section,/await wizard\.getByRole\('combobox',\{name:'Доступный класс'\}\)\.selectOption\('rc1'\)/);
 assert.match(section,/await wizard\.getByRole\('spinbutton',\{name:'Значение результата'\}\)\.fill/);
 assert.match(section,/Подтвердить и сохранить измерение/);
 assert.match(section,/Перейти назад|Назад/);
});
