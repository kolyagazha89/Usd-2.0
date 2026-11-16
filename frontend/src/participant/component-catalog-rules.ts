/** Shared catalog rules for the participant equipment editor.
 * The category of a subwoofer is not interchangeable with a midrange driver.
 * Discontinued but published models remain selectable; inactive entries do not.
 */
export type EquipmentKind='audioComponents'|'amplifiers'|'headUnits';
export type CatalogModel={id?:unknown;category?:unknown;brand?:unknown;model?:unknown;isActive?:unknown};
export type EquipmentRow={id?:unknown;catalogEntryId?:unknown;type?:unknown;direction?:unknown;quantity?:unknown;brand?:unknown;model?:unknown};

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
   &&String(previous.catalogEntryId??'').trim()===String(row.catalogEntryId??'').trim()
   &&String(previous.direction??'')===String(row.direction??'')
   &&Number(previous.quantity??1)===Number(row.quantity??1)
   &&(kind!=='audioComponents'||previous.type===row.type);
 });
}


/** A new equipment model is valid even without a catalog match. Names stay
 * independent of catalog publication and are stored in the version snapshot. */
export function findInvalidEquipmentNameRow(rows:unknown):EquipmentRow|null{
 if(!Array.isArray(rows))return {brand:'',model:''};
 for(const candidate of rows){
  if(!candidate||typeof candidate!=='object'||Array.isArray(candidate))return {brand:'',model:''};
  const row=candidate as EquipmentRow;
  const brand=String(row.brand??'').trim(),model=String(row.model??'').trim();
  if(!brand||!model||brand.length>100||model.length>160)return row;
 }
 return null;
}

/** Resolve a trusted ID only for an active catalog match, or for an unchanged
 * historical row referencing a retired entry. Edits to a manual/retired model
 * must never carry its previous catalog ID into a new version. */
export function resolveEquipmentCatalogId(
 models:unknown,kind:EquipmentKind,row:EquipmentRow,previousRows:unknown,
):string|null{
 const brand=normalized(row.brand),model=normalized(row.model);
 const active=availableCatalogModels(models,kind,row.type).find(entry=>
  Boolean(String(entry.id??'').trim())&&normalized(entry.brand)===brand
  &&normalized(entry.model)===model);
 if(active)return String(active.id);
 if(row.catalogEntryId&&isUnchangedLegacyCatalogRow(previousRows,kind,row))return String(row.catalogEntryId);
 return null;
}

/** A battery type is a CMS code, not free-form manufacturer text. Retired
 * types may be retained unchanged in old configurations, never added anew.
 * This mirrors the server-side multiset exception for imported batteries.
 */
export function findUnapprovedBatteryRow(
 batteryTypes:unknown,rows:unknown,previousRows:unknown,
):EquipmentRow|null{
 if(!Array.isArray(rows))return {brand:'',model:''};
 const active=Array.isArray(batteryTypes)?batteryTypes:[];
 const previous=Array.isArray(previousRows)?previousRows:[];
 const consumed=new Set<number>();
 for(const candidate of rows){
  if(!candidate||typeof candidate!=='object')return {brand:'',model:''};
  const row=candidate as EquipmentRow;
  const code=String(row.brand??'');
  if(code&&active.some(entry=>entry&&typeof entry==='object'
   &&(entry as {code?:unknown}).code===code
   &&(entry as {isActive?:unknown}).isActive!==false))continue;
  const index=previous.findIndex((old,i)=>{
   if(consumed.has(i)||!old||typeof old!=='object')return false;
   const saved=old as EquipmentRow;
   return normalized(saved.brand)===normalized(row.brand)
    &&normalized(saved.model)===normalized(row.model)
    &&String(saved.quantity??'')===String(row.quantity??'');
  });
  if(index>=0){consumed.add(index);continue;}
  return row;
 }
 return null;
}
