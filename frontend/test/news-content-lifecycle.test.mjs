import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { newNewsDraft, prepareNewsItem, switchNewsPublication } from '../src/admin/news-content-lifecycle.ts';

const date='2026-11-10T10:00:00.000Z';
test('new article starts as an unpublished draft without a publication timestamp',()=>{
 const draft=newNewsDraft();
 assert.equal(draft.isPublished,false);
 assert.equal(draft.publishedAt,null);
 const saved=prepareNewsItem(draft,'story-1',date);
 assert.equal(saved.isPublished,false);
 assert.equal(saved.publishedAt,null);
 assert.equal(saved.createdAt,date);
 assert.equal(saved.id,'story-1');
});
test('publishing stamps first actual publication; editing and hiding do not falsify original date',()=>{
 const draft=prepareNewsItem({...newNewsDraft(),title:'  USD Stage   ',body:' Results '},'story-1',date);
 const published=switchNewsPublication(draft,'2026-11-11T10:00:00.000Z');
 assert.equal(published.isPublished,true);
 assert.equal(published.publishedAt,'2026-11-11T10:00:00.000Z');
 const edited=prepareNewsItem({...published,title:'  Edited USD  '},'story-1','2026-11-12T10:00:00.000Z');
 assert.equal(edited.title,'Edited USD');
 assert.equal(edited.publishedAt,published.publishedAt);
 assert.equal(edited.createdAt,date);
 const hidden=switchNewsPublication(edited,'2026-11-13T10:00:00.000Z');
 assert.equal(hidden.isPublished,false);
 assert.equal(hidden.publishedAt,published.publishedAt);
 const restored=switchNewsPublication(hidden,'2026-11-14T10:00:00.000Z');
 assert.equal(restored.publishedAt,published.publishedAt);
});
test('saving a draft does not put browser File objects in CMS JSON',()=>{
 const draft=prepareNewsItem({...newNewsDraft(),title:'Ready',file:{name:'photo.jpg'},photoUrl:'/photo.jpg'},'id',date);
 assert.equal(draft.photoUrl,'/photo.jpg');
 assert.equal(Object.prototype.hasOwnProperty.call(draft,'file'),false);
});
test('invalid empty news title fails before publish or persistence',()=>{
 assert.throws(()=>prepareNewsItem({...newNewsDraft(),title:'  '},'id',date),/заголовок/i);
});
test('new preview in ADMIN does not need public URL and editor has explicit Publish control',async()=>{
 const page=await readFile(new URL('../src/admin/NewsPage.tsx',import.meta.url),'utf8');
 assert.match(page,/newNewsDraft\(\)/);
 assert.match(page,/Сохранить черновик/);
 assert.match(page,/Предпросмотр/);
 assert.match(page,/_newsRevision/);
 assert.match(page,/switchNewsPublication/);
});
test('partners editor includes revision guard so deleting another ADMIN changes is blocked',async()=>{
 const page=await readFile(new URL('../src/admin/PartnersPage.tsx',import.meta.url),'utf8');
 assert.match(page,/_partnersRevision/);
 assert.match(page,/updateSiteSettings\(\{_partnersRevision:/);
});
