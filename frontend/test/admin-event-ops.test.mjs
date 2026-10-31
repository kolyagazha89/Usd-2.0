import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  operationsSearchText,matchesOperationsSearch,
  summarizeRegistrations,filterRegistrations,
  summarizeInspections,filterInspections,isPendingInspection,
} from '../src/admin/event-ops-model.ts';

const rows=[
 {id:'a',status:'ACTIVE',participantNumber:2,numbers:[{number:18}],
  participant:{lastName:'Иванов',firstName:'Иван',team:{name:'DEAF BONCE'}},
  car:{brand:'ВАЗ',model:'2107',registrationNumber:'А001УР001'},
  classes:[{class:{name:'Limited 2.0',direction:{name:'SPL'}},number:{number:18}}],
  inspection:{status:'PASSED'}},
 {id:'b',status:'ACTIVE',participantNumber:3,
  participant:{lastName:'Петров',firstName:'Пётр'},
  car:{brand:'Toyota',model:'Camry'},classes:[],stageInspection:{status:'FAILED'}},
 {id:'c',status:'CANCELLED',participantNumber:4,
  participant:{lastName:'Сидоров',firstName:'Сергей'},
  car:{brand:'Lada',model:'Granta'},classes:[],inspection:null},
 {id:'d',status:'ACTIVE',participantNumber:5,
  participant:{lastName:'Семенов',firstName:'Семён'},
  car:{brand:'Hyundai',model:'Solaris'},classes:[],inspection:{status:'PENDING'}},
];

test('registration totals always represent all statuses even when list is filtered',()=>{
 assert.deepEqual(summarizeRegistrations(rows),{total:4,active:3,cancelled:1});
 assert.deepEqual(filterRegistrations(rows,'ACTIVE','').map(r=>r.id),['a','b','d']);
 assert.deepEqual(filterRegistrations(rows,'CANCELLED','').map(r=>r.id),['c']);
 assert.deepEqual(filterRegistrations(rows,'ALL','').map(r=>r.id),['a','b','c','d']);
 assert.deepEqual(filterRegistrations(rows,'ACTIVE','',true).map(r=>r.id),['a','b','c','d']);
});

test('operations search supports name, class, team, car plate, stage number and multi-term queries',()=>{
 assert.match(operationsSearchText(rows[0]),/limited 2\.0/);
 for(const q of ['ИВАН','Иванов 18','А001УР001','DEAF BONCE','SPL 2107','limited 2.0']) {
  assert.deepEqual(filterRegistrations(rows,'ALL',q).map(r=>r.id),['a'],q);
 }
 assert.deepEqual(filterRegistrations(rows,'ALL','семен').map(r=>r.id),['d']);
 assert.equal(matchesOperationsSearch(rows[1],'петр тойота'),false);
 assert.equal(matchesOperationsSearch(rows[1],'пётр camry'),true);
 assert.equal(matchesOperationsSearch(rows[1],'петр camry'),true);
 assert.deepEqual(filterRegistrations(rows,'ALL','не найдено'),[]);
});

test('inspection counters and real queue filters never mistake failed for pending',()=>{
 assert.deepEqual(summarizeInspections(rows),{total:4,passed:1,failed:1,pending:2});
 assert.deepEqual(filterInspections(rows,'PASSED','').map(r=>r.id),['a']);
 assert.deepEqual(filterInspections(rows,'FAILED','').map(r=>r.id),['b']);
 assert.deepEqual(filterInspections(rows,'PENDING','').map(r=>r.id),['c','d']);
 assert.deepEqual(filterInspections(rows,'PENDING','Семён').map(r=>r.id),['d']);
 assert.equal(isPendingInspection(rows[0]),false);
 assert.equal(isPendingInspection(rows[1]),false);
 assert.equal(isPendingInspection(rows[2]),true);
});

test('operations UI preserves stage deep links and real mobile width',async()=>{
 const [registration,inspection,primitives,css]=await Promise.all([
  readFile(new URL('../src/admin/RegistrationsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/InspectionsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/AdminPrimitives.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/ui-consistency.css',import.meta.url),'utf8'),
 ]);
 assert.match(registration,/filterRegistrations\(/);
 assert.match(inspection,/filterInspections\(/);
 assert.match(registration,/\/registrations\?stageId='/);
 assert.doesNotMatch(registration,/status=ALL/,'the backend only accepts ACTIVE or CANCELLED, omit status to fetch all');
 assert.match(inspection,/value="PENDING">Ожидают/);
 assert.match(primitives,/className=\{\['page',className\]/);
 assert.match(css,/\.page\.event-ops-page/);
 assert.match(css,/\.event-ops-results \.data-table/);
});
