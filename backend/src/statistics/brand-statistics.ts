/**
 * Read-only season sponsor analytics. Use frozen registration snapshots so
 * later catalog edits do not rewrite history. Brand aliases affect reporting
 * only: neither the configuration nor catalog entries are modified.
 */
export type AudioBrandStat={brand:string;count:number;percent:number};
type RegistrationSnapshot={configurationSnapshot:unknown};
type SnapshotRecord=Record<string,unknown>;
const aliasToCanonical=new Map<string,string>();
function keyOf(value:string):string{
 return value.normalize('NFKC').toLocaleLowerCase('ru').replace(/[\p{P}\p{S}\s]+/gu,'');
}
function register(canonical:string,variants:string[]):void{
 for(const variant of [canonical,...variants])aliasToCanonical.set(keyOf(variant),canonical);
}
register('Russian Bass',[
 'russianbass','russian-bass','russian bas','рашн бас','рашн басс','рашнбас','рашнбасс',
 'русский бас','русский басс',
]);
register('Deaf Bonce',[
 'deafbonce','deaf-bonce','деф бонс','дэф бонс','deaf bons',
 'apocalypse','apocalypce','apocalipse','апокалипсис','апокалипс',
 'deaf bonce apocalypse','deaf bonce apocalypce',
]);
// Common acronym casing is retained. Avoid fuzzy matching: unrelated brands
// like "Pride" and "Pride Audio" must not be merged automatically.
register('JBL',[]);
register('Kicx',[]);
register('Pride',[]);

export function canonicalAudioBrand(value:unknown):string|null{
 if(typeof value!=='string')return null;
 const cleaned=value.normalize('NFKC').trim().replace(/\s+/g,' ');
 if(!cleaned)return null;
 const key=keyOf(cleaned);
 if(!key)return null;
 const mapped=aliasToCanonical.get(key);
 if(mapped)return mapped;
 return cleaned.toLocaleLowerCase('ru').replace(/(^|[\s\-])([\p{L}])/gu,(_,sep,letter:string)=>
  sep+letter.toLocaleUpperCase('ru'));
}

function brandSet(snapshot:unknown,field:'audioComponents'|'amplifiers'):Set<string>{
 const found=new Set<string>();
 if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))return found;
 const items=(snapshot as SnapshotRecord)[field];
 if(!Array.isArray(items))return found;
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const brand=canonicalAudioBrand((item as SnapshotRecord).brand);
  if(brand)found.add(brand);
 }
 return found;
}

export function summarizeAudioBrands(registrations:readonly RegistrationSnapshot[]):{
 speakerBrands:AudioBrandStat[];
 amplifierBrands:AudioBrandStat[];
 configurationBrands:AudioBrandStat[];
}{
 const speakers=new Map<string,number>();
 const amplifiers=new Map<string,number>();
 const combined=new Map<string,number>();
 const add=(map:Map<string,number>,set:Set<string>)=>{
  for(const brand of set)map.set(brand,(map.get(brand)??0)+1);
 };
 for(const registration of registrations){
  const sp=brandSet(registration.configurationSnapshot,'audioComponents');
  const amp=brandSet(registration.configurationSnapshot,'amplifiers');
  add(speakers,sp);
  add(amplifiers,amp);
  add(combined,new Set([...sp,...amp]));
 }
 const collator=new Intl.Collator('ru',{sensitivity:'base',numeric:true});
 const render=(map:Map<string,number>):AudioBrandStat[]=>
  [...map.entries()].map(([brand,count])=>({
   brand,count,percent:registrations.length?Number((count/registrations.length*100).toFixed(1)):0,
  })).sort((a,b)=>b.count-a.count||collator.compare(a.brand,b.brand));
 return {speakerBrands:render(speakers),amplifierBrands:render(amplifiers),configurationBrands:render(combined)};
}
