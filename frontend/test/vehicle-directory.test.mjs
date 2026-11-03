import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseVehicleDirectoryCsv,modelsForVehicleMake,MAX_VEHICLE_CSV_BYTES} from '../src/vehicle-directory.ts';

test('Drom make/model staging seed is fully bundled without additional car attributes',async()=>{
 const raw=await readFile(new URL('../public/catalogs/usd_cars.csv',import.meta.url),'utf8');
 const data=parseVehicleDirectoryCsv(raw);
 assert.equal(data.makes.length,308);
 assert.equal(data.modelCount,4347);
 assert.ok(data.makes.includes('Toyota'));
 assert.ok(modelsForVehicleMake(data,' TOYOTA ').includes('Camry'));
 assert.deepEqual(modelsForVehicleMake(data,'not in directory'),[]);
 assert.equal(data.modelsByNormalizedMake.size,data.makes.length);
});

test('CSV recognizes Unicode BOM, quoted commas, CRLF and normalizes duplicate case',()=>{
 const directory=parseVehicleDirectoryCsv('\uFEFFмарка,модель\r\nTest,"A, B"\r\nTEST,"A, B"\r\nTest,"Model ""S"""\r\n');
 assert.deepEqual(directory.makes,['Test']);
 assert.deepEqual(modelsForVehicleMake(directory,'tEsT'),['A, B','Model "S"']);
 assert.equal(directory.modelCount,2);
});

test('invalid CSV and oversized inputs fail closed without creating suggestions',()=>{
 const invalid=[
  'марка,год\nToyota,Camry',
  'марка,модель,год\nToyota,Camry,2020',
  'марка,модель\nToyota,',
  'марка,модель\nToyota,Camry,2020',
  'марка,модель\nToyota,"Camry',
  'марка,модель\nToyota,"Camry"extra',
  'марка,модель\nToyota,"Camry\nExtra"',
 ];
 for(const sample of invalid)assert.throws(()=>parseVehicleDirectoryCsv(sample));
 assert.throws(()=>parseVehicleDirectoryCsv('x'.repeat(MAX_VEHICLE_CSV_BYTES+1)),/превышает/);
});

test('admin, participant and on-site forms show scoped autocomplete but retain manual input',async()=>{
 const [admin,member,gate,hook]=await Promise.all([
  readFile(new URL('../src/admin/CarsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/App.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/admin/InspectionsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/use-vehicle-directory.ts',import.meta.url),'utf8'),
 ]);
 for(const file of [admin,member,gate]){
  assert.match(file,/useVehicleDirectory\(\)/);
  assert.match(file,/modelsFor\(/);
  assert.match(file,/<datalist/);
  assert.match(file,/list="usd-/);
 }
 assert.match(hook,/fetch\('\/catalogs\/usd_cars\.csv'/);
 assert.doesNotMatch(hook,/throw new Error.*Неизвестная марка|apiPatch|apiPost/);
 assert.match(admin,/onChange=\{e=>setV\(\{\.\.\.v,brand:e\.target\.value/);
 assert.match(gate,/setNewBrand\(e\.target\.value\);setNewModel\(''\)/);
 assert.match(member,/brand:e\.target\.value,model:''/);
});
