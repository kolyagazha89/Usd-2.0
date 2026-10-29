import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalForRoute,openGraphImageUrl} from '../src/public/metadata-model.ts';

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
