import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {nextRussianPlateKeys} from '../src/participant/russian-plate-keyboard.ts';
import {formatPlateInput,isValidPlate} from '../src/profile-validation.ts';

const letters='АВЕКМНОРСТУХ';
const digits='0123456789';
const keysAt=(value)=>nextRussianPlateKeys(value).join('');

test('plate keypad presents only Cyrillic letters and digits at the correct position',()=>{
 assert.equal(keysAt(''),letters);
 assert.equal(keysAt('А'),digits);
 assert.equal(keysAt('А1'),digits);
 assert.equal(keysAt('А12'),digits);
 assert.equal(keysAt('А123'),letters);
 assert.equal(keysAt('А123В'),letters);
 assert.equal(keysAt('А123ВС'),digits);
 assert.equal(keysAt('А123ВС7'),digits);
 assert.equal(keysAt('А123ВС77'),digits);
 assert.equal(keysAt('А123ВС777'),'');
});

test('keys and input mask reject Cyrillic not allowed in a Russian plate',()=>{
 assert.equal(formatPlateInput('RU','Д123ЯЯ77'),'12377'.slice(0,0));
 assert.equal(formatPlateInput('RU','A123BC77'),'А123ВС77');
 assert.equal(isValidPlate('RU','А123ВС77'),true);
 assert.equal(isValidPlate('RU','А123ВС777'),true);
 assert.equal(isValidPlate('RU','А123ВС000'),false);
});

test('all car entrypoints use the native OS keyboard and shared plate input mask',async()=>{
 const [member,admin,gate]=await Promise.all([
  '../src/App.tsx','../src/admin/CarsPage.tsx','../src/admin/InspectionsPage.tsx',
 ].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
 for(const source of [member,admin,gate]){
  assert.doesNotMatch(source,/<RussianPlateKeypad/);
  assert.doesNotMatch(source,/useNativePlateKeyboard/);
  assert.doesNotMatch(source,/inputMode=\{[^}]*'none'/);
  assert.doesNotMatch(source,/readOnly=\{[^}]*nativePlateKeyboard/);
  assert.match(source,/inputMode="text"/);
 }
 assert.match(gate,/setNewPlate\(formatPlateInput\(newCountry,/);
 assert.equal(gate.split('if(!isValidPlate(newCountry,newPlate))').length-1,2);
});
