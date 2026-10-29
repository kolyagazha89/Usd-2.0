/** Canonical URLs are route-specific. A site-wide CMS canonical override is only
 * applied to the homepage; otherwise it would mark every public page as a duplicate.
 * Never point prerelease canonical tags to another origin or include query tokens.
 */
function localUrl(value:unknown,origin:string):URL|null{
 if(typeof value!=='string'||!value.trim())return null;
 try{
  const base=new URL(origin);
  if(base.protocol!=='https:'&&base.protocol!=='http:')return null;
  const url=new URL(value.trim(),base.origin);
  if(url.origin!==base.origin||!['https:','http:'].includes(url.protocol))return null;
  url.search='';url.hash='';
  return url;
 }catch{return null}
}

export function canonicalForRoute(path:string,configured:unknown,origin:string):string{
 const route=typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')?path:'/';
 const routeUrl=localUrl(route,origin)??new URL('/',origin);
 if(route==='/'){
  const override=localUrl(configured,origin);
  if(override)return override.href;
 }
 return routeUrl.href;
}

/** OG images must resolve to HTTP(S) URLs, not mailto:, tel: or unsafe schemes. */
export function openGraphImageUrl(value:unknown,origin:string):string{
 const fallback=new URL('/usd/usd-show-hero.webp',origin).href;
 if(typeof value!=='string'||!value.trim())return fallback;
 const candidate=value.trim();
 if(candidate.startsWith('//')||candidate.includes('\\')||/[\u0000-\u001f\u007f]/.test(candidate))return fallback;
 try{
  const url=new URL(candidate,origin);
  return ['https:','http:'].includes(url.protocol)?url.href:fallback;
 }catch{return fallback}
}
