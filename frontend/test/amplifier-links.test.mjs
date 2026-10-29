import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {allocateAmplifierLinks} from '../src/participant/amplifier-links.ts';

test('one amplifier receives every installed component in its direction',()=>{
 const components=[{direction:'SUB',quantity:4},{direction:'FRONT',quantity:2}];
 assert.deepEqual(allocateAmplifierLinks(components,[{direction:'SUB'}]),[[{componentId:'0',quantity:4}]]);
 assert.equal(components[0].quantity,4,'source components remain unchanged');
});

test('multiple amplifiers share units without duplicating installed quantity',()=>{
 const components=[{direction:'SUB',quantity:5},{direction:'SUB',quantity:2},{direction:'FRONT',quantity:3}];
 const amplifiers=[{direction:'SUB'},{direction:'FRONT'},{direction:'SUB'}];
 const links=allocateAmplifierLinks(components,amplifiers);
 assert.deepEqual(links,[
  [{componentId:'0',quantity:3},{componentId:'1',quantity:1}],
  [{componentId:'2',quantity:3}],
  [{componentId:'0',quantity:2},{componentId:'1',quantity:1}],
 ]);
 for(let i=0;i<components.length;i++){
  const assigned=links.flat().filter(link=>link.componentId===String(i)).reduce((sum,link)=>sum+link.quantity,0);
  assert.equal(assigned,components[i].quantity);
 }
});

test('does not link a component to a different direction or create zero-quantity links',()=>{
 assert.deepEqual(allocateAmplifierLinks([{direction:'REAR',quantity:1}],[{direction:'REAR'},{direction:'REAR'},{direction:'SUB'}]),[
  [{componentId:'0',quantity:1}],[],[],
 ]);
 assert.deepEqual(allocateAmplifierLinks([{direction:'SUB',quantity:0},{direction:'SUB',quantity:NaN}],[{direction:'SUB'}]),[[]]);
 assert.deepEqual(allocateAmplifierLinks([{direction:'FRONT',quantity:2}],[]),[]);
});

test('configuration save uses the shared non-duplicating amplifier allocator',async()=>{
 const editor=await readFile(new URL('../src/admin/ConfigurationsPage.tsx',import.meta.url),'utf8');
 assert.match(editor,/allocateAmplifierLinks\(audioComponents,v\.amplifiers\?\?\[\]\)/);
 assert.match(editor,/componentLinks:amplifierLinks\[index\]/);
});
