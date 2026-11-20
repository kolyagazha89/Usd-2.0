import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 groupJudgingResults,pendingJudgeRegistrations,
} from '../src/admin/results-operations-model.ts';

const stageInspection={status:'PASSED'};
const c1={id:'rc1',class:{id:'c1',name:'Limited 1',sortOrder:1,direction:{id:'spl',name:'SPL',sortOrder:1}}};
const c2={id:'rc2',class:{id:'c2',name:'Limited 2',sortOrder:2,direction:{id:'spl',name:'SPL',sortOrder:1}}};
const cb={id:'rcb',class:{id:'cb',name:'Front 1',sortOrder:1,direction:{id:'bfspl',name:'BFSPL',sortOrder:2}}};
const participant=(id,number,classes=[c1,c2])=>({
 id,participantNumber:number,status:'ACTIVE',stageInspection,
 participant:{firstName:'Иван',lastName:'Иванов'},classes,
});
const result=(id,registrationClass,place,number)=>({
 id,registrationClass,place,registration:participant('reg-'+id,number),
});

test('protocol is grouped by direction and sorted class -> recorded place -> participant number',()=>{
 const raw=[
  result('bfspl',cb,1,3),
  result('spl-unplaced',c1,null,1),
  result('spl-second-class',c2,1,5),
  result('spl-runner',c1,2,7),
  result('spl-winner',c1,1,8),
  result('spl-tie',c1,1,2),
 ];
 const originalIds=raw.map(r=>r.id);
 const groups=groupJudgingResults(raw);
 assert.deepEqual(groups.map(g=>g.name),['SPL','BFSPL']);
 assert.deepEqual(groups[0].rows.map(r=>r.id),['spl-tie','spl-winner','spl-runner','spl-unplaced','spl-second-class']);
 assert.deepEqual(groups[1].rows.map(r=>r.id),['bfspl']);
 assert.deepEqual(raw.map(r=>r.id),originalIds,'sorting never modifies API response');
});

test('same-named directions retain distinct identities and empty place is not first',()=>{
 const alt={id:'different-direction',name:'SPL',sortOrder:5};
 const grouped=groupJudgingResults([
  result('first',c1,'',4),
  result('second',{id:'rcx',class:{id:'cx',name:'Limited 1',direction:alt}},0,5),
  result('third',c1,3,6),
 ]);
 assert.equal(grouped.length,2);
 assert.deepEqual(grouped[0].rows.map(r=>r.id),['third','first']);
 assert.deepEqual(grouped[1].rows.map(r=>r.id),['second']);
});

test('missing class order and invalid or zero places never outrank official positions',()=>{
 const unrankedClass={id:'unranked',class:{id:'c99',name:'A Special',sortOrder:null,direction:{id:'spl',name:'SPL',sortOrder:1}}};
 const noDirectionOrder={id:'other',class:{id:'co',name:'Other',direction:{id:'other',name:'Other',sortOrder:null}}};
 const groups=groupJudgingResults([
  result('unranked-class',unrankedClass,1,1),
  result('zero-place',c1,0,2),
  result('no-place',c1,null,3),
  result('official',c1,2,4),
  result('unknown-direction',noDirectionOrder,1,5),
 ]);
 assert.deepEqual(groups.map(group=>group.name),['SPL','Other']);
 assert.deepEqual(groups[0].rows.map(row=>row.id),['official','zero-place','no-place','unranked-class']);
});

test('entry roster offers only admitted registrations with unmeasured classes',()=>{
 const seven=participant('reg7',7);
 const nine=participant('reg9',9,[c1]);
 const failed={...participant('reg10',10),stageInspection:{status:'FAILED'}};
 const rows=[failed,nine,seven];
 const completed=[{id:'saved',registrationId:'reg9',registrationClassId:'rc1'},
  {id:'saved-7',registrationId:'reg7',registrationClassId:'rc1'}];
 assert.deepEqual(pendingJudgeRegistrations(rows,completed,'').map(r=>r.id),['reg7']);
 assert.deepEqual(pendingJudgeRegistrations(rows,completed,'№7').map(r=>r.id),['reg7']);
 assert.deepEqual(pendingJudgeRegistrations(rows,completed,'№9'),[]);
 assert.deepEqual(pendingJudgeRegistrations(rows,[...completed,{id:'last',registrationId:'reg7',registrationClassId:'rc2'}],'').map(r=>r.id),[]);
});

test('judging list has one-tap search reset, keyboard row access and mobile measured-value hierarchy',async()=>{
 const source=await readFile(new URL('../src/admin/ResultsPage.tsx',import.meta.url),'utf8');
 const css=await readFile(new URL('../src/admin/admin-shell-layout.css',import.meta.url),'utf8');
 assert.match(source,/groupJudgingResults\(filteredResults\)/);
 assert.match(source,/pendingJudgeRegistrations\(registrations,results,term\)/);
 assert.match(source,/aria-label="Очистить поиск результатов"/);
 assert.match(source,/aria-label="Сбросить фильтры результатов"/);
 assert.match(source,/aria-label=\{'Открыть результат/);
 assert.match(source,/onKeyDown=\{e=>\{if\(e\.target===e\.currentTarget/);
 assert.match(css,/\.judging-result-search-clear/);
 assert.match(css,/\.judging-results-table tbody td\[data-label="Результат"\]/);
 assert.match(css,/env\(safe-area-inset-bottom/);
 assert.match(css,/@media\(min-width:761px\) and \(max-width:1200px\)/);
 assert.match(css,/judging-toolbar>\.judging-search\{[\s\S]*?flex:1 1 100%!important/,'search and filter must not overlap on a 1024px tablet');
});

test('paging a protocol retains direction order and the recorded places across boundaries',async()=>{
 const {paginateResourceRows}=await import('../src/admin/admin-table-model.ts');
 const raw=Array.from({length:23},(_,i)=>result('r'+i,i<12?c1:cb,i+1,i+1)).reverse();
 const ordered=groupJudgingResults(raw).flatMap(group=>group.rows);
 const pages=[1,2,3].map(page=>paginateResourceRows(ordered,page,10).rows);
 assert.deepEqual(pages.flat().map(r=>r.id),ordered.map(r=>r.id));
 assert.equal(pages[1][0].place,11,'page two must not restart official places');
 assert.equal(pages[2].length,3);
});
