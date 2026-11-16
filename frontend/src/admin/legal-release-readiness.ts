type Descriptor = {key:string;title:string};
type DocumentRef = {targetId?:unknown;fileName?:unknown;url?:unknown};
export function missingLegalDocuments(descriptors:readonly Descriptor[], documents:unknown):string[]{
 const published=documents&&typeof documents==='object'&&!Array.isArray(documents)
  ? documents as Record<string,DocumentRef>: {};
 return descriptors.filter(({key})=>{
  const doc=published[key], prefix='legal-document-'+key+'-';
  return !(doc&&typeof doc==='object'&&!Array.isArray(doc)&&
   typeof doc.targetId==='string'&&doc.targetId.startsWith(prefix)&&doc.targetId.length>prefix.length&&
   typeof doc.fileName==='string'&&/\.docx$/i.test(doc.fileName)&&
   typeof doc.url==='string'&&doc.url.trim().length>0);
 }).map(({title})=>title);
}
