import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sortResourceRows,paginateResourceRows} from '../src/admin/admin-table-model.ts';

const read = path=>readFile(new URL(path,import.meta.url),'utf8');

test('resource table sorting is stable, locale-aware and never mutates API rows',()=>{
 const rows=[
  {id:'a',name:'Этап 10',position:10,owner:{name:'Тюмень'}},
  {id:'b',name:'Этап 2',position:2,owner:{name:'Москва'}},
  {id:'c',name:'этап 2',position:2,owner:{name:'Москва'}},
  {id:'d',name:null,position:null,owner:null},
 ];
 const original=rows.map(row=>row.id);
 const key=(row,path)=>row[path];
 assert.deepEqual(sortResourceRows(rows,'name','asc',key).map(row=>row.id),['b','c','a','d']);
 assert.deepEqual(sortResourceRows(rows,'name','desc',key).map(row=>row.id),['a','b','c','d'],'missing values stay at end in both directions');
 assert.deepEqual(sortResourceRows(rows,'position','asc',key).map(row=>row.id),['b','c','a','d']);
 assert.deepEqual(sortResourceRows(rows,'owner','asc',key).map(row=>row.id),['b','c','a','d'],'nested display labels sort predictably');
 assert.deepEqual(sortResourceRows(rows,'','asc',key).map(row=>row.id),original,'no sort preserves original API order');
 assert.deepEqual(rows.map(row=>row.id),original,'sorting may not mutate API data');
});

test('pagination uses valid page sizes and clamps after filtering or data updates',()=>{
 const rows=Array.from({length:61},(_,i)=>({id:i+1}));
 const first=paginateResourceRows(rows,1,25);
 assert.deepEqual([first.page,first.pageCount,first.rows[0].id,first.rows.at(-1).id],[1,3,1,25]);
 const last=paginateResourceRows(rows,9,25);
 assert.deepEqual([last.page,last.pageCount,last.rows[0].id,last.rows.at(-1).id],[3,3,51,61]);
 const filtered=paginateResourceRows(rows.slice(0,3),3,25);
 assert.deepEqual([filtered.page,filtered.pageCount,filtered.rows.length],[1,1,3]);
 const empty=paginateResourceRows([],4,50);
 assert.deepEqual([empty.page,empty.pageCount,empty.rows.length],[1,1,0]);
 assert.equal(paginateResourceRows(rows,1,123).rows.length,25,'tampered page sizes fail back to 25');
 assert.equal(paginateResourceRows(rows,-5,25).page,1);
});

test('resource and car tables share accessible pagination and mobile card contract',async()=>{
 const [resource,cars,pager,layout]=await Promise.all([
  read('../src/admin/ResourcePage.tsx'),
  read('../src/admin/CarsPage.tsx'),
  read('../src/admin/AdminListPagination.tsx'),
  read('../src/admin/admin-shell-layout.css'),
 ]);
 assert.match(resource,/className="data-table usd-universal-table"/);
 assert.match(cars,/className="data-table usd-universal-table"/);
 assert.match(resource,/aria-sort=/,'table headers expose the current sort direction');
 assert.match(resource,/aria-label="Сортировка записей"/,'mobile users can sort without opening hidden header');
 assert.match(resource,/<AdminListPagination/);
 assert.match(cars,/<AdminListPagination/,'cars use the same pagination control');
 assert.match(pager,/aria-label=\{'Предыдущая страница/);
 assert.match(pager,/aria-label=\{'Следующая страница/);
 assert.match(pager,/role="status"/);
 assert.match(layout,/\.usd-universal-table/);
 assert.match(layout,/content:attr\(data-label\)/);
 assert.match(layout,/env\(safe-area-inset-bottom/);
 assert.match(layout,/thea[d] \.usd-universal-sort-button\{visibility:hidden!important\}/,'clipped header buttons must not steal keyboard focus on mobile');
 assert.match(resource,/aria-sort=\{activeSort===c.key/);
 const navigation=await read('../../scripts/admin-navigation-browser-qa.mjs');
 assert.match(navigation,/\.usd-universal-pagination select'\)\.selectOption\('100'\)/,'deep-row QA explicitly pages the list');
 assert.match(navigation,/Страница 3 из 3/,'vehicle QA checks the shared footer');
});
