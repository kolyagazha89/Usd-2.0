import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAudioCatalogCsv,planAudioCatalogImport,MAX_AUDIO_CSV_BYTES} from '../src/admin/catalog-csv-import.ts';

test('official USD audio CSV: BOM, quoted commas and escaped quotes, Windows line endings',()=>{
 const rows=parseAudioCatalogCsv('\uFEFFбренд,модель,категория\r\nУрал,"АК-3 ""Шаляпин""",AUDIO_COMPONENT\r\nKicx,"Model, 2",AMPLIFIER\r\n');
 assert.deepEqual(rows,[
  {brand:'Урал',model:'АК-3 "Шаляпин"',category:'AUDIO_COMPONENT'},
  {brand:'Kicx',model:'Model, 2',category:'AMPLIFIER'},
 ]);
});
test('duplicate entries are removed without changing their category or names',()=>{
 const rows=parseAudioCatalogCsv('бренд,модель,категория\nKicx,Uno,SUBWOOFER\nkicx,UNO,SUBWOOFER\n');
 assert.equal(rows.length,1);
 assert.throws(()=>parseAudioCatalogCsv('бренд,модель,категория\nKicx,Uno,SUBWOOFER\nKicx,Uno,AMPLIFIER\n'),/разных категориях/);
});
test('strict header, malformed quotes, missing fields, unsupported classes and oversized files fail closed',()=>{
 const invalid=[
  'бренд,модель\nKicx,Uno',
  'бренд,модель,категория\nKicx,Uno,NOT_SUPPORTED',
  'бренд,модель,категория\nKicx,Uno',
  'бренд,модель,категория\nKicx,"Uno',
  'бренд,модель,категория\nKicx,"Uno"junk,AMPLIFIER',
  'бренд,модель,категория\nKicx,"Uno\nII",AMPLIFIER',
 ];
 for(const entry of invalid)assert.throws(()=>parseAudioCatalogCsv(entry),Error);
 assert.throws(()=>parseAudioCatalogCsv('x'.repeat(MAX_AUDIO_CSV_BYTES+1)),/лимит/);
});
test('import is additive and idempotent, leaves existing stable IDs and retired models unchanged',()=>{
 const existing={componentBrands:[{id:'old-brand',category:'AMPLIFIER',name:'Kicx',isActive:true}],
  componentModels:[{id:'old-model',category:'AMPLIFIER',brand:'Kicx',model:'Uno',isActive:false,lifecycle:'DISCONTINUED'}],
  batteryTypes:[{code:'LTO',isActive:true}]};
 const rows=parseAudioCatalogCsv('бренд,модель,категория\nKicx,Uno,AMPLIFIER\nKicx,Two,AMPLIFIER\nDeaf Bonce,Apocalypse 15,SUBWOOFER\n');
 let n=0;const next=planAudioCatalogImport(existing,rows,()=>String(++n));
 assert.equal(next.addedBrands,1);assert.equal(next.addedModels,2);assert.equal(next.unchangedModels,1);
 assert.equal(next.catalogs.componentBrands[0].id,'old-brand');
 assert.equal(next.catalogs.componentModels[0].id,'old-model');
 assert.equal(next.catalogs.componentModels[0].isActive,false);
 assert.deepEqual(next.catalogs.batteryTypes,existing.batteryTypes);
 assert.equal(existing.componentModels.length,1,'planning does not mutate the existing CMS');
 const repeat=planAudioCatalogImport(next.catalogs,rows,()=>String(++n));
 assert.equal(repeat.addedModels,0);assert.equal(repeat.addedBrands,0);
 assert.deepEqual(repeat.catalogs,next.catalogs);
});
test('inactive brands require explicit review before import, not silent reactivation',()=>{
 const rows=parseAudioCatalogCsv('бренд,модель,категория\nKicx,Two,AMPLIFIER\n');
 assert.throws(()=>planAudioCatalogImport({componentBrands:[{id:'id',category:'AMPLIFIER',name:'Kicx',isActive:false}]},rows,()=>''),/отключена/);
});
test('CSV planner does not trigger network calls, and catalog UI must have an explicit preview and confirmation',async()=>{
 const fs=await import('node:fs/promises');
 const page=await fs.readFile(new URL('../src/admin/CatalogPage.tsx',import.meta.url),'utf8');
 assert.match(page,/parseAudioCatalogCsv/);
 assert.match(page,/planAudioCatalogImport/);
 assert.match(page,/Предпросмотр импорта/);
 assert.match(page,/Подтверждаю добавление/);
 assert.match(page,/updateSiteSettings\(\{catalogs:merged\.catalogs\}\)/,
  'import uses only partial CMS PATCH and never overwrites unrelated settings');
});
