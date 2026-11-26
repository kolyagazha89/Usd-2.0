import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {jumpToEventOpsRecords} from '../src/admin/event-ops-scroll.ts';

const read=path=>readFile(new URL('../src/admin/'+path,import.meta.url),'utf8');

test('jump to records dismisses keyboard focus and scrolls to the list without changing the route',()=>{
 let blurred=0,scrolled=null;
 const doc={
  activeElement:{blur(){blurred++}},
  getElementById(id){assert.equal(id,'event-ops-records');return{scrollIntoView(value){scrolled=value}}}
 };
 assert.equal(jumpToEventOpsRecords(doc),true);
 assert.equal(blurred,1);
 assert.deepEqual(scrolled,{block:'start',behavior:'smooth'});
});
test('missing list target does not throw or hijack navigation',()=>{
 const doc={activeElement:{blur(){}},getElementById(){return null}};
 assert.equal(jumpToEventOpsRecords(doc),false);
});

test('all three event-day desks offer an immediate jump to a stable list anchor',async()=>{
 const [nav,registrations,inspections,results]=await Promise.all([
  read('EventOperationsNavigation.tsx'),read('RegistrationsPage.tsx'),read('InspectionsPage.tsx'),read('ResultsPage.tsx')
 ]);
 assert.match(nav,/jumpToEventOpsRecords\(/);
 assert.match(nav,/К списку/);
 for(const [name,code] of Object.entries({registrations,inspections,results})){
  assert.match(code,/id="event-ops-records"/,name+' must expose the records anchor');
 }
});

test('inspection scan-QR action is beside on-site registration, not in the remote page heading',async()=>{
 const code=await read('InspectionsPage.tsx');
 assert.match(code,/onScanQr=\{\(\)=>setScanOpen\(true\)\}/);
 assert.match(code,/onScanQr:\(\)=>void/);
 assert.doesNotMatch(code,/action=\{!scanOpen\?<button/,'QR must not be a header action');
 const primary=await read('EventOperationsPrimaryActions.tsx');
 assert.match(code,/EventOperationsPrimaryActions onCreate=\{\(\)=>setRegisterOpen\(true\)\} onScan=\{onScanQr\}/);
 assert.match(primary,/aria-label="Сканировать QR"/);
 assert.match(primary,/createLabel='Регистрация на месте'/);

});

test('inspection, registration and judging prioritize actual entries over full-height metrics',async()=>{
 const [registrations,inspections,results]=await Promise.all([
  read('RegistrationsPage.tsx'),read('InspectionsPage.tsx'),read('ResultsPage.tsx')
 ]);
 assert.match(registrations,/<EventOperationsSummary/);
 assert.match(inspections,/<EventOperationsSummary/);
 assert.match(results,/<EventOperationsSummary/);
 assert.doesNotMatch(inspections,/className="event-ops-overview" aria-label="Сводка инспекций"/);
 assert.doesNotMatch(registrations,/className="event-ops-overview" aria-label="Сводка регистраций"/);
 assert.ok(inspections.indexOf('className="inspection-toolbar event-ops-toolbar"')<inspections.indexOf('<EventOperationsSummary'),
  'inspection actions and search must precede optional metrics');
});

test('mobile clear-search button has one fixed touch-sized cell, never vertical lettering',async()=>{
 const [registrations,inspections,css]=await Promise.all([
  read('RegistrationsPage.tsx'),read('InspectionsPage.tsx'),read('admin-shell-layout.css')
 ]);
 for(const [name,code] of Object.entries({registrations,inspections})){
  assert.match(code,/className="event-ops-clear-mark" aria-hidden="true"/,name);
  assert.match(code,/aria-label="Очистить поиск"/,name);
 }
 assert.match(css,/\.event-ops-clear-mark/);
 assert.match(css,/white-space:nowrap/);
 assert.match(css,/grid-template-columns:24px minmax\(0,1fr\) 44px/);
 assert.match(css,/scroll-margin-top/,'jump must avoid covered headings');
});
