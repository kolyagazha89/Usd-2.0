import { BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
type Entry=Record<string,any>;
export type MergeInput={sourceId:string;targetId:string;scope:string};
const key=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
export function planBrandMerge(catalogs:Entry,input:MergeInput){
 if(!input||typeof input.sourceId!=='string'||typeof input.targetId!=='string'||typeof input.scope!=='string')throw new BadRequestException('Некорректные параметры объединения.');
 const brands:Entry[]=Array.isArray(catalogs.componentBrands)?catalogs.componentBrands:[],models:Entry[]=Array.isArray(catalogs.componentModels)?catalogs.componentModels:[];
 const source=brands.find(b=>b.id===input.sourceId),target=brands.find(b=>b.id===input.targetId);
 if(!source||!target||source.id===target.id||source.category!==target.category||source.isArchived||target.isArchived||target.isActive===false||!['ALL',source.category].includes(input.scope)||key(source.name)===key(target.name))throw new BadRequestException('Выберите разные действующие марки одной категории.');
 const sources=brands.filter(b=>key(b.name)===key(source.name)&&(input.scope==='ALL'||b.category===input.scope)&&!b.mergedIntoId);
 const nextBrands=brands.map(b=>({...b})),nextModels=models.map(m=>({...m}));
 const targets=new Map<string,Entry>();
 for(const item of sources){
  let dest=nextBrands.find(b=>b.category===item.category&&key(b.name)===key(target.name));
  if(dest&&(dest.isArchived||dest.isActive===false))throw new BadRequestException('Целевая марка в одной из категорий отключена или архивирована.');
  if(!dest){dest={id:randomUUID(),category:item.category,name:target.name,isActive:true};nextBrands.push(dest)}
  if(input.scope==='ALL'&&dest.name!==target.name){const previous=dest.name;dest.name=target.name;for(const model of nextModels)if(model.category===item.category&&key(model.brand)===key(previous))model.brand=target.name;}
  targets.set(item.category,dest);
  Object.assign(nextBrands.find(b=>b.id===item.id)!,{isActive:false,isArchived:true,mergedIntoId:dest.id});
 }
 let collisions=0;const moved:Entry[]=[];
 for(const m of nextModels){
  const dest=targets.get(m.category);if(!dest||key(m.brand)!==key(source.name))continue;
  const matches=nextModels.filter(n=>n.id!==m.id&&n.category===m.category&&key(n.brand)===key(dest.name)&&key(n.model)===key(m.model));
  const canonical=matches.find(n=>!n.isArchived&&n.isActive!==false);
  if(matches.length&&!canonical)throw new BadRequestException('Совпадающая модель целевой марки отключена или архивирована. Включите её или разрешите конфликт перед объединением.');
  m.brand=dest.name;
  if(canonical){collisions++;m.isActive=false;m.isArchived=true;m.mergedIntoId=canonical.id}
  moved.push({id:m.id,category:m.category,model:m.model,collision:!!canonical});
 }
 return {catalogs:{...catalogs,componentBrands:nextBrands,componentModels:nextModels},brands:sources.length,models:moved.length,collisions,moved};
}

/** Generic catalog updates may change active records, but may never rewrite or
 * delete a historical alias created by the audited brand-merge operation.
 * Only mergeBrands is allowed to introduce new `mergedIntoId` aliases.
 */
export function assertMergedCatalogAliasesPreserved(
 previous:Record<string,unknown>, incoming:Record<string,unknown>
):void {
 for(const [collection,fields] of [
  ['componentBrands',['category','name','mergedIntoId','isActive','isArchived']],
  ['componentModels',['category','brand','model','mergedIntoId','isActive','isArchived']],
 ] as const){
  const rows=incoming[collection];
  if(!Array.isArray(rows))continue; // other settings may be updated independently
  const original=Array.isArray(previous[collection])?previous[collection] as Entry[]:[];
  const next=rows as Entry[];
  const known=new Map(original.filter(e=>e&&typeof e.id==='string').map(e=>[e.id,e]));
  for(const before of original){
   if(!before?.mergedIntoId)continue;
   const after=next.find(e=>e?.id===before.id);
   if(!after||fields.some(field=>after[field]!==before[field]))
    throw new ConflictException('Объединённые записи справочника являются историческими и не могут быть изменены или удалены.');
  }
  if(next.some(e=>e?.mergedIntoId&&!known.get(e.id)?.mergedIntoId))
   throw new ConflictException('Создавать исторические связи объединения можно только через подтверждённое слияние марок.');
 }
}
