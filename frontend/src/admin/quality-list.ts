/** Retain the source index used by existing local hide preferences before filtering/paging. */
export function qualityIssueKey(issue:any,index:number):string{
 return [issue.code,issue.entity,issue.entityId,issue.message,index].filter(Boolean).join('|');
}
export function qualityRows(issues:any[],hidden:string[],showHidden:boolean,query:string,severity:string){
 const term=query.trim().toLocaleLowerCase('ru');
 return issues.map((issue,index)=>({issue,key:qualityIssueKey(issue,index)})).filter(({issue,key})=>
  (showHidden||!hidden.includes(key))&&(severity==='ALL'||issue.severity===severity)&&
  (!term||[issue.message,issue.code,issue.entity].join(' ').toLocaleLowerCase('ru').includes(term)));
}
