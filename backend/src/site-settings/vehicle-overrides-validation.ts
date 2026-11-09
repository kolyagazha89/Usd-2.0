import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type BrandRow={id:string;name:string};
type ModelRow={id:string;brandId:string;name:string};
type Directory={brands:BrandRow[];models:ModelRow[]};

const key=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
const brandId=(name:string)=>'seed-brand:'+encodeURIComponent(key(name));
const modelId=(make:string,model:string)=>'seed-model:'+encodeURIComponent(key(make))+'|'+encodeURIComponent(key(model));

/**
 * Protect the complete effective automobile catalog from ambiguous choices.
 * Row-shape and duplicate-ID validation belongs to SiteSettingsService;
 * this additionally checks seed/overlay relationships and normalized names.
 *
 * Disabled and archived records also occupy their name/identity: allowing
 * duplicates here makes later restore and participant selection ambiguous.
 */
export function assertVehicleDirectoryLinks(seedCsv:string,overrides:Directory):void {
 const brands=new Map<string,BrandRow>(),models=new Map<string,ModelRow>();
 const lines=seedCsv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
 if(lines.shift()!=='марка,модель'||!lines.length)
  throw new InternalServerErrorException('Базовый справочник автомобилей USD повреждён.');
 for(const line of lines){
  const comma=line.indexOf(',');
  if(comma<1||comma===line.length-1||line.indexOf(',',comma+1)!==-1)
   throw new InternalServerErrorException('Базовый справочник автомобилей USD повреждён.');
  const make=line.slice(0,comma).trim(),name=line.slice(comma+1).trim();
  const bid=brandId(make);
  if(!brands.has(bid))brands.set(bid,{id:bid,name:make});
  const mid=modelId(make,name);
  models.set(mid,{id:mid,brandId:bid,name});
 }
 for(const row of overrides.brands)brands.set(row.id,row);
 for(const row of overrides.models)models.set(row.id,row);

 const brandKeys=new Set<string>();
 for(const b of brands.values()){
  const normalized=key(b.name);
  if(brandKeys.has(normalized))
   throw new BadRequestException('Название марки уже используется другой маркой автомобиля.');
  brandKeys.add(normalized);
 }
 const modelKeys=new Set<string>();
 for(const m of models.values()){
  if(!brands.has(m.brandId))
   throw new BadRequestException('Модель ссылается на несуществующую марку автомобиля.');
  const normalized=m.brandId+'|'+key(m.name);
  if(modelKeys.has(normalized))
   throw new BadRequestException('Название модели уже существует у выбранной марки автомобиля.');
  modelKeys.add(normalized);
 }
}

let bundledSeed:string|null=null;
/** Use the exact same published seed as participant make/model validation. */
export function assertBundledVehicleDirectoryLinks(directory:Directory):void {
 if(bundledSeed===null){
  try{bundledSeed=readFileSync(join(process.cwd(),'catalogs','usd_cars.csv'),'utf8');}
  catch{throw new InternalServerErrorException('Справочник автомобилей USD временно недоступен.');}
 }
 assertVehicleDirectoryLinks(bundledSeed,directory);
}
