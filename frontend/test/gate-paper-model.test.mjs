import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGatePaperSheets} from '../src/admin/gate-paper-model.ts';

const stage={name:'Финал',city:'Волгоград',date:'2026-11-29'};
const rows=[
 {id:'pre',status:'ACTIVE',source:'PRE_REGISTRATION',participantNumber:5,participant:{lastName:'Иванов',firstName:'Иван',middleName:'Иванович'},car:{brand:'Lada',model:'2107',registrationNumber:'А123АА'},numbers:[{number:5,isPrimary:true},{number:9,isPrimary:false}],classes:[{class:{name:'SPL',direction:{name:'SPL'}},number:{number:5}},{class:{name:'120',direction:{name:'BassRace'}},number:{number:9}}]},
 {id:'cancelled',status:'CANCELLED',source:'PRE_REGISTRATION',participantNumber:-1,numbers:[{number:7}]},
 {id:'onsite',status:'ACTIVE',source:'ON_SITE',participantNumber:2,participant:{lastName:'Петров'},numbers:[{number:2,isPrimary:true}],classes:[]},
];
test('gate package lists every active pre-registration and all occupied stickers, including on-site and BassRace',()=>{
 const sheets=buildGatePaperSheets(stage,rows,'2026-11-25T08:00:00.000Z');
 const pre=sheets.find(s=>s.name==='Предрегистрация').rows.slice(3);
 assert.equal(pre.length,1);
 assert.deepEqual(pre[0].slice(0,6),[5,'Иванов Иван Иванович','Lada 2107','А123АА','SPL · SPL','9: BassRace · 120']);
 const occupied=sheets.find(s=>s.name==='Занятые номера').rows.slice(3);
 assert.deepEqual(occupied.map(r=>r[0]),Array.from({length:100},(_,i)=>i+1));
 assert.deepEqual(occupied[0],[1,'Свободен','','','','']);
 assert.equal(occupied[1][1],'Основной');
 assert.equal(occupied[8][1],'Доп.');
 assert.equal(occupied[8][3],'BassRace · 120');
 assert.equal(occupied[6][1],'Свободен');
});
test('empty stage still has headers, blank forms and instructions; no invented participant',()=>{
 const sheets=buildGatePaperSheets(stage,[],'2026-11-25T08:00:00.000Z');
 assert.equal(sheets.find(s=>s.name==='Предрегистрация').rows.length,3);
 assert.equal(sheets.find(s=>s.name==='Занятые номера').rows.length,103);
 assert.equal(sheets.find(s=>s.name==='Новые заявки').rows.length,23);
 assert.equal(sheets.find(s=>s.name==='Инструкция').rows[0][0],'USD · Резервная работа на въезде');
});
test('primary number and class-linked numbers are preserved even with incomplete number arrays',()=>{
 const sheets=buildGatePaperSheets(stage,[{status:'ACTIVE',source:'PRE_REGISTRATION',participantNumber:4,classes:[{class:{name:'Extra'},number:{number:8}}]}],'now');
 assert.deepEqual(sheets.find(s=>s.name==='Занятые номера').rows.slice(3).filter(r=>r[1]!=='Свободен').map(r=>r[0]),[4,8]);
});

test('occupied numbers above 100 are never omitted from the ledger',()=>{
 const sheet=buildGatePaperSheets(stage,[{status:'ACTIVE',participantNumber:107}],'now').find(s=>s.name==='Занятые номера');
 assert.equal(sheet.rows.length,104);
 assert.deepEqual(sheet.rows.at(-1),[107,'Основной','','',107,'']);
});
