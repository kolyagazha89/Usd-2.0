import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {publicSeoMetadata,structuredDataForPage} from '../src/public/seo-model.ts';

// Server-visible, static content. Dynamic event URLs are listed by the live sitemap
// and updated client-side; never pre-render a fake stage or private profile.
export const staticSeoRoutes=[
 '/', '/stages', '/results', '/records', '/rules', '/participants',
 '/teams', '/cars', '/news', '/partners', '/documents', '/contacts',
 '/about', '/privacy', '/terms', '/consent',
];
const PRERELEASE_SITE='https://app.usd-russia.ru';
const PRIMARY_SITE='https://usd-russia.ru';
// Build-time selection only: no untrusted host or arbitrary external canonical URL.
export function approvedSeoOrigin(value=process.env.VITE_PUBLIC_SITE_ORIGIN){
 const origin=value||PRERELEASE_SITE;
 if(origin!==PRERELEASE_SITE&&origin!==PRIMARY_SITE)
  throw new Error('Unapproved public canonical origin');
 return origin;
}
const htmlEscape=value=>String(value).replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',
})[char]);
export function renderSeoDocument(source,route,origin=PRERELEASE_SITE){
 origin=approvedSeoOrigin(origin);
 const seo=publicSeoMetadata(route,null);
 if(!seo.indexable||!staticSeoRoutes.includes(route))throw new Error('Unexpected SEO render path: '+route);
 const canonical=new URL(route,origin).href;
 const title=htmlEscape(seo.title),description=htmlEscape(seo.description);
 const updated=source.replace(/<title>[\s\S]*?<\/title>/i,'<title>'+title+'</title>')
  .replace(/<meta name="description"[^>]*>/i,'<meta name="description" content="'+description+'">')
  .replace(/<meta property="og:title"[^>]*>/i,'<meta property="og:title" content="'+title+'">')
  .replace(/<meta property="og:description"[^>]*>/i,'<meta property="og:description" content="'+description+'">');
 if(updated===source)throw new Error('The Vite HTML document did not contain SEO fields');
 const schema=structuredDataForPage(route,null,origin);
 const jsonLd=schema?'<script id="usd-public-structured-data" type="application/ld+json">'+JSON.stringify(schema).replace(/</g,'\\u003c')+'</script>':'';
 return updated.replace('</head>','<link rel="canonical" href="'+htmlEscape(canonical)+'">'+
  '<meta name="robots" content="index, follow">'+
  '<meta property="og:url" content="'+htmlEscape(canonical)+'">'+
  '<meta property="og:image" content="'+htmlEscape(new URL('/usd/usd-show-hero.webp',origin).href)+'">'+jsonLd+'</head>');
}

export async function generateStaticSeoPages(root=resolve('dist'),siteOrigin=process.env.VITE_PUBLIC_SITE_ORIGIN){
 const origin=approvedSeoOrigin(siteOrigin);
 const template=await readFile(resolve(root,'index.html'),'utf8');
 for(const route of staticSeoRoutes){
  const file=route==='/'?'index.html':route.slice(1)+'.html';
  await writeFile(resolve(root,file),renderSeoDocument(template,route,origin),'utf8');
 }
 // robots.txt must advertise the same sitemap origin as the pre-rendered
 // canonical/OG URLs. Keep all privacy and disallow directives unchanged.
 const robotsFile=resolve(root,'robots.txt');
 const robots=await readFile(robotsFile,'utf8');
 const oldSitemap='Sitemap: '+PRERELEASE_SITE+'/sitemap.xml';
 if(!robots.includes(oldSitemap))throw new Error('Unexpected robots sitemap template');
 await writeFile(robotsFile,robots.replace(oldSitemap,'Sitemap: '+origin+'/sitemap.xml'),'utf8');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 await generateStaticSeoPages();
}
