import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { resolveVehicleSelection } from './vehicle-catalog-validation';

const seed = readFileSync(join(process.cwd(),'catalogs','usd_cars.csv'),'utf8');
const selected=(brand:string,model:string,overrides:unknown={},previous?:{brand:string;model:string})=>
 resolveVehicleSelection(seed,overrides,brand,model,previous);

describe('car catalog enforcement',()=>{
 it('resolves trusted seed spellings without accepting other free text',()=>{
  expect(selected(' toyota ',' camry ')).toEqual({brand:'Toyota',model:'Camry'});
  expect(()=>selected('Toyota','Not-a-real-model')).toThrow(BadRequestException);
  expect(()=>selected('Unknown brand','Camry')).toThrow(BadRequestException);
 });
 it('rejects disabled and archived seed brands/models',()=>{
  expect(()=>selected('Toyota','Camry',{
   brands:[{id:'seed-brand:toyota',name:'Toyota',isActive:false}],
  })).toThrow(BadRequestException);
  expect(()=>selected('Toyota','Camry',{
   models:[{id:'seed-model:toyota|camry',brandId:'seed-brand:toyota',name:'Camry',isActive:true,isArchived:true}],
  })).toThrow(BadRequestException);
 });
 it('accepts only active models added by an administrator',()=>{
  const overrides={
   brands:[{id:'custom-brand',name:'Custom USD',isActive:true}],
   models:[{id:'custom-model',brandId:'custom-brand',name:'Demo Car',isActive:true}],
  };
  expect(selected('custom usd','demo car',overrides)).toEqual({brand:'Custom USD',model:'Demo Car'});
  expect(()=>selected('custom usd','made up',overrides)).toThrow(BadRequestException);
 });
 it('preserves historical pairs only when unchanged, never as an editing bypass',()=>{
  const old={brand:'Historical Import',model:'Model 2001'};
  expect(selected(' historical import ','model 2001',{},old)).toEqual(old);
  expect(()=>selected('Historical Import','Model 2002',{},old)).toThrow(BadRequestException);
 });
});
