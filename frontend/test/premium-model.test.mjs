import test from 'node:test';
import assert from 'node:assert/strict';
import {carName,countLabel,publishedNews,teamGroups,safeHref,stageRegistrationPath,highestDbRecord,nextPublishedStage} from '../src/public/premium-model.ts';

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

test('public counts use Russian number forms',()=>{assert.deepEqual([0,1,2,5,11,21,22,25].map(n=>countLabel(n,'участник','участника','участников')),['0 участников','1 участник','2 участника','5 участников','11 участников','21 участник','22 участника','25 участников']);});

test('public car labels hide archive placeholders without losing known models',()=>{assert.equal(carName({brand:'Не указано',model:'Toyota Celica'}),'Toyota Celica');assert.equal(carName({brand:'Не указано',model:'Не указано'}),'Автомобиль USD');assert.equal(carName({brand:'Lada',model:'Vesta'}),'Lada Vesta')});


test('homepage keeps a published event visible for its entire local day',()=>{
  const today=new Date(2026,9,28,20,30).getTime();
  const stageDate=new Date(2026,9,28,9,0).toISOString();
  const tomorrow=new Date(2026,9,29,9,0).toISOString();
  const yesterday=new Date(2026,9,27,9,0).toISOString();
  const stages=[
    {id:'invalid',status:'PUBLISHED',date:'not-a-date'},
    {id:'draft',status:'DRAFT',date:stageDate},
    {id:'yesterday',status:'PUBLISHED',date:yesterday},
    {id:'tomorrow',status:'PUBLISHED',date:tomorrow},
    {id:'today',status:'PUBLISHED',date:stageDate},
  ];
  assert.equal(nextPublishedStage(stages,today)?.id,'today');
  assert.equal(nextPublishedStage(stages.filter(s=>s.id!=='today'),today)?.id,'tomorrow');
  assert.equal(nextPublishedStage([{id:'invalid',status:'PUBLISHED',date:'n/a'}],today),undefined);
});
