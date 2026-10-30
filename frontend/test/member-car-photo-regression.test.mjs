import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');

test('car photo replacement updates preview from the freshly uploaded private URL',()=>{
 assert.match(app,/const uploaded=await uploadEntityPhoto\('CAR_PHOTO',car\.id,file\)/);
 assert.match(app,/setCar\(\(current:any\)=>current\?\.id===car\.id\?\{\.\.\.current,photoUrl:uploaded\.url\}:current\)/);
 assert.doesNotMatch(app,/await uploadEntityPhoto\('CAR_PHOTO',car\.id,file\);await load\(\)/);
});

test('car detail shows an explicit change-photo button, not a raw file field',()=>{
 assert.match(app,/aria-label="Изменить фото автомобиля"/);
 assert.match(app,/'Изменить фото'/);
 assert.match(app,/className="participant-car-photo-controls"/);
});
