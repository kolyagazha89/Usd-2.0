import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateConfigurationQuantities} from '../src/participant/configuration-quantity.ts';

const valid=()=>({
 audioComponents:[{quantity:2}],amplifiers:[{quantity:1}],
 batteries:[{quantity:6}],generators:[{quantity:2}],
});

test('configuration quantity validation accepts positive integer counts',()=>{
 assert.equal(validateConfigurationQuantities(valid()),null);
 assert.equal(validateConfigurationQuantities({...valid(),audioComponents:[{quantity:'08'}]}),null);
 assert.equal(validateConfigurationQuantities({...valid(),audioComponents:[]}),null);
});

test('configuration quantity validation rejects invalid or silently coerced values',()=>{
 for(const group of ['audioComponents','amplifiers','batteries','generators']){
  for(const quantity of [0,-1,1.5,'1.5','',null,Number.NaN,Number.POSITIVE_INFINITY,Number.MAX_SAFE_INTEGER+1]){
   const config={...valid(),[group]:[{quantity}]};
   assert.match(validateConfigurationQuantities(config),/целое количество/,
    group+' should reject '+String(quantity));
  }
 }
 assert.match(validateConfigurationQuantities({...valid(),amplifiers:null}),/Не удалось проверить/);
});

test('the configuration editor validates before save and never coerces invalid counts to one',async()=>{
 const editor=await readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8');
 assert.match(editor,/validateConfigurationQuantities\(v\)/);
 assert.doesNotMatch(editor,/Math\.max\(1,Number\(component\.quantity\)\|\|1\)/);
 assert.doesNotMatch(editor,/Math\.max\(1,Number\(amplifier\.quantity\)\|\|1\)/);
});
