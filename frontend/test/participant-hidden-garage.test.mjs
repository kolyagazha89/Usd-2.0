import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL('../src/'+path,import.meta.url),'utf8');

test('member garage keeps active vehicles prominent and archives collapsed below them',async()=>{
 const app=await source('App.tsx');
 const garage=await source('participant/ParticipantGarage.tsx');
 assert.match(app,/<ParticipantGarage /);
 assert.match(garage,/activeCars\.map\(/);
 assert.match(garage,/Скрытые автомобили/);
 assert.match(garage,/aria-expanded=\{hiddenOpen\}/);
 assert.match(garage,/hiddenOpen&&/);
 assert.match(garage,/\/participants\/me\/cars\?visibility=hidden/);
});

test('owner can hide and restore without deleting or republishing a vehicle',async()=>{
 const garage=await source('participant/ParticipantGarage.tsx');
 assert.match(garage,/apiPatch\('\/cars\/'\+encodeURIComponent\(car\.id\),\{isActive:nextActive\}\)/);
 assert.match(garage,/Результаты соревнований сохранятся/);
 assert.match(garage,/Скрыть автомобиль/);
 assert.match(garage,/Восстановить/);
 assert.doesNotMatch(garage,/apiDelete/);
 assert.match(garage,/disabled=\{visibilitySaving!==null\}/);
});

test('owner only sees active cars in registration pickers and detail page',async()=>{
 const app=await source('App.tsx');
 assert.match(app,/apiGet<any>\('\/participants\/me\/cars'\)/);
 assert.doesNotMatch(app,/apiGet<any>\('\/participants\/me\/cars\?visibility=hidden'\)/);
});
