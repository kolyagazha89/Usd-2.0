/** Editable overlay on top of the reviewed, bundled Drom make/model CSV.
 * Keep the 4,347 seed rows in static assets, not in the SiteSettings JSON.
 * Overlay entries use stable IDs and never rewrite participant cars.
 */
import {modelsForVehicleMake,type VehicleDirectory} from '../vehicle-directory';

export type VehicleBrand={id:string;name:string;isActive:boolean;isArchived?:boolean};
export type VehicleModel={id:string;brandId:string;name:string;isActive:boolean;isArchived?:boolean};
export type VehicleOverrides={brands:VehicleBrand[];models:VehicleModel[]};
export type VehicleCatalog={brands:VehicleBrand[];models:VehicleModel[]};
export const emptyVehicleOverrides=():VehicleOverrides=>({brands:[],models:[]});
export const vehicleNameKey=(s:string)=>s.trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
const clean=(s:string,max:number)=>{
 const value=s.trim().replace(/\s+/g,' ');
 if(!value||value.length>max||/[\u0000-\u001f\u007f]/.test(value))
  throw new Error('Название должно содержать от 1 до '+max+' символов.');
 return value;
};
const brandId=(make:string)=>'seed-brand:'+encodeURIComponent(vehicleNameKey(make));
const modelId=(make:string,model:string)=>'seed-model:'+encodeURIComponent(vehicleNameKey(make))+'|'+encodeURIComponent(vehicleNameKey(model));
const asList=<T>(input:unknown):T[]=>Array.isArray(input)?input as T[]:[];
export function resolveVehicleCatalog(seed:VehicleDirectory,overrides?:Partial<VehicleOverrides>|null):VehicleCatalog {
 const brands=new Map<string,VehicleBrand>(),models=new Map<string,VehicleModel>();
 for(const make of seed.makes){
  const id=brandId(make);
  brands.set(id,{id,name:make,isActive:true});
  for(const name of modelsForVehicleMake(seed,make)){
   const mid=modelId(make,name);
   models.set(mid,{id:mid,brandId:id,name,isActive:true});
  }
 }
 for(const b of asList<VehicleBrand>(overrides?.brands)){
  if(b&&typeof b.id==='string'&&typeof b.name==='string')brands.set(b.id,b);
 }
 for(const m of asList<VehicleModel>(overrides?.models)){
  if(m&&typeof m.id==='string'&&typeof m.brandId==='string'&&typeof m.name==='string'&&brands.has(m.brandId))models.set(m.id,m);
 }
 return {brands:[...brands.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru')),
  models:[...models.values()].sort((a,b)=>a.name.localeCompare(b.name,'ru'))};
}
export function availableVehicleDirectory(seed:VehicleDirectory,overrides?:Partial<VehicleOverrides>|null):VehicleDirectory {
 const {brands,models}=resolveVehicleCatalog(seed,overrides);
 const activeBrands=brands.filter(b=>b.isActive&&!b.isArchived);
 const availableNames=activeBrands.map(b=>b.name);
 const lookup=new Map(activeBrands.map(b=>[b.id,b] as const));
 const groups=new Map(availableNames.map(name=>[vehicleNameKey(name),[] as string[]] as const));
 let count=0;
 for(const model of models){
  const brand=lookup.get(model.brandId);
  if(!brand||!model.isActive||model.isArchived)continue;
  groups.get(vehicleNameKey(brand.name))?.push(model.name);
  count++;
 }
 for(const names of groups.values()) names.sort((a,b)=>a.localeCompare(b,'ru'));
 return {makes:availableNames,modelsByNormalizedMake:groups,modelCount:count};
}
function brand(c:VehicleCatalog,id:string){
 const found=c.brands.find(b=>b.id===id);
 if(!found)throw new Error('Марка отсутствует в справочнике. Обновите данные.');
 return found;
}
function model(c:VehicleCatalog,id:string){
 const found=c.models.find(m=>m.id===id);
 if(!found)throw new Error('Модель отсутствует в справочнике. Обновите данные.');
 return found;
}
function updateBrand(o:VehicleOverrides,item:VehicleBrand):VehicleOverrides {
 return {...o,brands:[...asList<VehicleBrand>(o.brands).filter(b=>b.id!==item.id),item]};
}
function updateModel(o:VehicleOverrides,item:VehicleModel):VehicleOverrides {
 return {...o,models:[...asList<VehicleModel>(o.models).filter(m=>m.id!==item.id),item]};
}
function uniqueBrand(c:VehicleCatalog,name:string,excludeId?:string){
 if(c.brands.some(b=>b.id!==excludeId&&vehicleNameKey(b.name)===vehicleNameKey(name)))
  throw new Error('Такая марка уже есть в справочнике.');
}
function uniqueModel(c:VehicleCatalog,brandId:string,name:string,excludeId?:string){
 if(c.models.some(m=>m.id!==excludeId&&m.brandId===brandId&&vehicleNameKey(m.name)===vehicleNameKey(name)))
  throw new Error('Такая модель уже есть у выбранной марки.');
}
export function saveVehicleBrand(c:VehicleCatalog,o:VehicleOverrides,id:string,name:string):VehicleOverrides {
 const value=clean(name,100);
 if(id){const item=brand(c,id);uniqueBrand(c,value,id);return updateBrand(o,{...item,name:value})}
 uniqueBrand(c,value);
 throw new Error('Для новой марки необходим уникальный идентификатор.');
}
export function addVehicleBrand(c:VehicleCatalog,o:VehicleOverrides,id:string,name:string):VehicleOverrides {
 const value=clean(name,100);
 if(!id||c.brands.some(b=>b.id===id))throw new Error('Неверный идентификатор марки.');
 uniqueBrand(c,value);
 return updateBrand(o,{id,name:value,isActive:true});
}
export function saveVehicleModel(c:VehicleCatalog,o:VehicleOverrides,id:string,name:string,targetBrand:string):VehicleOverrides {
 const item=model(c,id),value=clean(name,120),target=brand(c,targetBrand);
 if(!target.isActive||target.isArchived)throw new Error('Сначала включите выбранную марку.');
 uniqueModel(c,target.id,value,id);
 return updateModel(o,{...item,name:value,brandId:target.id});
}
export function addVehicleModel(c:VehicleCatalog,o:VehicleOverrides,id:string,brandId:string,name:string):VehicleOverrides {
 const target=brand(c,brandId),value=clean(name,120);
 if(!target.isActive||target.isArchived)throw new Error('Сначала включите выбранную марку.');
 if(!id||c.models.some(m=>m.id===id))throw new Error('Неверный идентификатор модели.');
 uniqueModel(c,brandId,value);
 return updateModel(o,{id,brandId,name:value,isActive:true});
}
export function archiveVehicleBrand(c:VehicleCatalog,o:VehicleOverrides,id:string):VehicleOverrides {
 return updateBrand(o,{...brand(c,id),isActive:false,isArchived:true});
}
export function archiveVehicleModel(c:VehicleCatalog,o:VehicleOverrides,id:string):VehicleOverrides {
 return updateModel(o,{...model(c,id),isActive:false,isArchived:true});
}
export function toggleVehicleBrand(c:VehicleCatalog,o:VehicleOverrides,id:string):VehicleOverrides {
 const item=brand(c,id);return updateBrand(o,{...item,isActive:!item.isActive||!!item.isArchived,isArchived:false});
}
export function toggleVehicleModel(c:VehicleCatalog,o:VehicleOverrides,id:string):VehicleOverrides {
 const item=model(c,id),parent=brand(c,item.brandId);
 if((!item.isActive||item.isArchived)&&(!parent.isActive||parent.isArchived))throw new Error('Сначала включите марку.');
 return updateModel(o,{...item,isActive:!item.isActive||!!item.isArchived,isArchived:false});
}
export function countDisabledVehicles(c:VehicleCatalog,brandScope:string|'ALL'){
 const selected=(id:string)=>brandScope==='ALL'||id===brandScope;
 const parents=new Set(c.brands.filter(b=>selected(b.id)&&!b.isArchived).map(b=>b.id));
 const brands=c.brands.filter(b=>parents.has(b.id)&&!b.isActive).length;
 const models=c.models.filter(m=>parents.has(m.brandId)&&!m.isActive&&!m.isArchived).length;
 return {brands,models,total:brands+models};
}
export function enableAllVehicles(c:VehicleCatalog,o:VehicleOverrides,brandScope:string|'ALL'):VehicleOverrides {
 const selected=(id:string)=>brandScope==='ALL'||id===brandScope;
 const parents=new Set(c.brands.filter(b=>selected(b.id)&&!b.isArchived).map(b=>b.id));
 let next=o;
 for(const b of c.brands)if(parents.has(b.id)&&!b.isActive)next=updateBrand(next,{...b,isActive:true});
 for(const m of c.models)if(parents.has(m.brandId)&&!m.isActive&&!m.isArchived)next=updateModel(next,{...m,isActive:true});
 return next;
}
/** Only additive preview; batching prevents growing the CMS JSON beyond API limits. */
export function planVehicleImport(c:VehicleCatalog,o:VehicleOverrides,source:VehicleDirectory,makeId:()=>string){
 let addedBrands=0,addedModels=0,skipped=0;
 let next=o;
 const existingBrands=new Map(c.brands.map(b=>[vehicleNameKey(b.name),b] as const));
 const modelKeys=new Set(c.models.map(m=>m.brandId+'|'+vehicleNameKey(m.name)));
 for(const make of source.makes){
  let item=existingBrands.get(vehicleNameKey(make));
  if(!item){
   const id=makeId();item={id,name:make,isActive:true};
   next=updateBrand(next,item);existingBrands.set(vehicleNameKey(make),item);addedBrands++;
  } else if(!item.isActive||item.isArchived){
   throw new Error('Марка '+make+' отключена или удалена. Сначала восстановите её.');
  }
  for(const name of modelsForVehicleMake(source,make)){
   const id=item.id+'|'+vehicleNameKey(name);
   if(modelKeys.has(id)){skipped++;continue}
   if(addedModels>=300)throw new Error('За один импорт можно добавить не более 300 новых моделей. Разделите CSV на части.');
   next=updateModel(next,{id:makeId(),brandId:item.id,name,isActive:true});
   modelKeys.add(id);addedModels++;
  }
 }
 return {overrides:next,addedBrands,addedModels,skipped};
}
