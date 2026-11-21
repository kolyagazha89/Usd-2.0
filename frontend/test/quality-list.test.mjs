import test from 'node:test';
import assert from 'node:assert/strict';
import {qualityIssueKey,qualityRows} from '../src/admin/quality-list.ts';
import {paginateResourceRows} from '../src/admin/admin-table-model.ts';
test('hidden issue identities survive earlier hidden rows, searching and page boundaries',()=>{
 const issues=Array.from({length:32},(_,i)=>({code:'RULE',entity:'Car',entityId:'car'+i,message:'Проблема '+i,severity:i%2?'WARNING':'ERROR'}));
 const hidden=[qualityIssueKey(issues[0],0),qualityIssueKey(issues[11],11)];
 const visible=qualityRows(issues,hidden,false,'','ALL');
 assert.equal(visible.length,30);assert.equal(visible[0].key,qualityIssueKey(issues[1],1));
 const all=qualityRows(issues,hidden,true,'','ALL');
 assert.equal(paginateResourceRows(all,2,10).rows[1].key,hidden[1]);
 assert.equal(qualityRows(issues,hidden,true,'Проблема 11','WARNING')[0].key,hidden[1]);
 assert.equal(qualityRows(issues,hidden,false,'Проблема 11','WARNING').length,0);
 assert.equal(qualityRows(issues,hidden.filter(k=>k!==hidden[1]),false,'Проблема 11','WARNING').length,1);
});
