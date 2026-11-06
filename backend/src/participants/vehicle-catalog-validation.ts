import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Brand = {id:string;name:string;isActive:boolean;isArchived:boolean};
type Model = {id:string;brandId:string;name:string;isActive:boolean;isArchived:boolean};
type Vehicle = {brand:string;model:string};

const key=(value:unknown)=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
const active=(entry:{isActive:boolean;isArchived:boolean})=>entry.isActive&&!entry.isArchived;
const array=(value:unknown):Record<string,unknown>[]=>Array.isArray(value)
 ? value.filter(item=>item!==null&&typeof item==='object'&&!Array.isArray(item)) as Record<string,unknown>[]
 : [];
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)
 ? value as Record<string,unknown> : {};

/** Pure resolver shared by service code and regression tests.
 * The bundled 4,347-row seed is the same Git blob as the public catalog.
 * Admin overrides take precedence, including disabling or renaming seed rows.
 */
export function resolveVehicleSelection(
 seedCsv:string, overrides:unknown, inputBrand:string, inputModel:string,
 previous?:Vehicle|null,
):Vehicle {
 // A legacy imported car can stay unchanged, but no changed/unlisted pair can
 // be created or selected. This also permits color/visibility/plate edits.
 if(previous&&key(previous.brand)===key(inputBrand)&&key(previous.model)===key(inputModel))
  return {brand:previous.brand,model:previous.model};
 const brands=new Map<string,Brand>(),models=new Map<string,Model>();
 const lines=seedCsv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
 if(lines.shift()!=='марка,модель'||lines.length!==4347)
  throw new InternalServerErrorException('Базовый справочник автомобилей USD повреждён.');
 for(const line of lines){
  const comma=line.indexOf(',');
  if(comma<1||comma===line.length-1||line.indexOf(',',comma+1)!==-1)
   throw new InternalServerErrorException('Базовый справочник автомобилей USD повреждён.');
  const make=line.slice(0,comma).trim(),model=line.slice(comma+1).trim();
  const id='seed-brand:'+encodeURIComponent(key(make));
  if(!brands.has(id))brands.set(id,{id,name:make,isActive:true,isArchived:false});
  const mid='seed-model:'+encodeURIComponent(key(make))+'|'+encodeURIComponent(key(model));
  models.set(mid,{id:mid,brandId:id,name:model,isActive:true,isArchived:false});
 }
 const overlay=record(overrides);
 for(const row of array(overlay.brands)){
  if(typeof row.id!=='string'||typeof row.name!=='string')continue;
  brands.set(row.id,{id:row.id,name:row.name,isActive:row.isActive===true,isArchived:row.isArchived===true});
 }
 for(const row of array(overlay.models)){
  if(typeof row.id!=='string'||typeof row.brandId!=='string'||typeof row.name!=='string')continue;
  models.set(row.id,{id:row.id,brandId:row.brandId,name:row.name,isActive:row.isActive===true,isArchived:row.isArchived===true});
 }
 for(const brand of brands.values()){
  if(!active(brand)||key(brand.name)!==key(inputBrand))continue;
  for(const model of models.values()){
   if(model.brandId===brand.id&&active(model)&&key(model.name)===key(inputModel))
    return {brand:brand.name,model:model.name};
  }
 }
 throw new BadRequestException(
  'Марка и модель автомобиля отсутствуют в активном справочнике USD. Выберите их из подсказок или обратитесь к администратору.',
 );
}

let seedCsv:string|null=null;
/** Validates every new make/model against the published active catalog. */
export function assertVehicleCatalogSelection(
 catalogs:unknown,brand:string,model:string,previous?:Vehicle|null,
):Vehicle {
 if(seedCsv===null){
  try {seedCsv=readFileSync(join(process.cwd(),'catalogs','usd_cars.csv'),'utf8');}
  catch {throw new InternalServerErrorException('Справочник автомобилей USD временно недоступен.');}
 }
 const overlay=record(catalogs).vehicleDirectory;
 return resolveVehicleSelection(seedCsv,overlay,brand,model,previous);
}
