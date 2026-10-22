import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('all three image defaults are editable through admin and persisted in public branding',async()=>{
 const [admin,settings]=await Promise.all([source('../src/admin/SiteSettingsPage.tsx'),source('../../backend/src/site-settings/site-settings.service.ts')]);
 assert.match(admin,/\['placeholders','Заглушки',ImageIcon\]/);
 for(const category of ['participant','car','stage']){
  assert.match(admin,new RegExp("key:'"+category+"'"));
  assert.match(settings,new RegExp(category+':null'));
 }
 assert.match(admin,/uploadSiteAsset\('placeholder-'\+key\+'-'\+crypto\.randomUUID\(\),file\)/);
 assert.match(admin,/updateSiteSettings\(\{branding:\{placeholders\}\}\)/);
 assert.match(admin,/result\?\.settings\?\.branding\?\.placeholders\?\.\[key\]/);
 assert.match(settings,/branding: s\.branding/);
});

test('public and member image components use the same placeholder settings and handle missing photos',async()=>{
 const [photo,provider,app,community,home,member,editor]=await Promise.all([
 source('../src/public/PremiumUI.tsx'),source('../src/public/PremiumShell.tsx'),
 source('../src/App.tsx'),source('../src/public/PublicCommunity.tsx'),
 source('../src/public/PremiumHome.tsx'),source('../src/participant/MemberDashboard.tsx'),
 source('../src/admin/ConfigurationsPage.tsx')]);
 assert.match(photo,/PremiumPlaceholders=createContext/);
 assert.match(photo,/const url=\[original,substitute\]\.find/);
 assert.match(photo,/onError=\{\(\)=>F/);
 assert.match(provider,/PremiumPlaceholders\.Provider/);
 assert.match(app,/placeholders=\{settings\.branding\?\.placeholders\}/);
 assert.match(app,/kind="stage"/);
 assert.match(community,/kind="participant"/);
 assert.match(community,/kind="car"/);
 assert.match(home,/kind="stage"/);
 assert.match(member,/placeholderSrc=\{placeholders\?\.participant\}/);
 assert.match(member,/placeholderSrc=\{placeholders\?\.car\}/);
 assert.match(editor,/placeholderSrc=\{photoPlaceholders\.car\}/);
});

test('poster and preview image boxes have natural height without black letterboxing',async()=>{
 const [css,admin]=await Promise.all([source('../src/public/premium-public.css'),source('../src/admin/CompetitionPages.tsx')]);
 assert.match(css,/body \.usd-live \.public-stage-detail img\.public-stage-poster/);
 assert.match(css,/aspect-ratio:auto !important;/);
 assert.match(css,/height:auto !important;/);
 assert.match(css,/background:transparent !important;/);
 assert.match(admin,/height:'auto',maxHeight:'none',aspectRatio:'auto'/);
});
