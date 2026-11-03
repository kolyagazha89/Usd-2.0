import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStageReport,stageReportStatusLabel} from '../src/admin/stage-report-model.ts';

const fixture={
 stage:{id:'stage1',name:'Тюмень · этап 1',status:'COMPLETED',date:'2026-08-11T10:00:00Z',resultsPublishedAt:'2026-08-12T12:00:00Z'},
 stats:{registrations:3,participants:2,cars:2,appearances:4,
  inspections:{passed:1,failed:1,pending:1},
  registrationClasses:[{class:{id:'a',name:'Limited 2.0',direction:{name:'SPL'}},registrations:2,participants:2,cars:2},
   {class:{id:'b',name:'Gate 1',direction:{name:'BFSPL'}},registrations:1,participants:1,cars:1}],
  pendingConfigurations:[{registrationId:'r1',participantNumber:2,participant:{lastName:'Иванов',firstName:'Иван'},car:{brand:'ВАЗ',model:'2107'}}],
  inspectionDetails:[{registrationId:'r2',status:'FAILED',participantNumber:3,participant:{lastName:'Петров',firstName:'Пётр'},notes:'Без крепления'}],
  pendingRegistrations:[{registrationId:'r3',participantNumber:4,participant:{lastName:'Сидоров'}}],
  classResults:[{class:{name:'Limited 2.0',direction:{name:'SPL'}},results:[
    {id:'a1',place:1,participantNumber:2,value:'153.2',unit:'DB',teamAtInspection:'Team A',participant:{lastName:'Иванов'},car:{brand:'ВАЗ',model:'2107'}},
    {id:'a2',place:2,participantNumber:3,value:'147.5',unit:'DB',teamAtInspection:null,participant:{lastName:'Петров',team:'Team B'}},
    {id:'a3',place:null,participantNumber:4,value:'145.1',unit:'DB'}
  ]}]
 }
};
test('published final report counts inspections, pending equipment, podiums and class directions',()=>{
 const x=buildStageReport(fixture);
 assert.equal(x.status,'PUBLISHED');assert.equal(stageReportStatusLabel(x.status),'Результаты опубликованы');
 assert.deepEqual(x.inspections,{passed:1,failed:1,pending:1,completed:2,percent:67});
 assert.equal(x.pendingConfigurations[0].participant,'Иванов Иван');
 assert.equal(x.inspectionProblems[0].reason,'Без крепления');
 assert.equal(x.pendingRegistrations[0].number,4);
 assert.equal(x.directions.length,2);assert.equal(x.directions.find(i=>i.direction==='SPL').registrations,2);
 assert.equal(x.podiums.length,2);assert.equal(x.podiums[0].unit,'дБ');
 assert.deepEqual(x.teams,[{name:'Team A',gold:1,silver:0,bronze:0}]);
 assert.ok(x.warnings.some(x=>x.includes('конфигурации')));
});
test('unpublished or still-live stages are never presented as final',()=>{
 let x=buildStageReport({...fixture,stage:{...fixture.stage,resultsPublishedAt:null}});
 assert.equal(x.status,'INTERNAL');assert.ok(x.warnings.some(x=>x.includes('не опубликованы')));
 x=buildStageReport({...fixture,stage:{...fixture.stage,status:'PUBLISHED'}});
 assert.equal(x.status,'DRAFT');
});
test('empty/unavailable stats stay safe and no team points are invented',()=>{
 const x=buildStageReport({stage:{status:'DRAFT'},stats:{}});
 assert.equal(x.inspections.percent,0);
 assert.deepEqual(x.podiums,[]);assert.deepEqual(x.teams,[]);
 assert.deepEqual(x.pendingConfigurations,[]);
 assert.equal(x.warnings.length,2);
});
test('podium medals use frozen inspection team, never current participant team',()=>{
 const x=buildStageReport(fixture);
 assert.equal(x.teams.find(t=>t.name==='Team B'),undefined);
 assert.equal(x.teams[0].gold,1);
 assert.ok(!('points' in x.teams[0]));
});
test('report routing and scoped print layout are present',async()=>{
 const {readFile}=await import('node:fs/promises');
 const [routes,shell,ui,css,qa]=await Promise.all([
  readFile(new URL('../src/admin/AdminRoutes.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/AdminShell.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/StageReportPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/stage-report.css',import.meta.url),'utf8'),
  readFile(new URL('../../scripts/candidate-browser-qa.mjs',import.meta.url),'utf8'),
 ]);
 assert.match(routes,/\/admin\/stage-report/);
 assert.match(shell,/Отчёты по этапам/);
 assert.match(ui,/\/statistics\/stages\//);
 assert.match(ui,/window\.print\(\)/);
 assert.match(ui,/pendingConfigurations/);
 assert.match(css,/@media print/);
 assert.match(css,/\.usd-stage-report-page/);
 assert.ok(qa.includes('/admin/stage-report?stageId=stage1'));
});
