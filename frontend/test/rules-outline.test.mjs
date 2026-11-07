import test from 'node:test';
import assert from 'node:assert/strict';
import {rulesHeadingLevel,rulesOutline} from '../src/rules-outline.ts';
const bold=text=>({type:'paragraph',text,runs:[{text,bold:true}]});
test('outline recognizes imported bold section and class titles, preserving source anchors',()=>{
 const blocks=[bold('3. Классы SPL и ограничения.'),{type:'paragraph',text:'Условия класса'},bold('SPL Limited 2.0'),bold('Gate 1-6.'),bold('Deadly Door')];
 assert.deepEqual(rulesOutline(blocks).map(x=>[x.id,x.title,x.level]),[
  ['rules-doc-heading-0',blocks[0].text,2],['rules-doc-heading-2','SPL Limited 2.0',3],['rules-doc-heading-3','Gate 1-6.',3],['rules-doc-heading-4','Deadly Door',3],
 ]);
});
test('decimal limits, ordinary numbered clauses, list items and bold warnings are not headings',()=>{
 for(const b of [bold('129.9 dB 139.9 dB 149.9 dB 159.9 dB'),{type:'paragraph',text:'1. Участник должен открыть дверь.'},bold('В классе запрещено участвовать Чемпионам России предыдущих лет!'),bold('*Так же, зеркало заднего вида может отсутствовать.'),{...bold('SPL Limited'),type:'list-item'}])assert.equal(rulesHeadingLevel(b),null,b.text);
 assert.equal(rulesHeadingLevel({type:'heading',text:'Общие условия',level:2}),2);
 assert.equal(rulesHeadingLevel({type:'paragraph',text:'Глава IV. Допуск'}),2);
});
test('partial emphasis is not reinterpreted as an imported heading',()=>{
 assert.equal(rulesHeadingLevel({type:'paragraph',text:'Направление SPL – Term Lab',runs:[{text:'Направление SPL – '},{text:'Term Lab',bold:true}]}),null);
});
