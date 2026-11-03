/** Safe, immutable catalog operations. Historical configurations retain their stored
 * brand/model strings and catalog IDs. "Delete" is archival, not data loss.
 */
export type CatalogBrand = {
 id:string; category:string; name:string; isActive?:boolean; isArchived?:boolean; [key:string]:unknown;
};
export type CatalogModel = {
 id:string; category:string; brand:string; model:string; isActive?:boolean; isArchived?:boolean; [key:string]:unknown;
};
export type ComponentCatalog = {
 componentBrands:CatalogBrand[]; componentModels:CatalogModel[]; [key:string]:unknown;
};
export type CatalogScope = string|'ALL';
export const normalizeCatalogName=(raw:string)=>raw.trim().replace(/\s+/g,' ');
const key=(raw:string)=>normalizeCatalogName(raw).toLocaleLowerCase('ru');

function validName(raw:string,max:number):string {
 const name=normalizeCatalogName(raw);
 if(!name||name.length>max||/[\u0000-\u001f\u007f]/.test(name))
  throw new Error('Укажите корректное название (до '+max+' символов).');
 return name;
}
function ensureBrand(c:ComponentCatalog,id:string):CatalogBrand {
 const item=c.componentBrands.find(b=>b.id===id);
 if(!item)throw new Error('Марка не найдена. Обновите справочник.');
 return item;
}
function ensureModel(c:ComponentCatalog,id:string):CatalogModel {
 const item=c.componentModels.find(m=>m.id===id);
 if(!item)throw new Error('Модель не найдена. Обновите справочник.');
 return item;
}
function ensureUniqueBrand(c:ComponentCatalog,name:string,category:string,id:string){
 if(c.componentBrands.some(b=>b.id!==id&&b.category===category&&key(b.name)===key(name)))
  throw new Error('Такая марка уже существует в этой категории.');
}
function ensureUniqueModel(c:ComponentCatalog,name:string,category:string,brand:string,id:string){
 if(c.componentModels.some(m=>m.id!==id&&m.category===category&&key(m.brand)===key(brand)&&key(m.model)===key(name)))
  throw new Error('Такая модель уже существует у выбранной марки.');
}
export function renameComponentBrand(c:ComponentCatalog,id:string,rawName:string):ComponentCatalog {
 const item=ensureBrand(c,id),name=validName(rawName,100);
 ensureUniqueBrand(c,name,item.category,id);
 return {...c,
  componentBrands:c.componentBrands.map(b=>b.id===id?{...b,name}:b),
  componentModels:c.componentModels.map(m=>m.category===item.category&&key(m.brand)===key(item.name)?{...m,brand:name}:m),
 };
}
export function editComponentModel(c:ComponentCatalog,id:string,rawName:string,targetBrand:string):ComponentCatalog {
 const item=ensureModel(c,id),name=validName(rawName,160);
 const brand=c.componentBrands.find(b=>b.category===item.category&&key(b.name)===key(targetBrand));
 if(!brand||brand.isArchived||brand.isActive===false)throw new Error('Выберите действующую марку.');
 ensureUniqueModel(c,name,item.category,brand.name,id);
 return {...c,componentModels:c.componentModels.map(m=>m.id===id?{...m,model:name,brand:brand.name}:m)};
}
export function toggleCatalogBrand(c:ComponentCatalog,id:string):ComponentCatalog {
 const item=ensureBrand(c,id),active=item.isActive===false||item.isArchived===true;
 return {...c,componentBrands:c.componentBrands.map(b=>b.id===id?{...b,isActive:active,isArchived:false}:b),
  componentModels:active?c.componentModels:c.componentModels.map(m=>m.category===item.category&&key(m.brand)===key(item.name)?{...m,isActive:false}:m)};
}
export function toggleCatalogModel(c:ComponentCatalog,id:string):ComponentCatalog {
 const item=ensureModel(c,id),active=item.isActive===false||item.isArchived===true;
 if(active&&!c.componentBrands.some(b=>b.category===item.category&&key(b.name)===key(item.brand)&&b.isActive!==false&&!b.isArchived))
  throw new Error('Сначала включите марку.');
 return {...c,componentModels:c.componentModels.map(m=>m.id===id?{...m,isActive:active,isArchived:false}:m)};
}
/** Archive even a used catalog value: never destroy IDs or rewrite historical snapshots. */
export function archiveCatalogBrand(c:ComponentCatalog,id:string):ComponentCatalog {
 const item=ensureBrand(c,id);
 return {...c,
  componentBrands:c.componentBrands.map(b=>b.id===id?{...b,isActive:false,isArchived:true}:b),
  componentModels:c.componentModels.map(m=>m.category===item.category&&key(m.brand)===key(item.name)?{...m,isActive:false}:m),
 };
}
export function archiveCatalogModel(c:ComponentCatalog,id:string):ComponentCatalog {
 ensureModel(c,id);
 return {...c,componentModels:c.componentModels.map(m=>m.id===id?{...m,isActive:false,isArchived:true}:m)};
}
export function activationCounts(c:ComponentCatalog,scope:CatalogScope){
 const chosen=(category:string)=>scope==='ALL'||category===scope;
 const brands=c.componentBrands.filter(b=>chosen(b.category)&&b.isActive===false&&!b.isArchived);
 const models=c.componentModels.filter(m=>chosen(m.category)&&m.isActive===false&&!m.isArchived
  &&c.componentBrands.some(b=>b.category===m.category&&key(b.name)===key(m.brand)&&!b.isArchived));
 return {brands:brands.length,models:models.length,total:brands.length+models.length};
}
/** Not a loop of per-item requests. One idempotent settings update per action. */
export function enableAllCatalogItems(c:ComponentCatalog,scope:CatalogScope):ComponentCatalog {
 const chosen=(category:string)=>scope==='ALL'||category===scope;
 const archivedBrands=new Set(c.componentBrands.filter(b=>b.isArchived).map(b=>b.category+'|'+key(b.name)));
 return {...c,
  componentBrands:c.componentBrands.map(b=>chosen(b.category)&&!b.isArchived?{...b,isActive:true}:b),
  componentModels:c.componentModels.map(m=>chosen(m.category)&&!m.isArchived
    &&!archivedBrands.has(m.category+'|'+key(m.brand))?{...m,isActive:true}:m),
 };
}
