import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {groupVenueLiveRows,isVenueLiveSnapshotCurrent,venueLiveDirectionScreen,venueLiveRowsPerScreen,buildVenueTvSlides,parseVenueTvMode} from '../src/public/venue-live-model.ts';

const row=(id,place,value,cls='Limited 2.0',direction='SPL')=>({
 id,place,value,number:10,unit:'DB',participant:'Иванов',car:'Lada',
 class:{id:cls,name:cls,sortOrder:1,direction:{name:direction,sortOrder:1}},
});

test('LAN live scoreboard groups classes, ranks places, then unranked measurements',()=>{
 const groups=groupVenueLiveRows([
  row('1',2,'141'),row('2',null,'145'),row('3',1,'150'),
  row('4',null,'147'),row('5',1,'132','Gate 1','BFSPL')
 ]);
 assert.deepEqual(groups.map(g=>g.name),['Gate 1','Limited 2.0'].sort((a,b)=>a.localeCompare(b,'ru')));
 const spl=groups.find(g=>g.name==='Limited 2.0');
 assert.deepEqual(spl.rows.map(r=>r.id),['3','1','4','2']);
});
test('empty or duplicate results do not invent another stage or scoreboard entry',()=>{
 assert.deepEqual(groupVenueLiveRows([]),[]);
 assert.deepEqual(groupVenueLiveRows([row('1',1,'150'),row('1',1,'150')])[0].rows.map(r=>r.id),['1']);
});
test('stale local data stays displayed with an explicit disconnected state',()=>{
 const now=Date.parse('2026-11-11T12:00:00Z');
 assert.equal(isVenueLiveSnapshotCurrent(now-4000,now),true);
 assert.equal(isVenueLiveSnapshotCurrent(now-15000,now),false);
 assert.equal(isVenueLiveSnapshotCurrent(null,now),false);
});
test('live screen is a venue-only URL and uses the local API, never the public Internet',async()=>{
 const [app,component,css]=await Promise.all([
  readFile(new URL('../src/App.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/public/VenueLiveResults.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/public/venue-live.css',import.meta.url),'utf8'),
 ]);
 assert.match(app,/path\.split\('\?'\)\[0\]==='\/venue\/live'/);
 assert.match(app,/__USD_VENUE_MODE__/);
 assert.match(component,/apiGet<VenueLiveSnapshot>\('\/results\/venue-live'\)/);
 assert.match(component,/setInterval/);
 assert.match(component,/Сохранены результаты площадки/);
 assert.match(component,/Нет соединения с локальным сервером/);
 assert.match(css,/@media\s*\(max-width:\s*600px\)/);
 assert.doesNotMatch(component,/https?:\/\//);
});

test('TV directions show SPL separately from BFSPL and BDW SPL, never mixing BassRace',()=>{
 assert.equal(venueLiveDirectionScreen('SPL'),'spl');
 assert.equal(venueLiveDirectionScreen('BF SPL'),'bfspl-bdw');
 assert.equal(venueLiveDirectionScreen('BFSPL'),'bfspl-bdw');
 assert.equal(venueLiveDirectionScreen('BDW SPL'),'bfspl-bdw');
 assert.equal(venueLiveDirectionScreen('bdw-spl'),'bfspl-bdw');
 assert.equal(venueLiveDirectionScreen('BassRace'),null);
 assert.equal(venueLiveDirectionScreen('Storm Wall'),null);
 assert.equal(parseVenueTvMode('spl'),'spl');
 assert.equal(parseVenueTvMode('bfspl-bdw'),'bfspl-bdw');
 assert.equal(parseVenueTvMode('random'),'all');
});
test('TV rotates ordered classes and paginates within fixed-height display without hiding results',()=>{
 const results=[
  ...Array.from({length:15},(_,i)=>row('spl-'+i,i+1,String(160-i),'Limited 2.0','SPL')),
  row('gate1',1,'150','Gate 1','BFSPL'),
  row('gate2',2,'148','Gate 2','BFSPL'),
  row('bdw',1,'146','BDW SPL','BDW SPL'),
  row('bassrace',1,'139','139.9','BassRace'),
 ];
 const slides=buildVenueTvSlides(groupVenueLiveRows(results),6);
 assert.deepEqual(slides.map(s=>s.screen),['spl','spl','spl','bfspl-bdw','bfspl-bdw','bfspl-bdw']);
 assert.deepEqual(slides.filter(s=>s.screen==='spl').map(s=>s.rows.length),[6,6,3]);
 assert.deepEqual(slides.filter(s=>s.screen==='spl').map(s=>s.page),[1,2,3]);
 assert.deepEqual(slides.filter(s=>s.screen==='spl').map(s=>s.pages),[3,3,3]);
 assert.equal(slides.flatMap(s=>s.rows).length,18);
 assert.deepEqual(slides.filter(s=>s.screen==='spl').flatMap(s=>s.rows).map(r=>r.id),
  Array.from({length:15},(_,i)=>'spl-'+i));
 assert.equal(slides.some(s=>s.rows.some(r=>r.id==='bassrace')),false);
 assert.deepEqual(buildVenueTvSlides(groupVenueLiveRows(results),6,'spl').map(s=>s.screen),['spl','spl','spl']);
 assert.deepEqual(buildVenueTvSlides(groupVenueLiveRows(results),6,'bfspl-bdw').map(s=>s.screen),['bfspl-bdw','bfspl-bdw','bfspl-bdw']);
});
test('TV always has exactly two direction screens even before the first measurement',()=>{
 const slides=buildVenueTvSlides([],7);
 assert.deepEqual(slides.map(x=>x.screen),['spl','bfspl-bdw']);
 assert.deepEqual(slides.map(x=>x.group),[null,null]);
 assert.deepEqual(buildVenueTvSlides([],7,'spl').map(x=>x.screen),['spl']);
 assert.equal(buildVenueTvSlides(groupVenueLiveRows([row('s',1,'153')]),4,'bfspl-bdw')[0].group,null);
});
test('TV row pagination adapts to 720p and 1080p and never returns zero rows',()=>{
 assert.ok(venueLiveRowsPerScreen(1080,1920)>venueLiveRowsPerScreen(720,1280));
 assert.ok(venueLiveRowsPerScreen(720,1280)<=7);
 assert.ok(venueLiveRowsPerScreen(1080,1920)<=10);
 assert.ok(venueLiveRowsPerScreen(360,320)>=1);
});
test('TV page has direction selector, class rotation, pause and fullscreen with no viewport scrolling',async()=>{
 const [component,css]=await Promise.all([
  readFile(new URL('../src/public/VenueLiveResults.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/public/venue-live.css',import.meta.url),'utf8'),
 ]);
 assert.match(component,/buildVenueTvSlides/);
 assert.match(component,/setInterval/);
 assert.match(component,/TV_ROTATE_MS/);
 assert.match(component,/screen=spl/);
 assert.match(component,/screen=bfspl-bdw/);
 assert.match(component,/requestFullscreen/);
 assert.match(component,/setPaused/);
 assert.match(css,/height:100dvh/);
 assert.match(css,/overflow:hidden/);
 assert.match(css,/minmax\(0,1fr\)/);
 assert.match(css,/text-overflow:ellipsis/);
});

test('spectator TV cannot show cookie banners or activate push workers',async()=>{
 const entry=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');
 assert.match(entry,/const venueTv=/);
 assert.match(entry,/!venueTv&&<CookieNotice\/>/);
 assert.match(entry,/!venueTv&&<VelocityEffects\/>/);
 assert.match(entry,/if\(!venueTv\)/);
});
