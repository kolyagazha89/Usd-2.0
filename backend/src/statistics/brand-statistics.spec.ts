import {summarizeAudioBrands,canonicalAudioBrand} from './brand-statistics';

const registration=(snapshot:unknown)=>({configurationSnapshot:snapshot});

describe('season sponsor audio brands',()=>{
 it('normalizes transliterations, punctuation and known sub-brand spellings without guessing unrelated labels',()=>{
  for(const name of ['Russian Bass','russian bass','RUSSIAN-BASS','RussianBass','рашн басс','Рашн-Басс','рашн бас']){
   expect(canonicalAudioBrand(name)).toBe('Russian Bass');
  }
  for(const name of ['Deaf Bonce','deafbonce','DEAF-BONCE','Деф Бонс','Apocalypse','Apocalypce','Апокалипсис','Deaf Bonce Apocalypse']){
   expect(canonicalAudioBrand(name)).toBe('Deaf Bonce');
  }
  expect(canonicalAudioBrand('Pride')).toBe('Pride');
  expect(canonicalAudioBrand(' pride ')).toBe('Pride');
  expect(canonicalAudioBrand('Pride Audio')).toBe('Pride Audio');
  expect(canonicalAudioBrand('Russian Bassy')).not.toBe('Russian Bass');
  expect(canonicalAudioBrand(null)).toBeNull();
  expect(canonicalAudioBrand('  ')).toBeNull();
 });

 it('counts each configuration brand once per registration and never counts battery/generator/headunit labels',()=>{
  const output=summarizeAudioBrands([
   registration({audioComponents:[
    {brand:'russian bass',model:'15 inch',quantity:2},
    {brand:'Рашн Басс',model:'12 inch',quantity:4},
    {brand:'Apocalypce'},
   ],amplifiers:[{brand:'DEAF BONCE'},{brand:'deaf-bonce'}],
   batteries:[{brand:'Battery Only'}],generators:[{brand:'Generator Only'}],headUnits:[{brand:'HeadUnit Only'}]}),
   registration({audioComponents:[{brand:'Russian Bass'},{brand:'Pride'}],amplifiers:[{brand:'Deaf Bonce'},{brand:'Pride'}]}),
   registration({audioComponents:[{brand:' '},{brand:null}],amplifiers:[],batteries:[{brand:'Battery Only'}]}),
   registration(null),
  ]);
  expect(output.speakerBrands).toEqual([
   {brand:'Russian Bass',count:2,percent:50},
   {brand:'Deaf Bonce',count:1,percent:25},
   {brand:'Pride',count:1,percent:25},
  ]);
  expect(output.amplifierBrands).toEqual([
   {brand:'Deaf Bonce',count:2,percent:50},
   {brand:'Pride',count:1,percent:25},
  ]);
  expect(output.configurationBrands).toEqual([
   {brand:'Deaf Bonce',count:2,percent:50},
   {brand:'Russian Bass',count:2,percent:50},
   {brand:'Pride',count:1,percent:25},
  ]);
  for(const key of ['Battery Only','Generator Only','HeadUnit Only']){
   expect(JSON.stringify(output)).not.toContain(key);
  }
 });

 it('reads only non-empty string brands from saved snapshot arrays, ignores malformed objects, and keeps output deterministic',()=>{
  const raw={audioComponents:[null,{},'not an object',{brand:17},{brand:'Kicx'},{brand:'kicx'},{brand:'JBL'}],
   amplifiers:[{brand:'KICX'}],generators:[{brand:'Kicx'}]};
  const frozen=JSON.stringify(raw);
  const output=summarizeAudioBrands([registration(raw),registration({audioComponents:{brand:'Unsafe'}})]);
  expect(output.speakerBrands).toEqual([{brand:'JBL',count:1,percent:50},{brand:'Kicx',count:1,percent:50}]);
  expect(output.amplifierBrands).toEqual([{brand:'Kicx',count:1,percent:50}]);
  expect(JSON.stringify(raw)).toBe(frozen);
 });
});
