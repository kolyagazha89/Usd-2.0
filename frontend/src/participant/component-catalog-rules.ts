/** Shared catalog rules for the participant equipment editor.
 * The category of a subwoofer is not interchangeable with a midrange driver.
 * Discontinued but published models remain selectable; inactive entries do not.
 */
export type EquipmentKind='audioComponents'|'amplifiers'|'headUnits';
export type CatalogModel={id?:unknown;category?:unknown;brand?:unknown;model?:unknown;isActive?:unknown};
export type EquipmentRow={id?:unknown;type?:unknown;direction?:unknown;quantity?:unknown;brand?:unknown;model?:unknown};

const normalized=(value:unknown)=>String(value??'').trim().toLocaleLowerCase('ru');

export function catalogCategoryForEquipment(kind:EquipmentKind,type?:unknown):string{
 if(kind==='amplifiers')return 'AMPLIFIER';
 if(kind==='headUnits')return 'HEAD_UNIT';
 return type==='SUBWOOFER'?'SUBWOOFER':'AUDIO_COMPONENT';
}

export function availableCatalogModels(models:unknown,kind:EquipmentKind,type?:unknown):CatalogModel[]{
 if(!Array.isArray(models))return [];
 const category=catalogCategoryForEquipment(kind,type);
 return models.filter((entry:unknown):entry is CatalogModel=>{
  if(!entry||typeof entry!=='object'||Array.isArray(entry))return false;
  const model=entry as CatalogModel;
  return model.category===category&&model.isActive!==false&&Boolean(normalized(model.brand))&&Boolean(normalized(model.model));
 });
}

export function isApprovedCatalogModel(models:unknown,kind:EquipmentKind,row:EquipmentRow):boolean{
 const brand=normalized(row.brand),model=normalized(row.model);
 if(!brand||!model)return false;
 return availableCatalogModels(models,kind,row.type).some(entry=>normalized(entry.brand)===brand&&normalized(entry.model)===model);
}

/** Existing imported equipment can be retained unchanged, even if its catalog
 * entry is now inactive. It must not become a bypass for newly added rows,
 * renamed models, or a component whose type was changed to SUBWOOFER.
 */
export function isUnchangedLegacyCatalogRow(initialRows:unknown,kind:EquipmentKind,row:EquipmentRow):boolean{
 if(!Array.isArray(initialRows))return false;
 return initialRows.some((original:unknown)=>{
  if(!original||typeof original!=='object')return false;
  const previous=original as EquipmentRow;
  if(row.id!=null||previous.id!=null){
   if(row.id==null||previous.id==null||String(row.id)!==String(previous.id))return false;
  }
  return normalized(previous.brand)===normalized(row.brand)
   &&normalized(previous.model)===normalized(row.model)
   &&(kind!=='audioComponents'||previous.type===row.type);
 });
}
