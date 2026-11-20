/** XML builder has no DB dependencies and never serializes private registrations. */
export type SitemapStage={id:string;status:string;isDeleted:boolean;updatedAt:Date};
const PUBLIC_PATHS=['/','/stages','/results','/records','/rules','/participants','/teams','/cars','/news','/partners','/documents','/contacts','/about','/privacy','/terms','/consent'];
function sitemapOrigin(input:string):string{
 const parsed=new URL(input);
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Invalid frontend origin for sitemap');
 return parsed.origin;
}
export function renderSitemapXml(origin:string,stages:readonly SitemapStage[],news:readonly unknown[]=[]):string{
 const root=sitemapOrigin(origin);
 const rows=PUBLIC_PATHS.map(path=>({path,updatedAt:null as Date|null}));
 for(const stage of stages){
  if(stage.isDeleted||!['PUBLISHED','COMPLETED'].includes(stage.status))continue;
  rows.push({path:'/stages/'+encodeURIComponent(stage.id),updatedAt:stage.updatedAt});
 }
 // CMS news has its own publishing lifecycle. Never advertise unpublished,
 // scheduled, malformed or non-routable news pages to search crawlers.
 const now=Date.now();
 for(const item of news){
  if(!item||typeof item!=='object'||Array.isArray(item))continue;
  const article=item as Record<string,unknown>;
  const id=article.id;
  if(typeof id!=='string'||!id.trim()||id.length>150||/[\/\\?#]/.test(id)||/[\u0000-\u001f\u007f]/.test(id)||article.isPublished===false)continue;
  let updatedAt:Date|null=null;
  if(article.publishedAt){
   if(typeof article.publishedAt!=='string')continue;
   const date=new Date(article.publishedAt);
   if(!Number.isFinite(date.valueOf())||date.valueOf()>now)continue;
   updatedAt=date;
  }else if(typeof article.createdAt==='string'){
   const date=new Date(article.createdAt);
   if(Number.isFinite(date.valueOf()))updatedAt=date;
  }
  rows.push({path:'/news/'+encodeURIComponent(id),updatedAt});
 }
 const urls=rows.map(({path,updatedAt})=>{
  const url=root+path;
  // Encode user-controlled stage ID as URL path, then escape XML delimiters.
  const escaped=url.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return '<url><loc>'+escaped+'</loc>'+(updatedAt?'<lastmod>'+updatedAt.toISOString().slice(0,10)+'</lastmod>':'')+'</url>';
 });
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.join('\n')+'\n</urlset>\n';
}
