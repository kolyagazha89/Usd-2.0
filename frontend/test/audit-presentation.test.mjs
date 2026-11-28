import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {describeAuditEvent,auditActionName,auditEntityName} from '../src/admin/audit-presentation.ts';

test('result corrections show actor, current target, real differences and no unchanged fields',()=>{
 const row=describeAuditEvent({action:'RESULT_CORRECTED',entity:'Result',user:{name:'Иван Судья',email:'judge@example.test',role:'PARTICIPANT',customRole:{name:'Судья SPL'}},context:{registration:{participantNumber:7,participant:{id:'p',lastName:'Иванов',firstName:'Иван'},stage:{id:'s',name:'Краснодар'}},className:'2x2'},metadata:{before:{value:'145.2',unit:'DB',place:null,notes:'старый'},after:{value:'146.1',unit:'DB',place:1,notes:'старый'}}});
 assert.equal(row.action,'Результат исправлен');
 assert.equal(row.actor,'Иван Судья');assert.equal(row.role,'Судья SPL');
 assert.match(row.target,/Иванов Иван/);assert.match(row.target,/№7/);assert.match(row.target,/2x2/);
 assert.deepEqual(row.changes.map(c=>[c.label,c.before,c.after]),[['Результат','145.2','146.1'],['Место','Не указано','1']]);
});

test('class changes, nested metadata and secrets are presented as readable fields without raw objects',()=>{
 const r=describeAuditEvent({action:'REGISTRATION_CLASSES_CHANGED',entity:'Registration',metadata:{before:[{classId:'old-id',className:'1x2',number:7}],after:[{classId:'new-id',className:'2x2'}],reason:'Решение судьи',nested:{status:'PASSED',passwordHash:'secret1',token:'secret2'},password:'secret3',payloadHash:'secret4'}});
 assert.equal(r.action,'Классы регистрации изменены');
 assert.ok(r.changes.some(c=>c.before.includes('1x2')&&c.after.includes('2x2')));
 assert.ok(r.details.some(c=>c.value==='Решение судьи'));
 assert.ok(r.details.some(c=>c.value==='Допущен'));
 const text=JSON.stringify(r);
 for(const value of ['secret1','secret2','secret3','secret4','old-id','new-id'])assert.ok(!text.includes(value),value);
 assert.ok(!r.details.some(c=>c.value.includes('[object Object]')));
});

test('missing actor and missing metadata stay explicit, unknown actions remain identifiable',()=>{
 const r=describeAuditEvent({action:'UNRECOGNIZED_EVENT',entity:'Unexpected',user:null,userId:'old-user'});
 assert.equal(r.actor,'Автор недоступен');assert.equal(r.role,'Роль не сохранена');
 assert.match(r.action,/UNRECOGNIZED_EVENT/);
 assert.deepEqual(r.changes,[]);assert.deepEqual(r.details,[]);
 assert.equal(describeAuditEvent({action:'CREATE',entity:'Stage'}).actor,'Автор не указан');
 assert.equal(auditEntityName('ParticipantStageInspection'),'Инспекция участника на этапе');
 assert.equal(auditActionName('VEHICLE_INSPECTION_CREATED'),'Инспекция автомобиля проведена');
});

test('audit UI uses readable presentation and server filtering with pagination',async()=>{
 const page=await readFile(new URL('../src/admin/AuditPage.tsx',import.meta.url),'utf8');
 assert.match(page,/describeAuditEvent\(/);
 assert.doesNotMatch(page,/JSON\.stringify\(/);
 assert.match(page,/getAudit\(page,pageSize,entity,action,/);
 assert.match(page,/AdminListPagination/);
 assert.match(page,/Было/);assert.match(page,/Стало/);
});
