import test from 'node:test';
import assert from 'node:assert/strict';
import {compareSeasonClasses} from '../src/admin/season-comparison.ts';

const direction=(name,classes)=>({id:name,name,classes:classes.map(([id,label,athletes])=>({id,name:label,athletes}))});

test('compare only class IDs with the same published class title and direction',()=>{
 const old={directions:[direction('SPL',[['limited','Limited 2.0',10],['wall','Wall',3]])]};
 const now={directions:[direction('SPL',[['limited','Limited 2.0',13],['wall','Wall+',5],['new','Mad-X',4]])]};
 const rows=compareSeasonClasses(old,now);
 assert.equal(rows.length,3);
 const limited=rows.find(x=>x.classId==='limited');
 assert.deepEqual({before:limited.baselineAthletes,after:limited.currentAthletes,change:limited.difference,percent:limited.percent},{before:10,after:13,change:3,percent:30});
 const renamed=rows.find(x=>x.classId==='wall');
 assert.equal(renamed.comparable,false);
 assert.equal(renamed.difference,null);
 assert.equal(renamed.percent,null);
 const created=rows.find(x=>x.classId==='new');
 assert.equal(created.baselineAthletes,null);
 assert.equal(created.comparable,false);
});
test('unavailable/zero-base seasons never invent percentage changes',()=>{
 const rows=compareSeasonClasses({directions:[direction('BFSPL',[['gate','Gate 1–6',0]])]},{directions:[direction('BFSPL',[['gate','Gate 1–6',2]])]});
 assert.equal(rows[0].difference,2);
 assert.equal(rows[0].percent,null);
 assert.deepEqual(compareSeasonClasses({directions:[]},{directions:[]}),[]);
});
test('direction changes make otherwise identical class IDs non-comparable',()=>{
 const old={directions:[direction('SPL',[['x','Test',2]])]};
 const now={directions:[direction('BDW SPL',[['x','Test',3]])]};
 const rows=compareSeasonClasses(old,now);
 assert.equal(rows[0].comparable,false);
 assert.equal(rows[0].difference,null);
});
