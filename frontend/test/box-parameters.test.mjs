import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {boxFromDescription,withoutBoxLine,validateBoxParameters,isBoxConfigured,formatBoxLine} from '../src/participant/box-parameters.ts';

const box=(volume,tuning,type='ФИ')=>({type,volume,tuning});

test('legacy integer and decimal box lines round-trip without losing freeform notes',()=>{
 for(const [volume,tuning] of [['180','32'],['180.5','32.75'],['180,5','32,75']]){
  const original='Короб: ФИ · '+volume+' л · '+tuning+' Гц\n\nДополнительная заметка';
  const parsed=boxFromDescription(original);
  assert.deepEqual(parsed,box(volume.replace(',','.'),tuning.replace(',','.')));
  assert.equal(withoutBoxLine(original),'Дополнительная заметка');
  const saved=formatBoxLine(parsed)+withoutBoxLine(original);
  assert.equal(withoutBoxLine(saved),'Дополнительная заметка');
  assert.equal(boxFromDescription(saved).volume,parsed.volume);
 }
});

test('partial, non-finite, negative, zero, out-of-range and malformed values cannot be saved',()=>{
 assert.equal(validateBoxParameters(box('','')),null);
 assert.equal(isBoxConfigured(box('','')),false);
 for(const candidate of [
  box('180',''),box('','32'),box('0','32'),box('-1','32'),box('Infinity','32'),
  box('1e3','32'),box('12.345','32'),box('10001','32'),box('180','201'),
  box('180','0'),box('180','NaN'),box('180','-3'),box('180','32.333')
 ]){
  assert.ok(validateBoxParameters(candidate),JSON.stringify(candidate));
  assert.equal(isBoxConfigured(candidate),false);
  assert.equal(formatBoxLine(candidate),'');
 }
});

test('valid fractional parameters are normalized consistently',()=>{
 const candidate=box('00180,50','032,5','ЗЯ');
 assert.equal(validateBoxParameters(candidate),null);
 assert.equal(isBoxConfigured(candidate),true);
 assert.equal(formatBoxLine(candidate),'Короб: ЗЯ · 180.5 л · 32.5 Гц\n\n');
 assert.equal(withoutBoxLine('Свободное описание'),'Свободное описание');
 assert.deepEqual(boxFromDescription('Свободное описание'),box('','','ФИ'));
});

test('configuration editor uses validated decimal inputs and the shared serializer',async()=>{
 const editor=await readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8');
 assert.match(editor,/const boxError=validateBoxParameters\(box\)/);
 assert.match(editor,/key==='BOX'\?isBoxConfigured\(box\)/);
 assert.match(editor,/const boxLine=formatBoxLine\(box\)/);
 assert.match(editor,/Объём, л<input type="text" inputMode="decimal"/);
 assert.match(editor,/Настройка, Гц<input type="text" inputMode="decimal"/);
 assert.doesNotMatch(editor,/box\.volume.*replace\(\/\[\^0-9\]\//);
});
