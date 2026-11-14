import test from 'node:test';
import assert from 'node:assert/strict';
import {dayStatus,eventDayCounts,filterEventDayRows,stageIsReadOnly,hasDayPermission,canChangeDayInspection,dayPath} from '../src/admin/event-day-model.ts';

const admin={id:'admin',role:'ADMIN'};
const judge={id:'judge',role:'PARTICIPANT',customRoleId:'role',customRole:{permissions:{registrations:['view','create'],stages:['view'],inspections:['view','create','update'],results:['view','create']}}};
const viewer={id:'viewer',role:'PARTICIPANT',customRoleId:'role',customRole:{permissions:{registrations:['view'],stages:['view']}}};
const rows=[
 {id:'r1',participantId:'p1',status:'ACTIVE',participantNumber:12,numbers:[{number:12}],participant:{firstName:'Иван',lastName:'Иванов'},car:{brand:'Toyota',model:'Camry',registrationNumber:'А001УР001'},classes:[{class:{name:'Limited 2.0',direction:{name:'SPL'}}}]},
 {id:'r2',participantId:'p2',status:'ACTIVE',participantNumber:3,numbers:[{number:3}],participant:{firstName:'Пётр',lastName:'Смирнов'},car:{brand:'Lada',model:'Vesta'},stageInspection:{id:'i2',status:'PASSED',checkedByUserId:'judge'},configurationSnapshot:{configurationPending:true}},
 {id:'r3',participantId:'p2',status:'ACTIVE',participantNumber:22,participant:{firstName:'Пётр',lastName:'Смирнов'},car:{brand:'Lada',model:'2107'},inspection:{id:'i3',status:'FAILED',createdByUserId:'other',notes:'Ошибка технической проверки'}},
 {id:'r4',participantId:'p3',status:'CANCELLED',participantNumber:4,participant:{firstName:'Елена',lastName:'Петрова'},car:{brand:'Volkswagen',model:'Polo'},stageInspection:{id:'i4',status:'PASSED'}},
 {id:'r5',participantId:'p4',status:'ACTIVE',participantNumber:99,participant:{firstName:'Анна',lastName:'Орлова'},car:{brand:'Kia',model:'Rio'},configurationSnapshot:{configurationPending:true,postStageCompletion:{versionId:'approved-v2'}}},
];

test('the stage totals exclude cancelled registrations from passed, pending and equipment obligations',()=>{
 assert.deepEqual(eventDayCounts(rows),{total:5,active:4,passed:1,pending:2,failed:1,cancelled:1,equipment:1,people:3});
 assert.equal(dayStatus(rows[3]),'CANCELLED','a cancelled historical pass cannot enter final admission roster');
 assert.equal(dayStatus(rows[2]),'FAILED');
});

test('an explicit final admission list is active + PASSED, deterministically sorted by participant number',()=>{
 assert.deepEqual(filterEventDayRows(rows,'','PASSED').map(r=>r.id),['r2']);
 assert.deepEqual(filterEventDayRows(rows,'','ALL').map(r=>r.id),['r2','r1','r3','r5']);
 assert.deepEqual(filterEventDayRows(rows,'','CANCELLED').map(r=>r.id),['r4']);
 assert.deepEqual(filterEventDayRows(rows,'','EQUIPMENT').map(r=>r.id),['r2']);
});

test('search uses exact numbered lookup and Cyrillic name / plate normalization',()=>{
 assert.deepEqual(filterEventDayRows(rows,'№12','ALL').map(r=>r.id),['r1']);
 assert.deepEqual(filterEventDayRows(rows,'2','ALL').map(r=>r.id),[]);
 assert.deepEqual(filterEventDayRows(rows,'смирнов','ALL').map(r=>r.id),['r2','r3']);
 assert.deepEqual(filterEventDayRows(rows,'a001yp001','ALL').map(r=>r.id),['r1']);
 assert.deepEqual(filterEventDayRows(rows,'Camry','ALL').map(r=>r.id),['r1']);
});

test('past/completed/cancelled stages are read-only while future event intake remains actionable',()=>{
 const now=new Date('2026-11-03T12:00:00+03:00');
 assert.equal(stageIsReadOnly({date:'2026-11-22T10:00:00+03:00',status:'PUBLISHED'},now),false);
 assert.equal(stageIsReadOnly({date:'2026-11-02T10:00:00+03:00',status:'PUBLISHED'},now),true);
 assert.equal(stageIsReadOnly({date:'2026-11-22',status:'COMPLETED'},now),true);
 assert.equal(stageIsReadOnly({date:'2026-11-22',status:'CANCELLED'},now),true);
 assert.equal(stageIsReadOnly(undefined,now),true);
});

test('custom judges only act within assigned RBAC module/action and their own existing inspection',()=>{
 assert.equal(hasDayPermission(admin,'registrations','view'),true);
 assert.equal(hasDayPermission(judge,'results','create'),true);
 assert.equal(hasDayPermission(viewer,'inspections','view'),false);
 assert.equal(canChangeDayInspection(viewer,rows[0],false),false);
 assert.equal(canChangeDayInspection(judge,rows[0],false),true,'new inspection via create');
 assert.equal(canChangeDayInspection(judge,rows[1],false),true,'own inspection via update');
 assert.equal(canChangeDayInspection(judge,rows[2],false),false,'different judge cannot edit a historical decision');
 assert.equal(canChangeDayInspection(admin,rows[2],false),true);
 assert.equal(canChangeDayInspection(admin,rows[1],true),false,'finished stage is read only');
 assert.equal(canChangeDayInspection(admin,rows[3],false),false,'cancelled row cannot be inspected');
});

test('deep links keep the exact stage and registration identifiers in every destination',()=>{
 assert.equal(dayPath('/admin/inspections','stage: 1','reg/2'),'/admin/inspections?stageId=stage%3A+1&registrationId=reg%2F2');
 assert.equal(dayPath('/admin/event-day','stage-1'),'/admin/event-day?stageId=stage-1');
});

test('the browser workflow is wired to the same protected registration/inspection/results APIs',async()=>{
 const {readFile}=await import('node:fs/promises');
 const read=path=>readFile(new URL(path,import.meta.url),'utf8');
 const [page,routes,shell,inspections,nav]=await Promise.all([
  read('../src/admin/EventDayPage.tsx'),read('../src/admin/AdminRoutes.tsx'),
  read('../src/admin/AdminShell.tsx'),read('../src/admin/InspectionsPage.tsx'),
  read('../src/admin/EventOperationsNavigation.tsx'),
 ]);
 assert.match(page,/apiGet\('\/registrations\?stageId='/);
 assert.match(page,/apiPost\('\/inspections'/);
 assert.match(page,/apiPatch\('\/inspections\//);
 assert.match(page,/failureReason\.trim\(\)/);
 assert.match(page,/filterEventDayRows\(rows,search,filter\)/);
 assert.match(routes,/EventDayPage/);
 assert.match(shell,/\/admin\/event-day/);
 assert.match(inspections,/query\.get\('scan'\)==='1'/);
 assert.match(nav,/\/admin\/event-day\?stageId=/);
});

test('real LAN stage export is ADMIN-only, sealed and must use the single official installer flow',async()=>{
 const {readFile}=await import('node:fs/promises');
 const [event,controller,service,venuePage,staff]=await Promise.all([
  readFile(new URL('../src/admin/EventDayPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/stages/stages.controller.ts',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/stages/venue-stage.service.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/VenueServerPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/stages/venue-staff-access.ts',import.meta.url),'utf8'),
 ]);
 assert.match(event,/user\.role==='ADMIN'&&canList/);
 assert.match(event,/Подготовить офлайн-сервер: пакет, доступ судей и инструкция/);
 assert.match(event,/\/admin\/venue-server\?stageId=/);
 assert.doesNotMatch(event,/downloadVenuePackage|\/stages\/venue\/.*\/export/);
 assert.match(controller,/@Post\('venue\/:id\/staff-export'\)/);
 assert.match(controller,/@Header\('Cache-Control', 'private, no-store/);
 assert.match(service,/request\.user\.role!=='ADMIN'/);
 assert.match(service,/VENUE_STAGE_SIGNING_KEY_B64/);
 assert.match(service,/VENUE_STAGE_PACKAGE_EXPORTED/);
 assert.doesNotMatch(service,/passwordHash|refreshToken|birthDate|phone:true|email:true/);
 assert.match(venuePage,/validateVenueStaffExport/);
 assert.match(venuePage,/usd-venue-access-/);
 assert.match(staff,/createCipheriv\('aes-256-gcm'/);
 assert.match(staff,/staffAccess/);
});
