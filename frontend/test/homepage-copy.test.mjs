import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {HOMEPAGE_COPY_FIELDS,homepageCopy} from '../src/public/homepage-copy.ts';

test('all homepage section copy has a unique CMS key and a fallback',()=>{
 assert.equal(HOMEPAGE_COPY_FIELDS.length,24);
 assert.equal(new Set(HOMEPAGE_COPY_FIELDS.map(field=>field.key)).size,HOMEPAGE_COPY_FIELDS.length);
 assert.ok(HOMEPAGE_COPY_FIELDS.every(field=>field.label&&field.fallback));
});
test('CMS copy overrides defaults and intentionally empty copy stays empty',()=>{
 assert.equal(homepageCopy({},'nextStageEmptyTitle'),'Скоро громче.');
 assert.equal(homepageCopy({copy:{nextStageEmptyTitle:'Скоро в эфире'}},'nextStageEmptyTitle'),'Скоро в эфире');
 assert.equal(homepageCopy({copy:{nextStageEmptyTitle:''}},'nextStageEmptyTitle'),'');
});
test('homepage editor exposes the same CMS keys used by the public renderer',async()=>{
 const [admin,home]=await Promise.all([
  readFile(new URL('../src/admin/SiteSettingsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/public/PremiumHome.tsx',import.meta.url),'utf8'),
 ]);
 assert.match(admin,/HOMEPAGE_COPY_FIELDS\.map/);
 for(const field of HOMEPAGE_COPY_FIELDS)assert.ok(home.includes("homeCopy('"+field.key+"')"),field.key+' must be rendered');
});
