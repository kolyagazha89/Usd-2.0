import test from 'node:test';
import assert from 'node:assert/strict';
import {
 judgingInspectionStatus,judgingNumbers,canJudgeRegistration,matchesJudgeSearch,
 filterJudgeRegistrations,remainingJudgingClasses,judgingOverview,matchesJudgingResult,
 judgingResultLink,
} from '../src/admin/results-operations-model.ts';

const base={id:'reg1',status:'ACTIVE',participantNumber:7,numbers:[{number:7},{number:8}],
 participant:{lastName:'Семёнов',firstName:'Иван',team:{name:'TEAM SPL'}},
 car:{brand:'ВАЗ',model:'2107',registrationNumber:'А001УР001'},
 classes:[{id:'rc1',number:{number:7},class:{id:'c1',name:'Limited 2.0',direction:{name:'SPL'}}},
  {id:'rc2',number:{number:8},class:{id:'c2',name:'BassRace 139.9',direction:{name:'BassRace'}}}],
 stageInspection:{status:'PASSED'},inspection:{status:'FAILED'}};
test('shared stage inspection overrides stale vehicle inspection in judging eligibility',()=>{
 assert.equal(judgingInspectionStatus(base),'PASSED');
 assert.equal(canJudgeRegistration(base),true);
 assert.equal(judgingInspectionStatus({...base,stageInspection:{status:'FAILED'},inspection:{status:'PASSED'}}),'FAILED');
 assert.equal(canJudgeRegistration({...base,stageInspection:{status:'FAILED'},inspection:{status:'PASSED'}}),false);
 assert.equal(judgingInspectionStatus({...base,stageInspection:null,inspection:{status:'PASSED'}}),'PASSED');
 assert.equal(judgingInspectionStatus({...base,stageInspection:null,inspection:null}),'PENDING');
 assert.equal(canJudgeRegistration({...base,status:'CANCELLED'}),false);
});
test('search matches exact entry numbers, Ё/Е, plate, car, team, class and multi-word text',()=>{
 assert.deepEqual(judgingNumbers(base),[7,8]);
 for(const q of ['7','№8','семенов','Семёнов Иван','team spl','ваз 2107','А001УР001','a001yp001','BassRace','limited 2.0']){
  assert.equal(matchesJudgeSearch(base,q),true,q);
 }
 for(const q of ['1','17','№70','Camry','неизвестный Иван']){
  assert.equal(matchesJudgeSearch(base,q),false,q);
 }
});
test('filters only active admitted registrations for entering results',()=>{
 const others=[
 {...base,id:'reg2',participantNumber:9,stageInspection:{status:'FAILED'}},
 {...base,id:'reg3',participantNumber:10,stageInspection:null,inspection:null},
 {...base,id:'reg4',participantNumber:11,status:'CANCELLED'},
 ];
 assert.deepEqual(filterJudgeRegistrations([others[0],...others.slice(1),base],'',{passedOnly:true}).map(r=>r.id),['reg1']);
 assert.deepEqual(filterJudgeRegistrations([...others,base],'').map(r=>r.id),['reg1','reg2','reg3']);
 assert.deepEqual(filterJudgeRegistrations([...others,base],'№8').map(r=>r.id),['reg1']);
});
test('duplicate class results cannot be offered again and metrics are truthful',()=>{
 const results=[{id:'res1',registration:{id:'reg1'},registrationClassId:'rc1'}];
 assert.deepEqual(remainingJudgingClasses(base,results).map(c=>c.id),['rc2']);
 assert.deepEqual(remainingJudgingClasses(base,[...results,{id:'res2',registrationClass:{id:'rc2'},registrationId:'reg1'}]),[]);
 const summary=judgingOverview([base,{...base,id:'reg2',stageInspection:{status:'FAILED'}},{...base,id:'reg3',stageInspection:null,inspection:null}],results);
 assert.deepEqual(summary,{registrations:3,admitted:1,failed:1,awaiting:1,entered:1,remaining:1});
});
test('stage scoped deep link is safe with unicode, and result list searching uses current class',()=>{
 const stage='этап 4 / #';
 const id='reg?&+1';
 const link=judgingResultLink(stage,id);
 const parsed=new URL(link,'https://app.usd-russia.ru');
 assert.equal(parsed.pathname,'/admin/results');
 assert.equal(parsed.searchParams.get('stageId'),stage);
 assert.equal(parsed.searchParams.get('registrationId'),id);
 assert.equal(parsed.searchParams.get('entry'),'1');
 assert.equal(matchesJudgingResult({registration:base,registrationClass:base.classes[1]},'BassRace'),true);
});
test('connected 3-step desk, role checks and mobile CSS are kept',async()=>{
 const {readFile}=await import('node:fs/promises');
 const dir=new URL('../src/admin/',import.meta.url);
 const files=await Promise.all(['EventOperationsNavigation.tsx','ResultsPage.tsx','InspectionsPage.tsx','admin-shell-layout.css','AdminRoutes.tsx']
  .map(p=>readFile(new URL(p,dir),'utf8')));
 const [nav,page,inspection,css,routes]=files;
 assert.match(nav,/id:'results'/);
 assert.match(nav,/Одна площадка · три связанных рабочих раздела/);
 assert.match(nav,/step\.path\+'\?stageId='\+encodeURIComponent\(stageId\)/);
 assert.match(page,/EventOperationsNavigation current="results"/);
 assert.match(page,/judgingResultLink\(stageId/);
 assert.match(page,/remainingJudgingClasses\(/);
 assert.match(page,/filterJudgeRegistrations\(/);
 assert.match(page,/aria-label="Поиск результата"/);
 assert.match(inspection,/judgingResultLink\(stageId,registrationId\)/);
 assert.match(css,/repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.judging-entry-wizard/);
 assert.match(routes,/ResultsPage path=\{path\} go=\{go\}/);
});
