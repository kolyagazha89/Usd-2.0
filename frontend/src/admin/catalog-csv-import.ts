/** An explicit, preview-first import for the official USD equipment CSV.
 * No network requests or database writes occur in this module.
 * Stable IDs and inactive/historical catalog entries are never overwritten.
 */
export type AudioCatalogCategory='AUDIO_COMPONENT'|'AMPLIFIER'|'SUBWOOFER'|'HEAD_UNIT'|'DSP';
export type AudioCsvRow={brand:string;model:string;category:AudioCatalogCategory};
type ExistingCatalog={componentBrands?:unknown;componentModels?:unknown;[key:string]:unknown};
type CatalogItem={id?:unknown;category?:unknown;name?:unknown;brand?:unknown;model?:unknown;isActive?:unknown;[key:string]:unknown};

const CATEGORIES=new Set<AudioCatalogCategory>(['AUDIO_COMPONENT','AMPLIFIER','SUBWOOFER','HEAD_UNIT','DSP']);
const key=(value:unknown)=>String(value??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');
const toObjects=(input:unknown):CatalogItem[]=>Array.isArray(input)?input.filter((item):item is CatalogItem=>!!item&&typeof item==='object'&&!Array.isArray(item)):[];
export const MAX_AUDIO_CSV_BYTES=1024*1024;

function parseCells(source:string):string[][]{
 const rows:string[][]=[];
 let fields:string[]=[],value='',quoted=false,closed=false;
 const emitField=()=>{fields.push(value.trim());value='';closed=false};
 const emitRow=()=>{emitField();if(fields.some(cell=>cell.length))rows.push(fields);fields=[]};
 for(let i=0;i<source.length;i++){
  const ch=source[i];
  if(quoted){
   if(ch==='"'&&source[i+1]==='"'){value+='"';i++;continue}
   if(ch==='"'){quoted=false;closed=true;continue}
   if(ch==='\r'||ch==='\n')throw new Error('Перенос строки внутри названия модели не поддерживается.');
   value+=ch;continue;
  }
  if(ch==='"'){
   if(value.length||closed)throw new Error('Некорректные кавычки в CSV.');
   quoted=true;continue;
  }
  if(ch===','||ch==='\n'||ch==='\r'){
   if(ch===',')emitField();
   else{emitRow();if(ch==='\r'&&source[i+1]==='\n')i++}
   continue;
  }
  if(closed){
   if(ch===' '||ch==='\t')continue;
   throw new Error('После закрывающих кавычек должен быть разделитель CSV.');
  }
  value+=ch;
 }
 if(quoted)throw new Error('В CSV обнаружены незакрытые кавычки.');
 if(value.length||fields.length||closed)emitRow();
 return rows;
}

export function parseAudioCatalogCsv(source:string):AudioCsvRow[]{
 if(new TextEncoder().encode(source).byteLength>MAX_AUDIO_CSV_BYTES)
  throw new Error('CSV превышает лимит 1 МБ.');
 const rows=parseCells(source.replace(/^\uFEFF/,''));
 if(rows.length<2)throw new Error('В CSV отсутствуют модели оборудования.');
 const header=rows.shift()!.map(key);
 if(!(['бренд,модель,категория','brand,model,category'].includes(header.join(','))))
  throw new Error('Нужны ровно три столбца: бренд,модель,категория.');
 if(rows.length>15000)throw new Error('Слишком много моделей в одном файле.');
 const seen=new Map<string,AudioCatalogCategory>();
 const result:AudioCsvRow[]=[];
 rows.forEach((fields,index)=>{
  if(fields.length!==3)throw new Error('Строка '+(index+2)+': ожидаются три столбца.');
  const [brand,model,rawCategory]=fields;
  const category=rawCategory.toUpperCase() as AudioCatalogCategory;
  if(!brand||!model||brand.length>100||model.length>160||!CATEGORIES.has(category)
   ||[brand,model].some(s=>/[\u0000-\u001f\u007f]/.test(s)))
   throw new Error('Строка '+(index+2)+': неверная марка, модель или категория.');
  const productKey=key(brand)+'|'+key(model);
  const previousCategory=seen.get(productKey);
  if(previousCategory&&previousCategory!==category)
   throw new Error('Строка '+(index+2)+': модель '+brand+' '+model+' встречается в разных категориях.');
  if(previousCategory)continue;
  seen.set(productKey,category);
  result.push({brand,model,category});
 });
 if(!result.length)throw new Error('В CSV нет допустимых моделей.');
 return result;
}

export function planAudioCatalogImport(
 existing:ExistingCatalog,rows:AudioCsvRow[],makeId:()=>string,
):{catalogs:ExistingCatalog;addedBrands:number;addedModels:number;unchangedModels:number}{
 const oldBrands=toObjects(existing.componentBrands),oldModels=toObjects(existing.componentModels);
 const brands=[...oldBrands],models=[...oldModels];
 const knownBrands=new Map(oldBrands.map(item=>[key(item.category)+'|'+key(item.name),item]));
 const knownModels=new Set(oldModels.map(item=>key(item.category)+'|'+key(item.brand)+'|'+key(item.model)));
 let addedBrands=0,addedModels=0,unchangedModels=0;
 for(const row of rows){
  if(!CATEGORIES.has(row.category))throw new Error('Недопустимая категория '+row.category);
  const brandKey=key(row.category)+'|'+key(row.brand);
  const modelKey=brandKey+'|'+key(row.model);
  if(knownModels.has(modelKey)){unchangedModels++;continue}
  const existingBrand=knownBrands.get(brandKey);
  if(existingBrand?.isActive===false)
   throw new Error('Марка '+row.brand+' отключена в '+row.category+'. Сначала включите её вручную.');
  if(!existingBrand){
   const added={id:makeId(),category:row.category,name:row.brand,isActive:true};
   brands.push(added);knownBrands.set(brandKey,added);addedBrands++;
  }
  models.push({id:makeId(),category:row.category,brand:row.brand,model:row.model,
   isActive:true,lifecycle:'UNKNOWN',sourceType:'CSV_IMPORT'});
  knownModels.add(modelKey);addedModels++;
 }
 return {catalogs:{...existing,componentBrands:brands,componentModels:models},
  addedBrands,addedModels,unchangedModels};
}
