import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = path => readFile(new URL(path,import.meta.url),'utf8');

test('iOS member header pre-reserves safe-area height and can still grow for accessibility',async()=>{
 const [app,member,experience] = await Promise.all([
  source('../src/App.tsx'),
  source('../src/public/premium-member.css'),
  source('../src/participant/member-experience.css'),
 ]);
 assert.match(app,/headerRef=useHeaderSize\('--usd-member-header-size'\)/,
  'track dynamic growth for text zoom, without modifying the base height');
 assert.match(member,/--usd-member-header-min-size:calc\(72px \+ env\(safe-area-inset-top,0px\)\)/,
  'reserve the header minimum before any data or image has loaded');
 assert.match(member,/padding-top:var\(--usd-member-header-size,/);
 assert.match(experience,/height:auto!important/,
  'let the header grow beyond its default size when needed');
 assert.match(experience,/min-height:var\(--usd-member-header-min-size,[^;]+\)!important/,
  'the initial header height must match the reserved height');
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
