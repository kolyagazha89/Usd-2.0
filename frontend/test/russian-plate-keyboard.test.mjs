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

test('all three entrypoints provide the same keypad and touch-only native keyboard suppression',async()=>{
 const [member,admin,gate,hook,keypad]=await Promise.all([
  '../src/App.tsx','../src/admin/CarsPage.tsx','../src/admin/InspectionsPage.tsx',
  '../src/participant/use-plate-keyboard.ts','../src/participant/RussianPlateKeypad.tsx',
 ].map(path=>readFile(new URL(path,import.meta.url),'utf8')));
 assert.match(member,/nativePlateKeyboard=useNativePlateKeyboard/);
 assert.match(admin,/nativePlateKeyboard=useNativePlateKeyboard/);
 assert.match(gate,/nativePlateKeyboard=useNativePlateKeyboard/);
 assert.equal(gate.split('<RussianPlateKeypad value={newPlate}').length-1,2);
 assert.match(gate,/setNewPlate\(formatPlateInput\(newCountry,e.target.value\)\)/);
 assert.equal(gate.split('if(!isValidPlate(newCountry,newPlate))').length-1,2);
 assert.match(hook,/\(pointer: coarse\)/);
 assert.match(keypad,/nextRussianPlateKeys\(value\)/);
});
