import {boxFromDescription,withoutBoxLine} from './box-parameters.ts';

type Row={direction?:unknown;type?:unknown;brand?:unknown;model?:unknown;quantity?:unknown};
export type ConfigurationVersionLike={
 audioComponents?:readonly Row[]|null;amplifiers?:readonly Row[]|null;headUnits?:readonly Row[]|null;
 batteries?:readonly Row[]|null;generators?:readonly Row[]|null;
 vibrationIsolation?:unknown;additionalDescription?:unknown;
};
export type ConfigurationChange={label:string;before:string;after:string};
export type ConfigurationChangeSection={key:string;title:string;changes:ConfigurationChange[]};

const string=(value:unknown)=>String(value??'').trim();
const count=(value:unknown)=>{
 const number=Number(value??1);
 return Number.isSafeInteger(number)&&number>0?number:1;
};
const groups=(rows:readonly Row[]|null|undefined,filter?:(row:Row)=>boolean)=>{
 const totals=new Map<string,{label:string;quantity:number}>();
 for(const row of rows??[]){
  if(!row||typeof row!=='object'||(filter&&!filter(row)))continue;
  const label=[string(row.brand),string(row.model)].filter(Boolean).join(' ')||'Без названия';
  const direction=string(row.direction);
  const type=string(row.type);
  const key=[direction.toLowerCase(),type.toLowerCase(),string(row.brand).toLowerCase(),string(row.model).toLowerCase()].join('|');
  const old=totals.get(key);
  totals.set(key,{label,quantity:(old?.quantity??0)+count(row.quantity)});
 }
 return totals;
};
const rowsDiff=(before:readonly Row[]|null|undefined,after:readonly Row[]|null|undefined,filter?:(row:Row)=>boolean):ConfigurationChange[]=>{
 const a=groups(before,filter),b=groups(after,filter);
 return [...new Set([...a.keys(),...b.keys()])].sort((left,right)=>left.localeCompare(right,'ru'))
  .flatMap(key=>{
   const old=a.get(key),next=b.get(key);
   if((old?.quantity??0)===(next?.quantity??0))return [];
   return [{label:next?.label??old?.label??'Оборудование',before:old?.quantity?old.quantity+' шт.':'—',after:next?.quantity?next.quantity+' шт.':'—'}];
  });
};
const field=(label:string,before:unknown,after:unknown):ConfigurationChange[]=>{
 const a=string(before),b=string(after);
 return a===b?[]:[{label,before:a||'—',after:b||'—'}];
};

/** A read-only comparison of saved configuration versions; never mutates historical snapshots. */
export function diffConfigurationVersions(previous:ConfigurationVersionLike,current:ConfigurationVersionLike):ConfigurationChangeSection[]{
 const oldBox=boxFromDescription(string(previous.additionalDescription));
 const newBox=boxFromDescription(string(current.additionalDescription));
 const sections:ConfigurationChangeSection[]=[
  {key:'FRONT',title:'Фронт',changes:rowsDiff(previous.audioComponents,current.audioComponents,row=>row.direction==='FRONT')},
  {key:'SUB',title:'Бас',changes:rowsDiff(previous.audioComponents,current.audioComponents,row=>row.direction==='SUB')},
  {key:'REAR',title:'Тыл',changes:rowsDiff(previous.audioComponents,current.audioComponents,row=>row.direction==='REAR')},
  {key:'AMPLIFIERS',title:'Усилители',changes:rowsDiff(previous.amplifiers,current.amplifiers)},
  {key:'HEAD_UNITS',title:'Головные устройства',changes:rowsDiff(previous.headUnits,current.headUnits)},
  {key:'POWER',title:'Питание',changes:[
   ...rowsDiff(previous.batteries,current.batteries).map(change=>({...change,label:'Аккумулятор: '+change.label})),
   ...rowsDiff(previous.generators,current.generators).map(change=>({...change,label:'Генератор: '+change.label})),
  ]},
  {key:'BOX',title:'Короб',changes:[
   ...field('Тип короба',oldBox.volume||oldBox.tuning?oldBox.type:'',newBox.volume||newBox.tuning?newBox.type:''),
   ...field('Объём, л',oldBox.volume,newBox.volume),
   ...field('Настройка, Гц',oldBox.tuning,newBox.tuning),
  ]},
  {key:'OTHER',title:'Дополнительно',changes:[
   ...field('Виброизоляция',previous.vibrationIsolation,current.vibrationIsolation),
   ...field('Описание',withoutBoxLine(string(previous.additionalDescription)),withoutBoxLine(string(current.additionalDescription))),
  ]},
 ];
 return sections.filter(section=>section.changes.length>0);
}
