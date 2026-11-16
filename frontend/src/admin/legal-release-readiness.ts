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

/** Exact filenames in the operator's verified release 1.8 ZIP. */
export const LEGAL_RELEASE_DOCX_FILENAMES: Record<string,string> = {
 privacyPolicy:'01_usd_privacy_policy.docx',
 personalDataConsent:'02_usd_personal_data_consent.docx',
 termsOfUse:'03_usd_terms_of_use.docx',
 cookiePolicy:'04_usd_cookie_policy.docx',
 newsletterConsent:'05_usd_newsletter_consent.docx',
 photoProfileConsent:'06_usd_publication_consent.docx',
 officialProtocolConsent:'07_usd_official_protocol_consent.docx',
};

export function planLegalReleaseUpload<T extends {name:string;size:number;type?:string}>(
 files:readonly T[], descriptors:readonly Descriptor[],
):Array<{key:string;file:T}> {
 const byName=new Map<string,T>();
 for(const file of files){
  const name=file.name.toLowerCase();
  if(byName.has(name))throw new Error('В наборе обнаружен дубликат файла: '+file.name);
  if(!Object.values(LEGAL_RELEASE_DOCX_FILENAMES).includes(name))
   throw new Error('В комплекте неизвестный файл: '+file.name+'. Выберите только 7 DOCX из папки 01.');
  if(file.size<=0||file.size>10*1024*1024)
   throw new Error('Недопустимый размер Word-файла: '+file.name);
  if(file.type&&file.type!=='application/vnd.openxmlformats-officedocument.wordprocessingml.document'&&file.type!=='application/octet-stream')
   throw new Error('Неверный формат Word-файла: '+file.name);
  byName.set(name,file);
 }
 const missing=descriptors.filter(d=>!byName.has(LEGAL_RELEASE_DOCX_FILENAMES[d.key]));
 if(missing.length)throw new Error('Выберите полный комплект: недостающие документы — '+missing.map(d=>d.title).join(', ')+'.');
 return descriptors.map(d=>({key:d.key,file:byName.get(LEGAL_RELEASE_DOCX_FILENAMES[d.key])!}));
}
