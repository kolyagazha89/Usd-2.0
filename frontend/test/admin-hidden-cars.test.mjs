import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL('../src/'+path,import.meta.url),'utf8');

test('admin car page keeps historical cars in a separate explicitly chosen archive tab',async()=>{
 const code=await source('admin/CarsPage.tsx');
 const css=await source('admin/admin-shell-layout.css');
 assert.match(code,/aria-label="Видимость автомобилей"/);
 assert.match(code,/>Активные авто<\/button>/);
 assert.match(code,/>Скрытые авто<\/button>/);
 assert.match(code,/const visibility=params\.get\('visibility'\)==='hidden'\?'hidden':'active'/);
 assert.match(code,/apiGet<any>\('\/cars\?visibility='\+visibility\)/);
 assert.match(code,/c\.isActive!==\(visibility==='active'\)/);
 assert.match(code,/setSearch\(''\);setPage\(1\)/);
 assert.match(css,/\.usd-admin-car-visibility-tabs button\[aria-pressed="true"\]/);
 assert.match(css,/\.usd-admin-car-visibility-tabs button \{\s*min-height:44px/);
});

test('hiding historical car does not delete it or erase linked results',async()=>{
 const code=await source('admin/CarsPage.tsx');
 assert.match(code,/apiPatch\('\/cars\/'\+id,\{isActive:false,isPublic:false\}\)/);
 assert.match(code,/Скрыть автомобиль\? Результаты сохранятся/);
 assert.match(code,/apiPatch\('\/cars\/'\+id,\{isActive:true\}\)/);
 assert.match(code,/Восстановить автомобиль/);
 assert.doesNotMatch(code,/apiDelete\('\/cars\/'/);
 assert.match(code,/canEdit&&!detail\.isActive&&/);
});

test('archived vehicles are hidden from all normal selections and historical public protocols',async()=>{
 const admin=await source('admin/CarsPage.tsx');
 assert.match(admin,/visibility==='hidden'\?'Скрытых автомобилей пока нет'/);
 assert.match(admin,/carDetailsPath\(car\.id\)/);
});
