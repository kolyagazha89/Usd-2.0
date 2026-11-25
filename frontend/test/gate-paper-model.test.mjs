import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGatePaperSheets} from '../src/admin/gate-paper-model.ts';
const stage={name:'Финал',date:'2026-11-29'};
const cls=(name,direction,number)=>({class:{name,direction:{name:direction}},number:{number}});
test('single portrait roster has 100 sticker rows, empty inspection, and five separate direction columns',()=>{
 const [sheet,...other]=buildGatePaperSheets(stage,[{status:'ACTIVE',source:'PRE_REGISTRATION',participantNumber:5,participant:{lastName:'Иванов',firstName:'Иван',middleName:'Иванович'},car:{brand:'Lada',model:'2107',registrationNumber:'А123АА'},numbers:[{number:5,isPrimary:true},{number:9}],classes:[cls('Любитель','SPL',5),cls('Стандарт','SPL',5),cls('Фронт','BF SPL',5),cls('Тыл','BDW SPL',5),cls('Wall','Storm Wall',5),cls('129.9','Bass Race',9)]}], 'now');
 assert.equal(other.length,0);
 assert.equal(sheet.rows.length,103);
 assert.deepEqual(sheet.rows[2],['Инспекция','№ участника','ФИО','Авто','Госномер','SPL','BFSPL','BDW SPL','BassRace','Hurricane']);
 assert.deepEqual(sheet.rows[3],['',1,'','','','','','','','']);
 assert.deepEqual(sheet.rows[7],['',5,'Иванов Иван Иванович','Lada 2107','А123АА','Любитель\nСтандарт','Фронт','Тыл','','Wall']);
 assert.deepEqual(sheet.rows[11],['',9,'Иванов Иван Иванович','Lada 2107','А123АА','','','','129.9','']);
 assert.equal(sheet.rows.at(-1)[1],100);
});
test('cancelled records never reserve a paper row; all active sources and numbers above 100 stay visible',()=>{
 const [sheet]=buildGatePaperSheets(stage,[{status:'CANCELLED',participantNumber:7},{status:'ACTIVE',source:'ON_SITE',participantNumber:103,classes:[cls('139.9','BassRace',103)]}],'now');
 assert.deepEqual(sheet.rows[9],['',7,'','','','','','','','']);
 assert.equal(sheet.rows.at(-1)[1],103);
 assert.equal(sheet.rows.at(-1)[8],'139.9');
});
test('legacy SPL-parent classes route to their actual direction; unknown class is not lost',()=>{
 const [sheet]=buildGatePaperSheets(stage,[{status:'ACTIVE',participantNumber:1,classes:[cls('BFSPL 1','SPL',1),cls('BDW 2','SPL',1),cls('SPL Hurricane','SPL',1),cls('Custom','Unknown',1)]}],'now');
 assert.deepEqual(sheet.rows[3].slice(5),['[?] Unknown · Custom','BFSPL 1','BDW 2','','SPL Hurricane']);
});
test('ambiguous duplicate numbers fail explicitly',()=>{
 assert.throws(()=>buildGatePaperSheets(stage,[{status:'ACTIVE',participantNumber:1},{status:'ACTIVE',participantNumber:1}],'now'),/Дублирующийся/);
});

test('operator can select a smaller or larger paper number range',()=>{
 for(const count of [1,35,150,300]){
  const [sheet]=buildGatePaperSheets(stage,[],'now',count);
  assert.equal(sheet.rows.length,count+3);
  assert.equal(sheet.rows.at(-1)[1],count);
 }
});
test('selected range never hides an already allocated primary or BassRace sticker',()=>{
 const [sheet]=buildGatePaperSheets(stage,[{status:'ACTIVE',participantNumber:18,classes:[cls('129.9','BassRace',43)]}],'now',20);
 assert.equal(sheet.rows.at(-1)[1],43);
 assert.equal(sheet.rows.at(-1)[8],'129.9');
});
test('invalid number ranges are rejected',()=>{
 for(const value of [0,-1,1.5,NaN,Infinity,10001,'50']){
  assert.throws(()=>buildGatePaperSheets(stage,[],'now',value),/количество номеров/i);
 }
});
