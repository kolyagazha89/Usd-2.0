/** XML builder has no DB dependencies and never serializes private registrations. */
export type SitemapStage={id:string;status:string;isDeleted:boolean;updatedAt:Date};
const PUBLIC_PATHS=['/','/stages','/results','/records','/rules','/participants','/teams','/cars','/news','/partners','/documents','/contacts','/about','/privacy','/terms'];
function sitemapOrigin(input:string):string{
 const parsed=new URL(input);
 if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('Invalid frontend origin for sitemap');
 return parsed.origin;
}
export function renderSitemapXml(origin:string,stages:readonly SitemapStage[]):string{
 const root=sitemapOrigin(origin);
 const rows=PUBLIC_PATHS.map(path=>({path,updatedAt:null as Date|null}));
 for(const stage of stages){
  if(stage.isDeleted||!['PUBLISHED','COMPLETED'].includes(stage.status))continue;
  rows.push({path:'/stages/'+encodeURIComponent(stage.id),updatedAt:stage.updatedAt});
 }
 const urls=rows.map(({path,updatedAt})=>{
  const url=root+path;
  // Encode user-controlled stage ID as URL path, then escape XML delimiters.
  const escaped=url.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return '<url><loc>'+escaped+'</loc>'+(updatedAt?'<lastmod>'+updatedAt.toISOString().slice(0,10)+'</lastmod>':'')+'</url>';
 });
 return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.join('\n')+'\n</urlset>\n';
}
