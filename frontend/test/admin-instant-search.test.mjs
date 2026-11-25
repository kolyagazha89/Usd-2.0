import test from 'node:test';
import assert from 'node:assert/strict';
import {filterAdminUsers} from '../src/admin/user-list-filters.ts';
import {filterInspections,filterRegistrations} from '../src/admin/event-ops-model.ts';

test('users match the linked full name, any word order, ё and email while preserving filters',()=>{
 const users=[{id:'linked',email:'driver@usd.test',role:'PARTICIPANT',participant:{id:'p1',lastName:'Семёнов',firstName:'Иван',middleName:'Петрович'}},
  {id:'free',email:'free@usd.test',role:'ADMIN',name:'Семёнов Иван',emailVerifiedAt:'2026-01-01'}];
 const find=(query,role='',email='ALL',profile='ALL')=>filterAdminUsers(users,query,role,email,profile).map(u=>u.id);
 for(const query of ['семенов',' ИВАН  СЕМЁНОВ ','Петрович Иван','driver@usd'])assert.deepEqual(find(query),['linked'],query);
 assert.deepEqual(find('семенов','ADMIN'),[]);
 assert.deepEqual(find('семенов','','VERIFIED'),[]);
 assert.deepEqual(find('семенов','','ALL','UNLINKED'),[]);
 assert.deepEqual(find('free@usd'),['free']);
 assert.deepEqual(find('нет совпадений'),[]);
});

test('number lookup matches exact assigned numbers, including padding and №, never incidental digits',()=>{
 const rows=[
  {id:'one',status:'ACTIVE',participantNumber:1,participant:{lastName:'Первый'}},
  {id:'eleven',status:'ACTIVE',participantNumber:11,car:{registrationNumber:'А001АА001',model:'Focus 1'},classes:[{class:{name:'Limited 1'}}]},
  {id:'extra',status:'ACTIVE',participantNumber:20,numbers:[{number:101}],classes:[{number:{number:18}}]},
 ];
 for(const filter of [filterInspections,filterRegistrations]){
  for(const query of ['1','001','№001','№ 001','#001'])assert.deepEqual(filter(rows,'ALL',query).map(r=>r.id),['one'],query);
  assert.deepEqual(filter(rows,'ALL','101').map(r=>r.id),['extra']);
  assert.deepEqual(filter(rows,'ALL','№018').map(r=>r.id),['extra']);
  assert.deepEqual(filter(rows,'ALL','999'),[]);
  assert.deepEqual(filter(rows,'ALL','А001АА001').map(r=>r.id),['eleven']);
  assert.deepEqual(filter(rows,'ALL','№001 Первый').map(r=>r.id),['one']);
  assert.deepEqual(filter(rows,'ALL','№001 Focus'),[]);
 }
});
