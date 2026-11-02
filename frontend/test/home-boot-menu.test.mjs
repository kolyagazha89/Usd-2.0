import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('initial USD splash persists until all home data matches the current site snapshot',async()=>{
 const app=await source('../src/App.tsx');
 assert.match(app,/winnersReady\?\.stages!==stages/);
 assert.match(app,/winnersReady\?\.settings!==settings/);
 assert.match(app,/liveReady\?\.stages!==stages/);
 assert.match(app,/liveReady\?\.settings!==settings/);
 assert.match(app,/peopleReady!==settings/);
 assert.match(app,/!brandReady\|\|loading/);
 assert.match(app,/setHomeMinDelayPassed\(true\),650/);
 assert.match(app,/className="usd-home-boot-overlay"/);
 assert.match(app,/<Splash fixedLogo\/>/);
 assert.match(app,/className=\{"p-home-main"\+/);
 assert.doesNotMatch(app,/if\(page==='home'&&\(!homeReady/);
 // Do not use a stale completion flag from the empty initial stage list.
 assert.match(app,/const completed=\(\)=>setWinnersReady\(\{stages,settings\}\)/);
 assert.match(app,/const completed=\(\)=>setLiveReady\(\{stages,settings\}\)/);
 assert.match(app,/const completed=\(\)=>setPeopleReady\(settings\)/);
});

test('mobile dropdown remains compact and scrim stays above content below header',async()=>{
 const [nav,css]=await Promise.all([
  source('../src/navigation/PublicNavigation.tsx'),
  source('../src/dark-velocity-sitewide.css'),
 ]);
 assert.match(nav,/nav\.current\?\.closest\('\.usd-live'\)\?\?document\.body/);
 assert.match(css,/width:min\(340px,calc\(100vw - 32px\)\)!important/);
 assert.match(css,/max-height:min\(70dvh,650px\)!important/);
 assert.match(css,/overflow-y:auto!important/);
 assert.match(css,/justify-content:flex-start!important/);
 assert.match(css,/\.usd-home-boot-overlay\{/);
 assert.match(css,/position:fixed;inset:0;z-index:1000/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
