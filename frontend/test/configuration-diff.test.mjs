import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {diffConfigurationVersions} from '../src/participant/configuration-diff.ts';

const find=(sections,key)=>sections.find(section=>section.key===key)?.changes??[];

test('compares front, bass, rear and amplifiers without mixing directions',()=>{
 const old={
  audioComponents:[{direction:'SUB',type:'SUBWOOFER',brand:'Deaf Bonce',model:'Machete',quantity:2},{direction:'FRONT',brand:'A',model:'Mid',quantity:4}],
  amplifiers:[{direction:'SUB',brand:'A',model:'AMP',quantity:1}],
 };
 const current={
  audioComponents:[{direction:'SUB',type:'SUBWOOFER',brand:'Deaf Bonce',model:'Machete',quantity:4},{direction:'REAR',brand:'B',model:'Horn',quantity:2}],
  amplifiers:[{direction:'SUB',brand:'A',model:'AMP',quantity:2}],
 };
 const snapshot=JSON.stringify({old,current});
 const result=diffConfigurationVersions(old,current);
 assert.deepEqual(find(result,'SUB'),[{label:'Deaf Bonce Machete',before:'2 шт.',after:'4 шт.'}]);
 assert.deepEqual(find(result,'FRONT'),[{label:'A Mid',before:'4 шт.',after:'—'}]);
 assert.deepEqual(find(result,'REAR'),[{label:'B Horn',before:'—',after:'2 шт.'}]);
 assert.deepEqual(find(result,'AMPLIFIERS'),[{label:'A AMP',before:'1 шт.',after:'2 шт.'}]);
 assert.equal(JSON.stringify({old,current}),snapshot,'comparison must not alter historical versions');
});

test('merges duplicate rows, compares battery sections, alternators and head units',()=>{
 const previous={batteries:[{brand:'AGM',model:'80',quantity:1},{brand:'AGM',model:'80',quantity:2}],headUnits:[{brand:'Pioneer',model:'MVH',quantity:1}]};
 const next={batteries:[{brand:'agm',model:'80',quantity:4}],generators:[{brand:'OEM',model:'320',quantity:2}]};
 const sections=diffConfigurationVersions(previous,next);
 assert.deepEqual(find(sections,'POWER'),[
  {label:'Аккумулятор: agm 80',before:'3 шт.',after:'4 шт.'},
  {label:'Генератор: OEM 320',before:'—',after:'2 шт.'},
 ]);
 assert.deepEqual(find(sections,'HEAD_UNITS'),[{label:'Pioneer MVH',before:'1 шт.',after:'—'}]);
});

test('compares parsed box parameters separately from freeform notes and vibration',()=>{
 const before={additionalDescription:'Короб: ФИ · 180 л · 32 Гц\n\nСтарая проводка',vibrationIsolation:'STP'};
 const after={additionalDescription:'Короб: ЗЯ · 140 л · 0 Гц\n\nНовая проводка',vibrationIsolation:'ComfortMat'};
 const sections=diffConfigurationVersions(before,after);
 assert.deepEqual(find(sections,'BOX').map(change=>change.label),['Тип короба','Объём, л','Настройка, Гц']);
 assert.deepEqual(find(sections,'OTHER'),[
  {label:'Виброизоляция',before:'STP',after:'ComfortMat'},
  {label:'Описание',before:'Старая проводка',after:'Новая проводка'},
 ]);
});

test('identical and empty legacy versions produce no invented changes',()=>{
 assert.deepEqual(diffConfigurationVersions({},{}),[]);
 assert.deepEqual(diffConfigurationVersions({audioComponents:[{brand:'A',model:'B',quantity:1}]},{audioComponents:[{brand:'a',model:'b',quantity:1}]}),[]);
});

test('version comparison is available to members and admins with mobile and light theme rules',async()=>{
 const editor=await readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8');
 const css=await readFile(new URL('../src/dark-velocity-sitewide.css',import.meta.url),'utf8');
 assert.match(editor,/diffConfigurationVersions\(comparedVersion,version\)/);
 assert.match(editor,/aria-label="Версия для сравнения"/);
 assert.match(editor,/configuration-compare-sections/);
 assert.match(css,/body \.usd-member \.configuration-compare/);
 assert.match(css,/\.configuration-compare-sections\{grid-template-columns:minmax\(0,1fr\)/);
});
