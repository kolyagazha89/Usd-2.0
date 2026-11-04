import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {discoverPublishedResults} from '../src/public/discover-results.ts';
const stage=(id,date,extras={})=>({id,status:'COMPLETED',resultsPublishedAt:'2026-11-01T10:00:00Z',isDeleted:false,date,...extras});
test('loads latest available stage in original date order, even if an older request finishes first',async()=>{
 const stages=[stage('old','2025-04-01'),stage('new','2026-03-03'),stage('mid','2026-01-03')];
 const calls=[];
 const found=await discoverPublishedResults(stages,async id=>{calls.push(id);return id==='new'?[{id:'r'}]:id==='mid'?[{id:'older'}]:[]});
 assert.equal(found.stageId,'new');assert.equal(found.checked,3);
 assert.deepEqual(calls,['new','mid','old']);
});
test('skips unpublished, archived and invalid stages and checks older batches',async()=>{
 const list=[stage('draft','2028-01-01',{status:'DRAFT'}),stage('removed','2028-01-01',{isDeleted:true}),stage('old','2025-01-01'),stage('new','2026-01-01')];
 const checked=[];
 const outcome=await discoverPublishedResults(list,async id=>{checked.push(id);return id==='old'?[{}]:[]},1);
 assert.deepEqual(checked,['new','old']);assert.equal(outcome.stageId,'old');assert.equal(outcome.publishedCount,2);
});
test('API failures are reported distinctly from genuinely empty results',async()=>{
 const list=[stage('new','2026-01-01'),stage('old','2025-01-01')];
 const failed=await discoverPublishedResults(list,async id=>{if(id==='new')throw Error('503');return []});
 assert.deepEqual(failed,{stageId:null,failedIds:['new'],checked:2,publishedCount:2});
 const empty=await discoverPublishedResults(list,async()=>[]);
 assert.deepEqual(empty.failedIds,[]);assert.equal(empty.stageId,null);
});
test('parallel requests are limited to a bounded group and never flood the endpoint',async()=>{
 const stages=Array.from({length:19},(_,i)=>stage('stage'+i,'2026-01-'+String(31-i).padStart(2,'0')));
 let active=0,peak=0;
 const result=await discoverPublishedResults(stages,async()=>{active++;peak=Math.max(peak,active);
  await Promise.resolve();active--;return []},3);
 assert.equal(result.checked,19);assert.ok(peak<=3);
 await assert.rejects(discoverPublishedResults(stages,async()=>[],100),/batch size/);
});
test('public results page exposes loading, error retry and ready state for browser QA',async()=>{
 const source=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
 assert.match(source,/data-results-state=/);
 assert.match(source,/Ищем последние опубликованные результаты/);
 assert.match(source,/Повторить загрузку результатов/);
 assert.match(source,/setResultsFetchError\(true\)/);
 assert.doesNotMatch(source,/if\(page!=='results'\|\|!autoDiscoverResults[^;]*for\(const stage of candidates\)/);
});
