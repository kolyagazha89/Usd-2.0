import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {groupPendingMeasurements,judgingOverview} from '../src/admin/results-operations-model.ts';

const direction=(id,name,sortOrder)=>({id,name,sortOrder});
const spl=direction('spl','SPL',1), bass=direction('bass','BassRace',3);
const entry=(id,name,dir,number,sortOrder=1)=>({id,number:{number},class:{id:name,name,sortOrder,direction:dir}});
const reg=(id,number,classes,extra={})=>({id,status:'ACTIVE',participantNumber:number,stageInspection:{status:'PASSED'},participant:{lastName:'Тестов',firstName:id},classes,...extra});
const saved=(registrationId,registrationClassId,value=0)=>({registrationId,registrationClassId,value});

test('pending measurements contain only admitted active classes without a saved measurement',()=>{
 const rows=[
  reg('a',7,[entry('a1','1x2',spl,7),entry('a2','2x2',spl,7,2),entry('a3','139.9',bass,51),entry('a4','129.9',bass,52)]),
  reg('b',2,[entry('b1','1x2',spl,2)]),
  reg('c',9,[entry('c1','1x2',spl,9)],{stageInspection:{status:'FAILED'}}),
  reg('d',10,[entry('d1','1x2',spl,10)],{stageInspection:null}),
  reg('e',11,[entry('e1','1x2',spl,11)],{status:'CANCELLED'}),
 ];
 const results=[saved('a','a2'),saved('a','a3',139.9),saved('other','a1',123)];
 const groups=groupPendingMeasurements(rows,results);
 assert.deepEqual(groups.map(g=>g.name),['SPL','BassRace']);
 assert.deepEqual(groups.map(g=>g.rows.map(r=>[r.registration.id,r.registrationClass.id,r.registrationClass.number.number])),[
  [['b','b1',2],['a','a1',7]],[['a','a4',52]],
 ]);
 assert.equal(groups.flatMap(g=>g.rows).length,judgingOverview(rows,results).remaining);
 assert.deepEqual(groupPendingMeasurements(rows,[...results,saved('a','a1'),saved('b','b1'),saved('a','a4')]),[]);
});

test('pending list retains distinct class entries even if the same participant has multiple cars or class numbers',()=>{
 const a=reg('a',4,[entry('a1','1x2',spl,4),entry('a2','2x2',spl,4,2)]);
 const b=reg('b',5,[entry('b1','1x2',spl,5)],{participant:a.participant});
 const grouped=groupPendingMeasurements([b,a],[]);
 assert.deepEqual(grouped[0].rows.map(r=>r.registrationClass.id),['a1','b1','a2']);
 assert.equal(grouped[0].rows.length,3);
 assert.deepEqual(a.classes.map(c=>c.id),['a1','a2']);
});

test('results actions expose the stage-wide pending list and do not confuse failed loading with zero pending',async()=>{
 const page=await readFile(new URL('../src/admin/ResultsPage.tsx',import.meta.url),'utf8');
 assert.match(page,/<EventOperationsActions viewKey="results">[\s\S]*?Не выехали на замер[\s\S]*?<\/EventOperationsActions>/);
 assert.match(page,/groupPendingMeasurements\(registrations,results\)/);
 assert.match(page,/pendingOpen&&/);
 assert.match(page,/!pendingReady/);
 assert.match(page,/setPendingReady\(true\)/);
});
