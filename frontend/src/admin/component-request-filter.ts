export function filterComponentRequests<T extends {status:string;category:string;brand?:string;model?:string;details?:string|null;adminNote?:string|null;userEmail?:string}>(items:T[],status:string,category:string,query:string):T[] {
 const term=query.trim().toLocaleLowerCase('ru');
 return items.filter(item=>(status==='ALL'||(status==='RESOLVED'?item.status!=='PENDING':item.status===status))
  &&(category==='ALL'||item.category===category)
  &&(!term||[item.brand,item.model,item.details,item.adminNote,item.userEmail].some(value=>String(value??'').toLocaleLowerCase('ru').includes(term))));
}
