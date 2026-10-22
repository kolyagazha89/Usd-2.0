import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('homepage provides visible, editable video and LIVE scoreboard space even without live results',async()=>{
 const [home,admin,css]=await Promise.all([
  source('../src/public/PremiumHome.tsx'),
  source('../src/admin/SiteSettingsPage.tsx'),
  source('../src/public/premium-public.css')]);
 assert.match(home,/usd-broadcast-center/);
 assert.match(home,/usd-broadcast-player/);
 assert.match(home,/usd-broadcast-results/);
 assert.match(home,/usd-broadcast-standby/);
 assert.match(home,/usd-broadcast-empty/);
 assert.match(home,/liveStage=stages\.find/);
 assert.match(home,/liveRows\.slice\(0,5\)/);
 assert.doesNotMatch(home,/settings\.liveResults\?\.enabled!==false&&liveResults\.length>0&&<section/);
 assert.match(admin,/Медиацентр USD LIVE/);
 assert.match(admin,/showLiveStream:e\.target\.checked/);
 assert.match(admin,/showLiveResults:e\.target\.checked/);
 assert.match(admin,/setTab\('stream'\)/);
 assert.match(admin,/setTab\('live'\)/);
 assert.match(css,/usd-broadcast-grid/);
 assert.match(css,/@media\(max-width:980px\)/);
 assert.match(css,/homepage-live-editor-grid/);
});
