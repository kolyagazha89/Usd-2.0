import test from 'node:test';
import assert from 'node:assert/strict';
import {safePhotoSource,publicEntityPhotoSource} from '../src/public/photo-source.ts';

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

test('reloading a member gallery revokes stale authenticated object URLs without touching new photos',async()=>{
 const {readFile}=await import('node:fs/promises');
 const source=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
 assert.match(source,/const portalPhotoUrls=useRef<Set<string>>/);
 assert.match(source,/!active\.has\(url\)\)releasePrivateMediaUrl\(url\)/);
 assert.match(source,/portalPhotoUrls\.current\.clear\(\)/);
 assert.match(source,/getMediaUrl\('CAR_PHOTO',car\.id\)/);
});

test('public car and participant photos use the protected API route, never private S3 links',()=>{
 const proxy=(type,id)=>'/media/public-file/'+type+'/'+encodeURIComponent(id);
 const car={id:'car-1',isPublic:true,photoUrl:'https://private-s3.example/cars/car-1/object'};
 assert.equal(publicEntityPhotoSource('CAR_PHOTO',car,proxy),'/media/public-file/CAR_PHOTO/car-1');
 assert.equal(publicEntityPhotoSource('PARTICIPANT_PHOTO',{...car,id:'person 1'},proxy),'/media/public-file/PARTICIPANT_PHOTO/person%201');
 assert.equal(publicEntityPhotoSource('CAR_PHOTO',{...car,photoUrl:null},proxy),'');
 assert.equal(publicEntityPhotoSource('CAR_PHOTO',{...car,isPublic:false},proxy),'');
 assert.equal(publicEntityPhotoSource('CAR_PHOTO',{...car,id:''},proxy),'');
});

test('every public car and participant card uses the visibility-checked media API',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const name of ['PublicCommunity.tsx','HomeScoreboards.tsx','PremiumHome.tsx']){
  const source=await readFile(new URL('../src/public/'+name,import.meta.url),'utf8');
  assert.ok(source.includes('publicEntityPhotoSource('),name);
  for(const raw of ['src={p.photoUrl}','src={c.photoUrl}','src={entity.photoUrl}','src={participant?.photoUrl}']){
   assert.ok(!source.includes(raw),name+' leaked raw image URL: '+raw);
  }
 }
 const photo=await readFile(new URL('../src/public/PremiumUI.tsx',import.meta.url),'utf8');
 assert.ok(photo.includes('failure.key===sourceKey'));
 assert.ok(photo.includes('previous.key===sourceKey'));
});
