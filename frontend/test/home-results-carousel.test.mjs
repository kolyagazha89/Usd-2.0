import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {groupLiveByClass,otherHomepageRecords,resultEntryNumber} from '../src/public/home-results-model.ts';

const sample=(id,cls,place,value,number)=>({
 id,place,value,
 registration:{participantNumber:number,participant:{firstName:'Иван',lastName:'Тестов',photoUrl:'/portrait.webp'}},
 registrationClass:{class:cls,number:{number}},
});
const gate={id:'gate',name:'Wicket 6-10',unit:'DB',sortOrder:3,direction:{name:'BFSPL',sortOrder:2}};
const limited={id:'limited',name:'Limited 2.0',unit:'DB',sortOrder:1,direction:{name:'SPL',sortOrder:1}};

test('LIVE groups every participant by actual class and ranks every result within that class',()=>{
 const entries=[
  sample('w2',gate,2,113,22),sample('s3',limited,3,139,33),
  sample('w1',gate,1,115.87,21),sample('s1',limited,1,160,11),
  sample('s2',limited,2,149,12),sample('s4',limited,4,132,34),
 ];
 const groups=groupLiveByClass(entries);
 assert.deepEqual(groups.map(g=>g.name),['Limited 2.0','Wicket 6-10']);
 assert.deepEqual(groups.map(g=>g.rows.map(r=>r.id)),[['s1','s2','s3','s4'],['w1','w2']]);
 assert.equal(groups.reduce((total,g)=>total+g.rows.length,0),entries.length,'no result may be truncated');
 assert.equal(resultEntryNumber(entries[2]),21);
 assert.equal(resultEntryNumber({registration:{participantNumber:5}}),5);
 assert.equal(resultEntryNumber({registration:{participantNumber:null}}),null);
});

test('record minis rotate only eligible dB records and never show the hero again',()=>{
 const record=(id,name,direction,value)=>({id,value,class:{id,name,unit:'DB',direction:{name:direction,sortOrder:1}}});
 const rows=[
  record('hero','Unlimited','SPL',180),
  record('one','Limited 2.0','SPL',165),
  record('two','Gate 1-6','BFSPL',164),
  record('three','Gate 6-10','BFSPL',163),
  record('four','Wicket 10+','BFSPL',162),
  record('bass','BassRace 139.9','BassRace',190),
  {...record('storm','Storm Wall','Storm Wall',191),unit:'MPS'},
 ];
 const others=otherHomepageRecords(rows,'hero');
 assert.deepEqual(new Set(others.map(r=>r.id)),new Set(['one','two','three','four']));
 assert.ok(!others.some(r=>r.id==='hero'));
});

test('homepage loads all stage results; class and record carousel both have manual controls',async()=>{
 const [app,home,scoreboards,member,css]=await Promise.all([
  readFile(new URL('../src/App.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/public/PremiumHome.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/public/HomeScoreboards.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/participant/MemberDashboard.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/public/home-results.css',import.meta.url),'utf8'),
 ]);
 assert.match(home,/<LiveClassCarousel rows=\{liveRows\}/);
 assert.match(home,/<RecordMinis rows=\{records\}/);
 assert.doesNotMatch(app,/results\/stage\/'\+encodeURIComponent\(stage.id\)\)\)\.slice\(0,8\)/);
 assert.match(scoreboards,/aria-label="Следующий класс"/);
 assert.match(scoreboards,/aria-label="Предыдущие рекорды"/);
 assert.match(scoreboards,/src=\{participant\?\.photoUrl\}/);
 assert.match(scoreboards,/resultEntryNumber\(row\)/);
 assert.match(scoreboards,/cls.name\|\|'Класс не указан'/);
 assert.match(member,/member-result-place/);
 assert.match(member,/publicResultValue\(r.value\)/);
 assert.match(css,/max-height:540px/);
});
