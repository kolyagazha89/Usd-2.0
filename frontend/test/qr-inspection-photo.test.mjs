import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assertQrImageFile,scaledQrDimensions} from '../src/admin/qr-image-reader.ts';
import {parseInspectionQr} from '../src/participant/usd-id.ts';
test('an offline QR screenshot may be PNG, JPEG or WebP but not oversized or foreign content',()=>{
 for(const mime of ['image/png','image/jpeg','image/webp']){
  assert.doesNotThrow(()=>assertQrImageFile({type:mime,size:500000}));
 }
 for(const mime of ['image/svg+xml','application/pdf','image/heic','']){
  assert.throws(()=>assertQrImageFile({type:mime,size:2000}),/PNG|JPEG|WebP/);
 }
 assert.throws(()=>assertQrImageFile({type:'image/png',size:9*1024*1024}),/8 МБ/);
 assert.throws(()=>assertQrImageFile({type:'image/png',size:0}),/Пуст/);
});
test('scanning an image always bounds pixel work for large mobile photographs',()=>{
 assert.deepEqual(scaledQrDimensions(4000,3000),{width:1600,height:1200});
 assert.deepEqual(scaledQrDimensions(640,480),{width:640,height:480});
 assert.deepEqual(scaledQrDimensions(3000,4000),{width:1200,height:1600});
 assert.throws(()=>scaledQrDimensions(0,100),/изображен/);
 assert.throws(()=>scaledQrDimensions(50000,50000),/изображен/);
});
test('photo upload is only decoded locally and uses the existing authenticated QR scanning handler',async()=>{
 const source=await readFile(new URL('../src/admin/InspectionsPage.tsx',import.meta.url),'utf8');
 const reader=await readFile(new URL('../src/admin/qr-image-reader.ts',import.meta.url),'utf8');
 assert.match(source,/readInspectionQrImage/);
 assert.match(source,/type="file"/);
 assert.match(source,/accept="image\/png,image\/jpeg,image\/webp"/);
 assert.match(source,/await parse\(raw\)/);
 assert.match(reader,/jsQR/);
 assert.match(reader,/URL\.revokeObjectURL/);
 assert.doesNotMatch(reader,/fetch\(|apiPost\(|XMLHttpRequest/);
});
test('QR photo cannot silently switch origin or embed a different route',()=>{
 const origin='https://app.usd-russia.ru';
 assert.deepEqual(parseInspectionQr(origin+'/admin/inspections?stageId=stage1&registrationId=reg1',origin),{kind:'registration',stageId:'stage1',registrationId:'reg1'});
 assert.throws(()=>parseInspectionQr('https://evil.example/admin/inspections?stageId=stage1&registrationId=reg1',origin));
 assert.throws(()=>parseInspectionQr(origin+'/admin/results?stageId=stage1&registrationId=reg1',origin));
});
