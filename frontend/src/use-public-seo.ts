import {useEffect} from 'react';

type Seo = {title?:string;description?:string;ogTitle?:string;ogDescription?:string;ogImage?:string;canonical?:string};
type Stage = {name?:string;description?:string;date?:string;city?:string;address?:string};
const names:Record<string,string>={'/stages':'Этапы','/results':'Результаты','/records':'Рекорды','/rules':'Правила','/privacy':'Политика конфиденциальности','/terms':'Пользовательское соглашение','/consent':'Согласие на обработку данных'};
const absolute=(value:string,base:string)=>{try{const url=new URL(value,base);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}};
function meta(name:string,content:string,property=false){
  const attribute=property?'property':'name';
  let tag=document.head.querySelector<HTMLMetaElement>('meta['+attribute+'="'+name+'"]');
  if(!content){tag?.remove();return}
  if(!tag){tag=document.createElement('meta');tag.setAttribute(attribute,name);document.head.appendChild(tag)}
  tag.content=content;
}
export function usePublicSeo(route:string,seo:Seo={},stage?:Stage|null){
  useEffect(()=>{
    const siteTitle=seo.title?.trim()||'USD — Ultimate Sound Destruction';
    const pageName=stage?.name||names[route];
    const title=pageName?pageName+' — USD':siteTitle;
    const description=stage?.description?.trim().slice(0,240)||seo.description?.trim()||'Соревнования по автозвуку USD: этапы, результаты, рекорды, участники и правила.';
    const base=absolute(seo.canonical||'/',window.location.origin)||window.location.origin;
    const canonical=absolute(route,base);
    document.title=title;
    meta('description',description);
    meta('og:title',route==='/'?(seo.ogTitle||title):title,true);
    meta('og:description',route==='/'?(seo.ogDescription||description):description,true);
    meta('og:url',canonical,true);
    meta('og:image',seo.ogImage?absolute(seo.ogImage,base):'',true);
    let link=document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if(!link){link=document.createElement('link');link.rel='canonical';document.head.appendChild(link)}
    link.href=canonical;
    const previous=document.getElementById('usd-event-schema');previous?.remove();
    if(stage?.name&&stage.date){
      const script=document.createElement('script');script.id='usd-event-schema';script.type='application/ld+json';
      script.textContent=JSON.stringify({'@context':'https://schema.org','@type':'SportsEvent',name:stage.name,startDate:stage.date,url:canonical,location:{'@type':'Place',name:stage.city||'Площадка USD',address:stage.address||stage.city||''}});
      document.head.appendChild(script);
    }
    return()=>{document.getElementById('usd-event-schema')?.remove()};
  },[route,seo.title,seo.description,seo.ogTitle,seo.ogDescription,seo.ogImage,seo.canonical,stage?.name,stage?.description,stage?.date,stage?.city,stage?.address]);
}
