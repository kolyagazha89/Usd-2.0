// Some existing stage selectors update the query with replaceState directly.
// Read that query without borrowing the destination of an outgoing component.
export function liveRoutePath(path:string,current:{pathname:string;search:string}):string{
 return path.split('?')[0]===current.pathname?current.pathname+current.search:path;
}
export function routeScrollKey(path:string){
 const [route,query]=path.split('?');
 const params=new URLSearchParams(query??'');
 return route+'?'+['id','view','rowId','carId','stageId','registrationId','tab'].map(key=>params.get(key)??'').join(':');
}
export function routeScrollTarget(path:string,kind:'initial'|'push'|'pop',saved:unknown,entry:unknown):number{
 const value=kind==='pop'?entry:/^\/admin(?:\/|\?|$)/.test(path)?saved:0;
 return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:0;
}
