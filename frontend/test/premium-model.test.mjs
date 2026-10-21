import test from 'node:test';
import assert from 'node:assert/strict';
import {publishedNews,teamGroups,safeHref,stageRegistrationPath,highestDbRecord} from '../src/public/premium-model.ts';

test('news excludes drafts and future posts, while preserving published content',()=>{
  const rows=[{id:'draft',isPublished:false},{id:'future',publishedAt:'2099-01-01'},{id:'old',publishedAt:'2025-01-01'},{id:'new',publishedAt:'2026-01-01'}];
  assert.deepEqual(publishedNews(rows,new Date('2026-10-21').getTime()).map(x=>x.id),['new','old']);
});
test('teams group only public participants without changing their stored names',()=>{
  const groups=teamGroups([{id:'a',team:' Sound Force ',firstName:'Yuri'},{id:'b',team:'sound force'},{id:'c',team:'Без команды'},{id:'d',team:''}]);
  assert.equal(groups.length,1);assert.equal(groups[0].name,'Sound Force');assert.equal(groups[0].members.length,2);assert.equal(groups[0].members[0].firstName,'Yuri');
});
test('external links reject executable protocols and control characters',()=>{
  assert.equal(safeHref('javascript:alert(1)'), '');assert.equal(safeHref('//evil.test'), '');assert.equal(safeHref('https://usd-russia.ru'),'https://usd-russia.ru/');assert.equal(safeHref('mailto:info@example.test'),'mailto:info@example.test');
});
test('registration deep links preserve the exact stage id through login',()=>{
  assert.equal(new URLSearchParams(stageRegistrationPath('stage & one').split('?')[1]).get('next'),'/participant/register?stageId=stage%20%26%20one');
});
test('record spotlight never compares speed in m/s with sound pressure',()=>{
  const rows=[{id:'speed',value:200,class:{name:'Storm Wall',unit:'MPS'}},{id:'sound',value:160,class:{unit:'DB'}},{id:'bad',value:null}];
  assert.equal(highestDbRecord(rows)?.id,'sound');assert.equal(highestDbRecord([]),undefined);
});
