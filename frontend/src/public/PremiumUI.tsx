import {createContext,useContext,useState,type ReactNode} from 'react';
import InternalLink from '../navigation/InternalLink';
import {initials,safeHref,stageDate} from './premium-model';
export const PremiumNavigation=createContext<(path:string)=>void>(()=>{});
export function Link({to,children,className='',...rest}:{to:string;children:ReactNode;className?:string;[key:string]:any}){const go=useContext(PremiumNavigation);return <InternalLink href={to} go={go} className={className} {...rest}>{children}</InternalLink>}
export function Button({to,children,quiet=false,...rest}:{to:string;children:ReactNode;quiet?:boolean;[key:string]:any}){return <Link to={to} className={'u-btn '+(quiet?'u-quiet':'')} {...rest}>{children}<span aria-hidden>↗</span></Link>}
export function Eyebrow({children}:{children:ReactNode}){return <div className="u-eyebrow"><i aria-hidden/>{children}</div>}
export function EmptyState({title='Пока нет публикаций',children}:{title?:string;children?:ReactNode}){return <div className="p-empty"><span aria-hidden>USD / NEXT</span><h3>{title}</h3><p>{children||'Новые материалы появятся после публикации организаторами.'}</p></div>}
export type PhotoPlaceholders={participant?:string|null;car?:string|null;stage?:string|null};
export const PremiumPlaceholders=createContext<PhotoPlaceholders>({});
export function Photo({src,alt,className='',fallback,kind}:{src?:string;alt:string;className?:string;fallback?:ReactNode;kind?:keyof PhotoPlaceholders}){
 const placeholders=useContext(PremiumPlaceholders);
 const [failed,F]=useState<string[]>([]);
 const original=safeHref(src);
 const substitute=kind?safeHref(placeholders[kind]??undefined):'';
 const url=[original,substitute].find(candidate=>candidate&&!failed.includes(candidate));
 return url?<img className={className} src={url} alt={alt} loading="lazy" decoding="async" onError={()=>F(previous=>previous.includes(url)?previous:[...previous,url])}/>:<div className={className+' p-photo-fallback'} role="img" aria-label={alt}>{fallback||initials(alt)}</div>;
}
export function NewsCard({post}:{post:any}){return <Link to={'/news/'+encodeURIComponent(post.id)} className="p-news-card"><Photo src={post.photoUrl} alt={post.title} className="p-news-cover" fallback={<><span>USD / JOURNAL</span><b>ГРОМЧЕ<br/>КАЖДЫЙ ДЕНЬ.</b><i aria-hidden/></>}/><div className="p-news-copy"><small>{post.publishedAt?stageDate(post.publishedAt):'USD / ЖУРНАЛ'}</small><h3>{post.title}</h3>{post.excerpt&&<p>{post.excerpt}</p>}<span className="p-news-read">Читать материал <b aria-hidden>↗</b></span></div></Link>}
