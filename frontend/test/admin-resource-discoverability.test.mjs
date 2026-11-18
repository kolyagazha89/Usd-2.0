import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  resourceStatusMatches,
  resourceStatusOptions,
  resourceEmptyMessage,
  normalizedResourceStatus,
} from '../src/admin/resource-list-filters.ts';

const cases=[
  {status:'DRAFT',id:'draft'},
  {status:'PUBLISHED',id:'published'},
  {status:'COMPLETED',id:'completed'},
  {status:'CANCELLED',id:'cancelled'},
];

test('stage filter has explicit editable and historical statuses',()=>{
  const options=resourceStatusOptions('/stages');
  for(const value of ['ALL','DRAFT','PUBLISHED','COMPLETED','CANCELLED']){
    assert.ok(options.some(option=>option.value===value),'missing '+value);
  }
  for(const stage of cases){
    assert.deepEqual(cases.filter(item=>resourceStatusMatches('/stages',item,stage.status)).map(item=>item.id),[stage.id]);
  }
  assert.deepEqual(cases.filter(item=>resourceStatusMatches('/stages',item,'INACTIVE')).map(item=>item.id),['completed','cancelled']);
  assert.equal(normalizedResourceStatus('/stages','ACTIVE'),'PUBLISHED','remembered active choice still makes sense');
});

test('generic resources retain active and inactive behavior',()=>{
  assert.equal(resourceStatusMatches('/admin/participants',{isActive:true},'ACTIVE'),true);
  assert.equal(resourceStatusMatches('/admin/participants',{isActive:false},'ACTIVE'),false);
  assert.equal(resourceStatusMatches('/admin/participants',{isActive:false},'INACTIVE'),true);
  assert.equal(resourceStatusMatches('/seasons',{status:'ARCHIVED'},'INACTIVE'),true);
  assert.equal(resourceStatusMatches('/seasons',{status:'ACTIVE'},'ACTIVE'),true);
});

test('empty result text differentiates an empty database from filtered-out records',()=>{
 assert.equal(resourceEmptyMessage({total:0,search:'',filtered:0}),'Записей пока нет');
 assert.match(resourceEmptyMessage({total:3,search:'Тюмень',filtered:0}),/по запросу/i);
 assert.match(resourceEmptyMessage({total:3,search:'',filtered:0}),/фильтр/i);
});

test('admin list allows finding, clearing and opening filtered records without a mouse',async()=>{
 const [resource,stages]=await Promise.all([
  readFile(new URL('../src/admin/ResourcePage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/CompetitionPages.tsx',import.meta.url),'utf8'),
 ]);
 assert.match(resource,/resourceStatusMatches\(/);
 assert.match(resource,/resourceStatusOptions\(/);
 assert.match(resource,/resourceEmptyMessage\(/);
 assert.match(resource,/aria-label="Сбросить фильтры"/);
 assert.match(resource,/aria-label="Очистить поиск"/);
 assert.match(resource,/tabIndex=\{0\}/);
 assert.match(resource,/e\.target===e\.currentTarget&&\(e\.key==='Enter'\|\|e\.key===' '\)/);
 assert.match(stages,/permanentDeleteKind=\{admin\?'stage':undefined\}/);
});
