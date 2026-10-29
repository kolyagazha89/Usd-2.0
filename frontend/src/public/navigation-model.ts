/** Public menu defaults are UI fallbacks, never a substitute for saved CMS choices. */
export const DEFAULT_PUBLIC_NAVIGATION = [
 {id:'home',path:'/',label:'Главная',enabled:true,sortOrder:0},
 {id:'stages',path:'/stages',label:'Этапы',enabled:true,sortOrder:1},
 {id:'results',path:'/results',label:'Результаты',enabled:true,sortOrder:2},
 {id:'records',path:'/records',label:'Рекорды',enabled:true,sortOrder:3},
 {id:'participants',path:'/participants',label:'Участники',enabled:true,sortOrder:4},
 {id:'teams',path:'/teams',label:'Команды',enabled:true,sortOrder:5},
 {id:'news',path:'/news',label:'Новости',enabled:true,sortOrder:6},
 {id:'rules',path:'/rules',label:'Регламент',enabled:true,sortOrder:7},
 {id:'documents',path:'/documents',label:'Документы',enabled:true,sortOrder:8},
 {id:'partners',path:'/partners',label:'Партнёры',enabled:false,sortOrder:9},
 {id:'cars',path:'/cars',label:'Автомобили',enabled:false,sortOrder:10},
 {id:'about',path:'/about',label:'О чемпионате',enabled:false,sortOrder:11},
 {id:'contacts',path:'/contacts',label:'Контакты',enabled:false,sortOrder:12},
] as const;
export type PublicMenuItem={id:string;path:string;label:string;enabled:boolean;sortOrder:number};
const allowed=new Map<string,typeof DEFAULT_PUBLIC_NAVIGATION[number]>(DEFAULT_PUBLIC_NAVIGATION.map(item=>[item.path,item]));
type SettingsNavigation={items?:unknown}|null|undefined;
function savedRows(navigation:SettingsNavigation):PublicMenuItem[]|null{
 const rows=navigation?.items;
 if(!Array.isArray(rows)||rows.length===0)return null;
 const seen=new Set<string>();
 return rows.flatMap((value:unknown,index:number)=>{
  if(!value||typeof value!=='object')return [];
  const item=value as Record<string,unknown>;
  const def=allowed.get(String(item.path??''));
  if(!def||seen.has(def.path))return [];
  seen.add(def.path);
  return [{id:def.id,path:def.path,label:typeof item.label==='string'&&item.label.trim()?item.label.trim():def.label,
   enabled:item.enabled!==false,sortOrder:typeof item.sortOrder==='number'&&Number.isFinite(item.sortOrder)?item.sortOrder:index}];
 }).sort((a,b)=>a.sortOrder-b.sortOrder);
}
/** A missing/legacy menu uses defaults. An explicitly hidden menu stays hidden. */
export function visiblePublicNavigationItems(navigation:SettingsNavigation):string[][]{
 const saved=savedRows(navigation);
 return (saved??DEFAULT_PUBLIC_NAVIGATION).filter(item=>item.enabled).map(item=>[item.path,item.label]);
}
/** Footer links obey the same CMS visibility, names and ordering as the header.
 * Legal documents remain independently accessible even if the menu is hidden.
 */
export function footerPublicNavigationGroups(navigation:SettingsNavigation){
 const groups={competitions:[] as string[][],community:[] as string[][],information:[] as string[][]};
 const competitions=new Set(['/stages','/results','/records']);
 const community=new Set(['/participants','/teams','/cars','/news','/partners']);
 const information=new Set(['/about','/rules','/documents','/contacts']);
 for(const entry of visiblePublicNavigationItems(navigation)){
  const path=entry[0];
  if(competitions.has(path))groups.competitions.push(entry);
  else if(community.has(path))groups.community.push(entry);
  else if(information.has(path))groups.information.push(entry);
 }
 return groups;
}

/** Show every supported route in the editor, including routes hidden in old CMS data. */
export function editablePublicNavigationItems(navigation:SettingsNavigation):PublicMenuItem[]{
 const saved=savedRows(navigation);
 if(saved===null)return DEFAULT_PUBLIC_NAVIGATION.map(item=>({...item}));
 const existing=new Set(saved.map(item=>item.path));
 return [...saved,...DEFAULT_PUBLIC_NAVIGATION.filter(item=>!existing.has(item.path)).map((item,index)=>({...item,enabled:false,sortOrder:saved.length+index}))];
}
