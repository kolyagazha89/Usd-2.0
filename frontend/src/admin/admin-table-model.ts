/** Shared client-side ordering/paging for finite resource lists already fetched by ADMIN. */
export const ADMIN_TABLE_PAGE_SIZES=[25,50,100] as const;
export type SortDirection='asc'|'desc';
function sortableValue(value:unknown):string|number|null{
 if(value===null||value===undefined||value==='')return null;
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 if(typeof value==='boolean')return Number(value);
 if(value instanceof Date)return Number.isFinite(value.getTime())?value.getTime():null;
 if(typeof value==='object'){
  const record=value as Record<string,unknown>;
  return sortableValue(record.name??record.title??record.year??record.label??record.number??null);
 }
 return String(value);
}
export function sortResourceRows<T>(rows:readonly T[],key:string,direction:SortDirection,getValue:(row:T,key:string)=>unknown):T[]{
 if(!key)return [...rows];
 const collator=new Intl.Collator('ru',{numeric:true,sensitivity:'base'});
 const sign=direction==='desc'?-1:1;
 return rows.map((row,index)=>({row,index,value:sortableValue(getValue(row,key))})).sort((a,b)=>{
  if(a.value===null||b.value===null)return a.value===null?(b.value===null?a.index-b.index:1):-1;
  const difference=typeof a.value==='number'&&typeof b.value==='number'?a.value-b.value:collator.compare(String(a.value),String(b.value));
  return difference===0?a.index-b.index:difference*sign;
 }).map(item=>item.row);
}
export function paginateResourceRows<T>(rows:readonly T[],requestedPage:number,requestedSize:number){
 const pageSize=(ADMIN_TABLE_PAGE_SIZES as readonly number[]).includes(requestedSize)?requestedSize:25;
 const pageCount=Math.max(1,Math.ceil(rows.length/pageSize));
 const safePage=Number.isFinite(requestedPage)?Math.trunc(requestedPage):1;
 const page=Math.max(1,Math.min(pageCount,safePage));
 const start=(page-1)*pageSize;
 return {rows:rows.slice(start,start+pageSize),page,pageCount,pageSize,start};
}
