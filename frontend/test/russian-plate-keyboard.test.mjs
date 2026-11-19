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


test('RU plate input accepts two-digit codes and legal 1–9-prefixed extensions, including 193',()=>{
 const examples=['01','20','77','88','93','99','101','147','155','166','180','181','182','183','184','185','193','198','224','250','252','323','550','778','997'];
 for(const region of examples){
  const plate='У623РН'+region;
  assert.equal(formatPlateInput('RU',plate),plate,region+' input mask');
  assert.equal(isValidPlate('RU',plate),true,region+' region');
 }
 // Ministry of Internal Affairs order 766 permits a leading digit 1–9 for
 // three-digit codes. Do not require every new allocation to ship a code change.
 for(let base=1;base<=99;base++){
  const suffix=String(base).padStart(2,'0');
  for(const prefix of ['',...'123456789']){
   assert.equal(isValidPlate('RU','А123ВС'+prefix+suffix),true,'region '+prefix+suffix);
  }
 }
 for(const region of ['00','000','001','100','200','900']){
  assert.equal(isValidPlate('RU','А123ВС'+region),false,region+' invalid region structure');
 }
});

test('RU plate validation accepts Latin lookalikes and common pasted separators',()=>{
 for(const plate of ['Y623PH193','У 623 РН-193','У623РН|193','у623рн193']){
  assert.equal(isValidPlate('RU',plate),true,plate);
 }
 assert.equal(isValidPlate('RU','Д623ЯЯ193'),false,'unsupported Cyrillic letters');
 assert.equal(isValidPlate('RU','У623РН1934'),false,'four-digit region');
});
