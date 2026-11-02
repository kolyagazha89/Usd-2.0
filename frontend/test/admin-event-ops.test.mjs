import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  operationsSearchText,matchesOperationsSearch,
  summarizeRegistrations,filterRegistrations,
  summarizeInspections,filterInspections,isPendingInspection,
  walkInRegistrationPath,canOpenWalkInRegistration,isPendingEquipment,
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

test('pending equipment tracks active uncompleted on-site drafts only',()=>{
 const unfinished={status:'ACTIVE',configurationSnapshot:{configurationPending:true}};
 assert.equal(isPendingEquipment(unfinished),true);
 assert.equal(isPendingEquipment({...unfinished,status:'CANCELLED'}),false);
 assert.equal(isPendingEquipment({status:'ACTIVE',configurationSnapshot:{configurationPending:false}}),false);
 assert.equal(isPendingEquipment({status:'ACTIVE',configurationSnapshot:{configurationPending:true,postStageCompletion:{versionId:'actual-v2'}}}),false);
 assert.equal(isPendingEquipment({status:'ACTIVE',configurationSnapshot:{configurationPending:true,postStageCompletion:{versionId:' '}}}),true);
 assert.equal(isPendingEquipment({status:'ACTIVE'}),false);
 assert.equal(isPendingEquipment({status:'ACTIVE',configurationSnapshot:{configurationPending:true,postStageCompletion:{versionId:123}}}),true);
});

test('registrations admin can filter overdue equipment and open its specific inspection',async()=>{
 const [registration,css]=await Promise.all([
  readFile(new URL('../src/admin/RegistrationsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/ui-consistency.css',import.meta.url),'utf8'),
 ]);
 assert.match(registration,/rows\.filter\(isPendingEquipment\)\.length/);
 assert.match(registration,/filterRegistrations\(rows,status,query,pastStage\)\.filter\(r=>!pendingOnly\|\|isPendingEquipment\(r\)\)/);
 assert.match(registration,/aria-pressed=\{pendingOnly\}/);
 assert.match(registration,/Оборудование не заполнено/);
 assert.match(registration,/encodeURIComponent\(stageId\)\+'\&registrationId='\+encodeURIComponent\(r\.id\)/);
 assert.match(css,/\.event-ops-metrics>\.event-ops-pending-filter/);
 assert.match(css,/@media\(max-width:750px\)/);
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

test('gate registration uses an exact stage link, protects past events and never opens from a malformed intent',()=>{
 const stageId='этап А / #3';
 const route=walkInRegistrationPath(stageId);
 assert.equal(route,'/admin/inspections?stageId='+encodeURIComponent(stageId)+'&register=1');
 const query=new URL(route,'https://app.usd-russia.ru').search;
 assert.equal(new URLSearchParams(query).get('stageId'),stageId);
 assert.equal(canOpenWalkInRegistration(query,false),true);
 assert.equal(canOpenWalkInRegistration(query,true),false);
 for(const unsafe of ['?register=0','?register=true','?register=','?Register=1','']) {
  assert.equal(canOpenWalkInRegistration(unsafe,false),false,unsafe);
 }
});

test('the registration desk enters the correct live stage and never offers walk-in on an archive',async()=>{
 const [registration,inspection,css]=await Promise.all([
  readFile(new URL('../src/admin/RegistrationsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/InspectionsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/ui-consistency.css',import.meta.url),'utf8'),
 ]);
 assert.match(registration,/!pastStage&&<button type="button" className="primary-button compact"/);
 assert.match(registration,/go\(walkInRegistrationPath\(stageId\)\)/);
 assert.match(registration,/disabled=\{!stageId\|\|loading\}/);
 assert.match(inspection,/loadingStages\?<LoadingPage small\/>/,'initial stage must be validated before rendering gate form');
 assert.match(inspection,/!initialRegistrationId&&canOpenWalkInRegistration\(location\.search,readOnly\)/);
 assert.match(inspection,/registerOpen&&!readOnly/,'a crafted past-stage URL cannot mount the write form');
 assert.match(inspection,/params\.delete\('register'\)/,'closing the form must clear its one-shot URL intent');
 assert.match(inspection,/onClose=\{closeWalkInRegistration\}/);
 assert.match(inspection,/onSaved=\{async\(registrationId:string\)=>\{closeWalkInRegistration\(\);const updated=await load\(\)/);
 assert.match(inspection,/updated\.some\(\(item:any\)=>item\.id===registrationId\)/,'new registration must be in the selected stage roster');
 assert.match(inspection,/setSelectedRegistrationId\(registrationId\)/,'operator must continue directly to inspection');
 assert.match(inspection,/params\.set\('registrationId',registrationId\)/,'QR and history links retain the newly saved selection');
 assert.match(inspection,/const created=await apiPost<\{id:string\}>\('\/registrations'/,'use the saved registration ID from backend');
 assert.match(inspection,/Итоговый список допущенных готов к просмотру/,'the admitted roster is viewed inside USD, not downloaded as CSV');
 assert.match(inspection,/classIds\.length>=5/,'a sixth class must be disabled at on-site registration');
 assert.match(inspection,/apiPost<\{participantId:string;carId:string\}>\('\/registrations\/on-site\/profile'/);
 assert.match(inspection,/privacyConsent,termsAccepted,/,'consent is sent before any new identity record is stored');
 assert.match(inspection,/const updated=await load\(\)/,'new registration must be reloaded from the server');
 assert.match(inspection,/!configurationVersionId&&carId&&/,'missing hardware must be explicitly shown as pending');
 assert.match(inspection,/r\.configurationSnapshot\?\.configurationPending===true/,'the inspection list and detail must warn about the pending equipment draft');
 assert.match(inspection,/apiPost<\{participantId:string;carId:string\}>\('\/registrations\/on-site\/car'/,'existing participants can add a new car without duplicate profiles');
 assert.match(inspection,/setCarId\(created\.carId\)/,'new car is selected for continued registration');
 assert.match(inspection,/apiPatch\('\/registrations\/'\+encodeURIComponent\(registrationId\)\+'\/configuration'/,'operator can confirm the actual equipment');
 assert.match(inspection,/onClick=\{\(\)=>void confirmConfiguration\(\)\}/,'pending confirmation is actionable');
 assert.match(inspection,/const canDocumentEquipment=!readOnly\|\|user.role==='ADMIN'/,'ADMIN may document equipment for archived stage without editing inspection');
 assert.match(inspection,/Конфигурацию можно заполнить после этапа/);
 assert.match(inspection,/\{canDocumentEquipment&&<div className="event-ops-confirm-config">/);
 assert.match(inspection,/!confirmChoices\.length&&!confirmLoading/,'the operator sees a meaningful empty state');
 assert.match(inspection,/setConfirmChoices\(options\);setChosenConfiguration\(''\)/,'judge must explicitly select the actual saved equipment version');
 assert.match(inspection,/const configurations=\(selectedCar\?\.configurations\?\?\[\]\)\.flatMap\(\(cfg:any\)=>\(cfg\.versions\?\?\[\]\)\.filter\(\(v:any\)=>v\.additionalDescription!=='USD_ON_SITE_DRAFT_PENDING'\)/,'judge cannot accidentally select a previous event-day placeholder');

 assert.match(inspection,/Конфигурация ожидает заполнения/);
 assert.match(inspection,/configurationVersionId\?\{configurationVersionId\}:\{\}/,'on-site draft is authorized only on the API, not forged by client');
 assert.match(inspection,/pendingCreatedCarId\.current=created\.carId/);
 assert.match(css,/\.event-ops-newcomer-fields/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(inspection,/if\(classIds\.length>5\)\{setError\('Можно выбрать не более 5 классов на регистрацию'\);return\}/);
 assert.match(inspection,/Выбрано классов: \{classIds\.length\} из 5/,'judge sees why further classes are unavailable');
 assert.match(inspection,/!isBassRace\(x\)&&selectedDirections\.has\(directionId\)/,'non-BassRace direction exclusivity is preserved');
 assert.match(css,/\.event-ops-quick-actions/);
 assert.match(css,/@media\(max-width:375px\)/);
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
 assert.match(css,/\.content:has\(> \.page\.event-ops-page\)/,'no static page width cap or blank right rail on event workspaces');
 assert.match(css,/padding: 0 !important;/,'event pages must not double-inset at mobile/tablet breakpoints');
 assert.match(layout,/scrollbar-gutter: auto/,'navigation must not reserve a side stripe');
 assert.match(layout,/scrollbar-color: #56565e transparent/,'dark neutral scrollbar replaces blue-gray');
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
