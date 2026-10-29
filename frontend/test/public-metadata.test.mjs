import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalForRoute,openGraphImageUrl,publicImageAssetUrl,socialTitleForRoute} from '../src/public/metadata-model.ts';

const origin='https://app.usd-russia.ru';

test('canonical tags use the actual public route instead of repeating the CMS homepage canonical',()=>{
 assert.equal(canonicalForRoute('/stages/123','https://app.usd-russia.ru/',origin),origin+'/stages/123');
 assert.equal(canonicalForRoute('/participants/abc?ref=private#history','/',origin),origin+'/participants/abc');
 assert.equal(canonicalForRoute('/records',undefined,origin),origin+'/records');
 assert.equal(canonicalForRoute('/','https://app.usd-russia.ru/landing?campaign=x#top',origin),origin+'/landing');
});

test('canonical metadata never crosses from the prerelease site to the primary domain',()=>{
 assert.equal(canonicalForRoute('/','https://usd-russia.ru/',origin),origin+'/');
 assert.equal(canonicalForRoute('//evil.example/steal','https://usd-russia.ru/',origin),origin+'/');
 assert.equal(canonicalForRoute('/results','javascript:alert(1)',origin),origin+'/results');
});

test('Open Graph images accept web URLs but reject non-image schemes',()=>{
 assert.equal(openGraphImageUrl('/uploads/hero.webp',origin),origin+'/uploads/hero.webp');
 assert.equal(openGraphImageUrl('https://cdn.example.com/hero.webp',origin),'https://cdn.example.com/hero.webp');
 for(const bad of ['mailto:person@example.com','tel:+70000000000','javascript:alert(1)','//evil.example/a.png','\\\\evil.example\\a.png']){
  assert.equal(openGraphImageUrl(bad,origin),origin+'/usd/usd-show-hero.webp');
 }
});

test('CMS homepage social title does not override individual stage and participant previews',()=>{
 assert.equal(socialTitleForRoute('/','USD — Главная','Официальный USD'),'Официальный USD');
 assert.equal(socialTitleForRoute('/stages/123','Этап в Тюмени — USD','Официальный USD'),'Этап в Тюмени — USD');
 assert.equal(socialTitleForRoute('/participants/abc','Участник — USD','Официальный USD'),'Участник — USD');
 assert.equal(socialTitleForRoute('/','USD — Главная','  '),'USD — Главная');
});

test('HTTPS pages never embed mixed-content images or credentials from CMS',()=>{
 const fallback=origin+'/usd/usd-show-hero.webp';
 for(const value of [
  'http://cdn.example.com/hero.webp',
  'https://user:password@cdn.example.com/hero.webp',
  'javascript:alert(1)',
  'data:image/svg+xml,<svg/>',
  '/uploads/hero\\\\broken.webp',
  'https://cdn.example.com/hero.webp\\\\broken',
  'https://cdn.example.com/hero.webp\nX-Injected: yes',
 ])assert.equal(openGraphImageUrl(value,origin),fallback,value);
 assert.equal(openGraphImageUrl('https://cdn.example.com/hero.webp',origin),'https://cdn.example.com/hero.webp');
 assert.equal(publicImageAssetUrl('/uploads/logo.svg',origin,'/fallback.svg'),origin+'/uploads/logo.svg');
 assert.equal(publicImageAssetUrl('http://cdn.example.com/logo.svg',origin,'/fallback.svg'),origin+'/fallback.svg');
 assert.equal(publicImageAssetUrl('mailto:admin@example.com',origin,'/fallback.svg'),origin+'/fallback.svg');
 assert.equal(publicImageAssetUrl('',origin,'/fallback.svg'),origin+'/fallback.svg');
 assert.equal(openGraphImageUrl('http://cdn.example.com/hero.webp','http://localhost:3000'),'http://cdn.example.com/hero.webp');
});

test('canonical override rejects embedded credentials on the same hostname',()=>{
 assert.equal(canonicalForRoute('/','https://user:secret@app.usd-russia.ru/private',origin),origin+'/');
});

test('public metadata clears stale CMS keywords and uses per-route social titles',async()=>{
 const {readFile}=await import('node:fs/promises');
 const shell=await readFile(new URL('../src/public/PremiumShell.tsx',import.meta.url),'utf8');
 assert.match(shell,/socialTitleForRoute\(path,text,settings\.seo\?\.ogTitle\)/);
 assert.match(shell,/set\('keywords',settings\.seo\?\.keywords\|\|''\)/);
 assert.match(shell,/publicImageAssetUrl\(settings\.branding\?\.faviconUrl/);
});
