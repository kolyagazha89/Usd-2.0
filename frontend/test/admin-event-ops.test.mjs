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
 assert.deepEqual(filterRegistrations(rows,'ALL','А001-УР 001').map(r=>r.id),['a']);
 assert.equal(matchesOperationsSearch(rows[1],'петр тойота'),false);
 assert.equal(matchesOperationsSearch(rows[1],'пётр camry'),true);
 assert.equal(matchesOperationsSearch(rows[1],'петр camry'),true);
 assert.deepEqual(filterRegistrations(rows,'ALL','не найдено'),[]);
});

test('inspection counters and real queue filters never mistake failed for pending',()=>{
 assert.deepEqual(summarizeInspections(rows),{total:4,passed:1,failed:1,pending:1});
 assert.deepEqual(filterInspections(rows,'PASSED','').map(r=>r.id),['a']);
 assert.deepEqual(filterInspections(rows,'FAILED','').map(r=>r.id),['b']);
 assert.deepEqual(filterInspections(rows,'PENDING','').map(r=>r.id),['d']);
 assert.deepEqual(filterInspections(rows,'PENDING','Семён').map(r=>r.id),['d']);
 assert.equal(isPendingInspection(rows[0]),false);
 assert.equal(isPendingInspection(rows[1]),false);
 assert.equal(isPendingInspection(rows[2]),false);
 const cancelledPassed={status:'CANCELLED',inspection:{status:'PASSED'}};
 const cancelledFailed={status:'CANCELLED',inspection:{status:'FAILED'}};
 assert.equal(summarizeInspections([...rows,cancelledFailed]).failed,1);
 assert.deepEqual(filterInspections([...rows,cancelledFailed],'FAILED','').map(r=>r.id),['b']);
 assert.equal(summarizeInspections([...rows,cancelledPassed]).passed,1);
 assert.equal(filterInspections([...rows,cancelledPassed],'PASSED','').length,1);
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

test('event-day layouts fill their content pane and navigation stays graphite/red',async()=>{
 const [css,layout,shell,inspection]=await Promise.all([
  readFile(new URL('../src/dark-velocity-sitewide.css',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/admin-shell-layout.css',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/AdminShell.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/InspectionsPage.tsx',import.meta.url),'utf8'),
 ]);
 assert.doesNotMatch(css,/body \.app-shell/,'public Dark Velocity cannot own admin event workspace');
 assert.match(layout,/\.page\.event-ops-page/,'event workspace width belongs to admin owner');
 assert.match(layout,/padding: 0 !important;/,'event pages must not double-inset at mobile/tablet breakpoints');
 assert.match(layout,/scrollbar-gutter:stable/,'sidebar scrollbar uses one stable layout');
 assert.match(layout,/scrollbar-color:#56565e transparent/,'dark neutral scrollbar replaces blue-gray');
 assert.match(layout,/\.sidebar \.nav-item\[aria-current="page"\]/,'active navigation has a distinct dark red state');
 assert.match(layout,/\.sidebar :is\(\.nav-item,\.sidebar-section-toggle/,'keyboard focus is explicitly accessible');
 assert.match(shell,/aria-current=\{active\?'page':undefined\}/,'active route is announced');
 assert.match(inspection,/classIds\.length>5/,'inspection editor enforces API class limit');
 assert.match(inspection,/не более 5 классов/,'inspection editor explains the maximum');
});

test('admitted list is displayed in app without CSV export',async()=>{
 const inspection=await readFile(new URL('../src/admin/InspectionsPage.tsx',import.meta.url),'utf8');
 assert.match(inspection,/Итоговый список допущенных/);
 assert.match(inspection,/setFilter\("PASSED"\)/);
 assert.doesNotMatch(inspection,/exportAdmitted|text\/csv|\.csv|buildAdmittedRosterCsv/);
});

test('notification test is device-only and cannot enqueue messages for subscribers',async()=>{
 const source=await readFile(new URL('../src/admin/NotificationsPage.tsx',import.meta.url),'utf8');
 assert.match(source,/Тест уведомлений/);
 assert.match(source,/Notification\.requestPermission\(\)/);
 assert.match(source,/new Notification\("USD · Тест уведомления"/);
 assert.match(source,/не доставки push через сервер/);
 assert.match(source,/canCreate && \(/);
});
