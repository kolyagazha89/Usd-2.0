import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildStageAttendanceReport} from '../src/admin/stage-attendance-report.ts';

const entry=(id,name='1x2',direction='SPL',number=1)=>({id,number:{number},class:{id:direction+name,name,direction:{id:direction,name:direction}}});
const reg=(id,person,source,classes,extra={})=>({id,stageId:'s',participantId:person,carId:'car-'+id,participantNumber:1,source,status:'ACTIVE',participant:{id:person,firstName:person},classes,results:[],...extra});
const result=(id,registrationClassId,value=0)=>({id,registrationClassId,value});
const passed={stageInspection:{status:'PASSED'}};
test('registration sources, unique people, cancellations and evidence of attendance are distinct',()=>{
 const rows=[
  reg('a','p1','PRE_REGISTRATION',[entry('a1'),entry('a2','139.9','BassRace',51)],{...passed,results:[result('m1','a1')]}),
  reg('b','p2','PRE_REGISTRATION',[entry('b1')]),
  reg('c','p3','ON_SITE',[entry('c1')]),
  reg('d','p1','PRE_REGISTRATION',[entry('d1')]),
  reg('e','p4','PRE_REGISTRATION',[entry('e1')],{stageInspection:{status:'FAILED',notes:'Причина'}}),
  reg('f','p5','PRE_REGISTRATION',[entry('f1')],{status:'CANCELLED'}),
  reg('g','p6','IMPORT',[entry('g1')]),
  reg('h','p7','PRE_REGISTRATION',[entry('h1')],{results:[result('m2','h1',150)]}),
 ];
 const r=buildStageAttendanceReport(rows,'s');
 assert.equal(r.total,8);assert.equal(r.active,7);assert.equal(r.people,6);assert.equal(r.cancelled,1);
 assert.deepEqual(r.sources.map(s=>[s.source,s.total,s.active,s.cancelled]),[['PRE_REGISTRATION',6,5,1],['ON_SITE',1,1,0],['IMPORT',1,1,0],['UNKNOWN',0,0,0]]);
 assert.deepEqual(r.unconfirmed.map(x=>x.id),['b','d']);
 assert.deepEqual(r.unconfirmedPeople.map(x=>x.id),['b'],'same person with other inspected car is not a missing person');
 assert.equal(r.inspected,2);assert.equal(r.passed,1);assert.equal(r.failed,1);assert.equal(r.pending,5);
 assert.equal(r.measured,2);assert.equal(r.missing,1);assert.equal(r.measuredWithoutAdmission,1);
 assert.deepEqual(r.missingRows.map(x=>[x.classId,x.number]),[['a2',51]]);
 assert.equal(r.registrations.find(x=>x.id==='e').reason,'Причина');
 assert.equal(r.classes.find(x=>x.name==='139.9').missing,1);
 assert.equal(r.directions.find(x=>x.name==='SPL').entries,7);
 assert.equal(r.complete,0);assert.equal(r.partial,1);assert.equal(r.noMeasurements,0);
});

test('completed, partial and zero measurements are counted per admitted registration, with no-class anomalies separate',()=>{
 const r=buildStageAttendanceReport([
  reg('a','p1','ON_SITE',[entry('a1')],{...passed,results:[result('a','a1'),result('duplicate','a1')]}),
  reg('b','p2','PRE_REGISTRATION',[entry('b1'),entry('b2','2x2')],{...passed,results:[result('b','b2')]}),
  reg('c','p3','PRE_REGISTRATION',[entry('c1')],passed),
  reg('d','p4','PRE_REGISTRATION',[],passed),
  reg('e','p5','PRE_REGISTRATION',[entry('e1')],{inspection:{status:'PASSED'},stageInspection:{status:'FAILED'}}),
  reg('outside','p6','ON_SITE',[entry('f1')],{...passed,stageId:'other'}),
 ],'s');
 assert.equal(r.total,5);assert.equal(r.complete,1);assert.equal(r.partial,1);assert.equal(r.noMeasurements,1);
 assert.equal(r.noClasses,1);assert.equal(r.measured,2);assert.equal(r.missing,2);
 assert.equal(r.missingRows.length,2);assert.equal(r.directions[0].entries,5);
 assert.equal(r.registrations.find(x=>x.id==='e').inspection,'FAILED');
});
test('missing or incomplete API rows cannot silently produce zero attendance',()=>{
 assert.throws(()=>buildStageAttendanceReport([{id:'x',stageId:'s',status:'ACTIVE',classes:[]}],'s'));
 assert.throws(()=>buildStageAttendanceReport([{id:'x',stageId:'s',status:'ACTIVE',classes:[],results:[]}],'s'));
 assert.equal(buildStageAttendanceReport([],'s').total,0);
});
test('existing report integrates attendance with stage-scoped loading and printable sections',async()=>{
 const page=await readFile(new URL('../src/admin/StageReportPage.tsx',import.meta.url),'utf8');
 assert.match(page,/\/registrations\?stageId=/);
 assert.match(page,/StageAttendanceReport/);
 assert.match(page,/buildStageAttendanceReport/);
 assert.match(page,/window\.print\(\)/);
 const report=await readFile(new URL('../src/admin/StageAttendanceReport.tsx',import.meta.url),'utf8');
 assert.match(report,/Неявка не подтверждена/);
 assert.match(report,/Без замера/);
});
