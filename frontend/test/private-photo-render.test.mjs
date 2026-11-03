import test from 'node:test';
import assert from 'node:assert/strict';
import {safePhotoSource} from '../src/public/photo-source.ts';

test('authenticated Blob URLs render as photos without permitting arbitrary Blob links',()=>{
 const privateUrl='blob:https://app.usd-russia.ru/updated-car-photo';
 const registry=new Set([privateUrl]);
 const trusted=url=>registry.has(url);
 assert.equal(safePhotoSource(privateUrl,trusted),privateUrl);
 assert.equal(safePhotoSource('blob:https://app.usd-russia.ru/unknown',trusted),'');
 registry.delete(privateUrl);
 assert.equal(safePhotoSource(privateUrl,trusted),'');
});
test('normal public images work and non-image schemes remain blocked',()=>{
 const nobody=()=>false;
 assert.equal(safePhotoSource('https://cdn.example/car.jpg',nobody),'https://cdn.example/car.jpg');
 assert.equal(safePhotoSource('/media/public-file/CAR_PHOTO/car-1',nobody),'/media/public-file/CAR_PHOTO/car-1');
 assert.equal(safePhotoSource('javascript:alert(1)',nobody),'');
 assert.equal(safePhotoSource('data:image/svg+xml,abc',nobody),'');
 assert.equal(safePhotoSource('mailto:attacker@example.com',nobody),'');
});
