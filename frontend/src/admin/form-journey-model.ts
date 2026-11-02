/** Pure form progression logic, shared by dynamic admin resource editors.
 * No persistence or server validation is inferred from these UI hints.
 */
export type JourneyField={name:string;label:string;required?:boolean;type?:string};
export function groupFormFields<T extends JourneyField>(fields:readonly T[],limit=5):T[][]{
 if(fields.length<7)return [Array.from(fields)];
 const size=Math.max(2,Math.min(8,Math.floor(limit)||5));
 const groups:T[][]=[];
 for(let i=0;i<fields.length;i+=size)groups.push(Array.from(fields.slice(i,i+size)));
 return groups;
}
export function isJourneyFieldFilled(field:JourneyField,value:unknown):boolean{
 if(field.type==='checkbox')return value===true;
 if(typeof value==='string')return value.trim().length>0;
 if(typeof value==='number')return Number.isFinite(value);
 return value!=null;
}
export function missingJourneyField(fields:readonly JourneyField[],values:Record<string,unknown>):JourneyField|undefined{
 return fields.find(field=>field.required&&!isJourneyFieldFilled(field,values[field.name]));
}
export function journeyRequiredProgress(fields:readonly JourneyField[],values:Record<string,unknown>){
 const required=fields.filter(field=>field.required);
 return {done:required.filter(field=>isJourneyFieldFilled(field,values[field.name])).length,total:required.length};
}
