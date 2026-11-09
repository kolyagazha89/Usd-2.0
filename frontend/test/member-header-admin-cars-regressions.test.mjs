import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = path => readFile(new URL(path,import.meta.url),'utf8');

test('iOS member header reserves the same fixed safe-area height before the first paint',async()=>{
 const [app,member,experience] = await Promise.all([
  source('../src/App.tsx'),
  source('../src/public/premium-member.css'),
  source('../src/participant/member-experience.css'),
 ]);
 assert.doesNotMatch(app,/headerRef=useHeaderSize\('--usd-member-header-size'\)/,
  'measuring after mounting causes the first-load header jump');
 assert.match(member,/--usd-member-header-size:calc\(72px \+ env\(safe-area-inset-top,0px\)\)/,
  'reserve the height before any data or image has loaded');
 assert.match(member,/padding-top:var\(--usd-member-header-size,/);
 assert.match(experience,/height:var\(--usd-member-header-size,[^;]+\)!important/,
  'rendered mobile header must use exactly its pre-reserved height');
 assert.match(experience,/min-height:0!important/);
});

test('admin car configuration uses the existing admin topbar, not a second dark member header',async()=>{
 const src=await source('../src/admin/ConfigurationsPage.tsx');
 assert.match(src,/admin-configurations-shell/);
 assert.doesNotMatch(src,/admin&&<header className="participant-portal-header"/);
 assert.match(src,/onBack=\{\(\)=>go\(backPath\)\}/,
  'the back-to-cars action must still work');
});

test('last-loaded admin theme explicitly owns car list and configuration surfaces',async()=>{
 const [theme,entry,cars] = await Promise.all([
  source('../src/admin/admin-shell-layout.css'),
  source('../src/main.tsx'),
  source('../src/admin/CarsPage.tsx'),
 ]);
 assert.equal([...entry.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)].at(-1)?.[1],
  './admin/admin-shell-layout.css');
 assert.match(cars,/usd-admin-cars-list/);
 for(const name of ['admin-configurations-shell','configurations-page-top','config-card',
  'config-section','configuration-subpage-header','config-editor-actions',
  'config-details-hero','config-admin-steps','config-direction-workspace']){
  assert.ok(theme.includes(name),'admin theme missing '+name);
 }
 assert.match(theme,/body \.app-shell \.main \.content \.admin-configurations-shell/);
 assert.match(theme,/color-scheme:light/);
 assert.match(theme,/\.usd-admin-cars-list/);
 assert.match(theme,/background:#fff!important/);
});
