import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {groupVenueLiveRows,isVenueLiveSnapshotCurrent} from '../src/public/venue-live-model.ts';

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
