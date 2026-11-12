import test from 'node:test';
import assert from 'node:assert/strict';
import {adminCarEditorPath,adminEntityPath,relationForColumn,relatedAdminEntities,safeAdminReturn} from '../src/admin/entity-navigation.ts';

test('vehicle edits retain the exact referring list or card as their save destination',()=>{
 for(const from of ['/admin/cars','/admin/cars?carId=car-30&returnTo=%2Fadmin%2Fparticipants%3Fview%3Dp']){
  const url=new URL(adminCarEditorPath('car/30',from),'https://usd.test');
  assert.equal(url.pathname,'/admin/cars/edit');
  assert.equal(url.searchParams.get('carId'),'car/30');
  assert.equal(url.searchParams.get('returnTo'),from);
 }
 assert.equal(new URL(adminCarEditorPath('c','https://evil.test'),'https://usd.test').searchParams.has('returnTo'),false);
});

test('links use exact encoded identifiers, never names or plates',()=>{
 assert.equal(adminEntityPath('car','a/b?'),'/admin/cars?carId=a%2Fb%3F');
 assert.equal(adminEntityPath('stage','s/1'),'/admin/stages/s%2F1');
 assert.equal(adminEntityPath('participant','p'),'/admin/participants?view=p');
 assert.equal(adminEntityPath('car',undefined),null);
});
test('nested columns link only identity fields to their own relation',()=>{
 const row={stage:{id:'old'},result:{registration:{carId:'private',participant:{id:'p'},stageId:'actual'}}};
 assert.deepEqual(relationForColumn(row,'result.registration.car.brand'),{kind:'car',id:'private'});
 assert.deepEqual(relationForColumn(row,'result.registration.stage.name'),{kind:'stage',id:'actual'});
 assert.deepEqual(relationForColumn(row,'result.registration.participant.lastName'),{kind:'participant',id:'p'});
 assert.equal(relationForColumn(row,'stage.date'),null);
 assert.equal(relationForColumn({car:{brand:'Same name'}},'car.brand'),null);
});
test('detail cards expose distinct related cars, stages and participants without inventing IDs',()=>{
 const row={stage:{id:'s',name:'Final'},result:{registration:{stageId:'s',carId:'c',car:{brand:'Lada'},participant:{id:'p',lastName:'Demo'}}}};
 const links=relatedAdminEntities(row);
 assert.equal(links.filter(x=>x.kind==='stage').length,1);
 assert.deepEqual(links.map(x=>[x.kind,x.id]).sort(),[['car','c'],['participant','p'],['stage','s']]);
 assert.deepEqual(relatedAdminEntities({car:{brand:'No ID'},snapshot:{carId:'archived'}}),[]);
});
test('return destinations accept only internal admin routes',()=>{
 assert.equal(safeAdminReturn('/admin/participants?view=p'),'/admin/participants?view=p');
 for(const path of ['https://example.com','//example.com','/administrator','/admin/../login','/admin/cars\\evil','/admin/cars\n'])assert.equal(safeAdminReturn(path),null);
});
