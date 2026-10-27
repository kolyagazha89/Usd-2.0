import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('homepage hero and calls to action read copy from CMS settings',async()=>{
 const home=await source('../src/public/PremiumHome.tsx');
 for(const field of ['heroKicker','communityTitle','communitySubtitle','communityButtonLabel','documentsDescription','documentsButtonLabel']){
  assert.match(home,new RegExp("homeText\\('"+field+"'"));
 }
 assert.match(home,/heroTitle&&heroTitle!=='USD'/);
 assert.match(home,/settings\.homepage\?\.heroTitle/);
});

test('admin provides editing controls for homepage copy and persists through settings API',async()=>{
 const admin=await source('../src/admin/SiteSettingsPage.tsx');
 for(const field of ['heroKicker','communityTitle','communitySubtitle','communityButtonLabel','documentsDescription','documentsButtonLabel']){
  assert.match(admin,new RegExp('homepage\\.'+field));
 }
 assert.match(admin,/updateSiteSettings\(settings\)/);
});

test('server defaults provide CMS copy for fresh sites and keep old data compatible',async()=>{
 const backend=await source('../../backend/src/site-settings/site-settings.service.ts');
 assert.match(backend,/heroKicker:'USD \/ ЧЕМПИОНАТ ПО АВТОЗВУКУ'/);
 assert.match(backend,/communityTitle:/);
 assert.match(backend,/documentsButtonLabel:/);
 assert.match(backend,/homepage:this\.merge\(DEFAULTS\.homepage,row\?\.homepage\)/);
});

test('CMS headlines wrap on mobile without clipping',async()=>{
 const css=await source('../src/dark-velocity-sitewide.css');
 assert.match(css,/\.u-community-call h2\s*\{[\s\S]*?white-space:pre-line/);
 assert.match(css,/overflow-wrap:anywhere/);
});
