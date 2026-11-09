import { BadRequestException } from '@nestjs/common';
import { assertVehicleDirectoryLinks } from './vehicle-overrides-validation';

const seed='марка,модель\nToyota,Camry\nToyota,Corolla\nВАЗ,2107\n';
const brand=(id:string,name:string,isActive=true)=>({id,name,isActive});
const model=(id:string,brandId:string,name:string,isActive=true)=>({id,brandId,name,isActive});
const check=(brands:ReturnType<typeof brand>[]=[],models:ReturnType<typeof model>[]=[])=>
 assertVehicleDirectoryLinks(seed,{brands,models});

describe('vehicle directory settings are validated as a whole, not only each JSON row',()=>{
 it('accepts valid admin-made brand and model, an existing seed override, and moving a seed model',()=>{
  expect(()=>check([brand('new-1','USD Motors')],[model('new-model-1','new-1','Sport')])).not.toThrow();
  expect(()=>check([brand('seed-brand:toyota','Toyota Deluxe')],[model('seed-model:toyota|camry','seed-brand:toyota','Camry Sport')])).not.toThrow();
  expect(()=>check([brand('new-1','USD Motors')],[model('seed-model:toyota|camry','new-1','Camry')])).not.toThrow();
 });
 it('rejects orphan models and models linked to misspelled or unknown IDs',()=>{
  expect(()=>check([],[model('new-model','does-not-exist','Unknown')])).toThrow(BadRequestException);
  expect(()=>check([],[model('new-model','seed-brand:notfound','Unknown')])).toThrow(BadRequestException);
 });
 it('rejects collisions with seeded brand names after whitespace/case normalization',()=>{
  expect(()=>check([brand('new-1','  tOYoTa  ')])).toThrow(BadRequestException);
  expect(()=>check([brand('a','USD Brand'),brand('b',' usd   brand ')])).toThrow(BadRequestException);
 });
 it('rejects collisions with seed and custom model names within each parent',()=>{
  expect(()=>check([],[model('new-1','seed-brand:toyota','CAMRY')])).toThrow(BadRequestException);
  expect(()=>check([],[model('a','seed-brand:toyota','Sport'),model('b','seed-brand:toyota',' sport ')])).toThrow(BadRequestException);
 });
 it('allows the same model name in different brands, but does not silently prefer disabled collisions',()=>{
  expect(()=>check([brand('new-1','USD Brand')],[model('new-1','new-1','Camry')])).not.toThrow();
  expect(()=>check([brand('new-1','USD Brand',false)],[model('new-1','new-1','Camry',false)])).not.toThrow();
  expect(()=>check([],[model('new-1','seed-brand:toyota','Camry',false)])).toThrow(BadRequestException);
 });
 it('treats seed overrides by ID, so legitimate name edits are not mistaken for duplicates',()=>{
  expect(()=>check([],[model('seed-model:toyota|camry','seed-brand:toyota','Camry 2')])).not.toThrow();
  expect(()=>check([brand('seed-brand:toyota','Toyota 2')])).not.toThrow();
 });
});
