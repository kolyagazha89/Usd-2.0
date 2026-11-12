/**
 * Public SEO policy: never advertise private IDs, unpublished stages or arbitrary
 * SPA fallback paths to search engines. CMS overrides are homepage-only.
 */
export type SeoStage={
 id:string;
 name:string;
 city?:string|null;
 date:string|Date;
 venue?:string|null;
 address?:string|null;
 status?:string;
};
type SeoMetadata={title:string;description:string;indexable:boolean};
const sections:Record<string,{title:string;description:string}>={
 '/':{title:'USD — соревнования по автозвуку в России',description:'USD — Ultimate Sound Destruction. Календарь соревнований по автозвуку, регистрация на этапы, результаты, рекорды и новости чемпионата.'},
 '/stages':{title:'Этапы соревнований по автозвуку — календарь USD',description:'Календарь этапов USD по автозвуку: даты, города, площадки, регистрация и информация о соревнованиях.'},
 '/results':{title:'Результаты соревнований по автозвуку — USD',description:'Официальные результаты этапов USD: измерения, классы участников и протоколы соревнований по автозвуку.'},
 '/records':{title:'Рекорды по автозвуку — USD',description:'Рекорды USD по SPL, BFSPL и BDW SPL: лучшие опубликованные результаты участников соревнований по автозвуку.'},
 '/rules':{title:'Регламент и правила соревнований USD',description:'Актуальные правила соревнований USD по автозвуку: направления, классы, инспекция и допуск к участию.'},
 '/participants':{title:'Участники соревнований по автозвуку — USD',description:'Публичные профили участников чемпионата USD: автомобили, достижения и история выступлений.'},
 '/teams':{title:'Команды чемпионата по автозвуку — USD',description:'Команды USD, их опубликованные результаты и выступления на этапах чемпионата по автозвуку.'},
 '/cars':{title:'Автомобили участников соревнований USD',description:'Автомобили и опубликованные аудиосистемы участников соревнований USD по автозвуку.'},
 '/news':{title:'Новости соревнований по автозвуку — USD',description:'Новости чемпионата USD по автозвуку: этапы, участники, анонсы и события сообщества.'},
 '/partners':{title:'Партнёры чемпионата по автозвуку — USD',description:'Партнёры USD: бренды и студии автозвука, поддерживающие соревнования и сообщество.'},
 '/documents':{title:'Официальные документы соревнований — USD',description:'Документы USD: регламент, правила участия и опубликованные документы чемпионата по автозвуку.'},
 '/contacts':{title:'Контакты организаторов чемпионата USD',description:'Связаться с организаторами USD по вопросам участия, проведения этапов соревнований и партнёрства.'},
 '/about':{title:'О чемпионате по автозвуку USD',description:'Ultimate Sound Destruction — соревнования по автозвуку, результаты, рекорды и сообщество участников.'},
 '/privacy':{title:'Политика обработки персональных данных — USD',description:'Информация о порядке обработки и защите персональных данных на сайте USD.'},
 '/terms':{title:'Пользовательское соглашение — USD',description:'Условия использования официального сайта и сервисов чемпионата USD.'},
 '/consent':{title:'Согласие на обработку персональных данных — USD',description:'Условия согласия на обработку персональных данных пользователей USD.'},
};
const detailSections=new Set(['/participants','/teams','/cars','/news']);
export function isIndexablePublicRoute(path:string):boolean{
 const route=path.split(/[?#]/,1)[0]||'/';
 if(Object.hasOwn(sections,route))return true;
 if(/^\/stages\/[a-z0-9-]+$/i.test(route))return true;
 const parts=route.split('/').filter(Boolean);
 if(parts.length!==2||!detailSections.has('/'+parts[0]))return false;
 // Team slugs can contain encoded spaces or Cyrillic, while malformed paths
 // and encoded separators must not become crawlable duplicates.
 try{
  const value=decodeURIComponent(parts[1]);
  return value.length>0&&value.length<=150&&!value.includes('/')&&!value.includes('\\')&&!/[?#]/.test(value);
 }catch{return false}
}
export function publicSeoMetadata(path:string,stage?:SeoStage|null):SeoMetadata{
 const route=path.split(/[?#]/,1)[0]||'/';
 if(route.startsWith('/stages/')&&!isIndexablePublicRoute(route)){
  return {title:'Страница не найдена — USD',description:'Указанная страница недоступна.',indexable:false};
 }
 if(route.startsWith('/stages/')&&route!=='/stages/'){
  if(stage&&(stage.status==='PUBLISHED'||stage.status==='COMPLETED')){
   const city=stage.city?(' в '+stage.city):'';
   const date=new Date(stage.date);
   const when=Number.isNaN(date.valueOf())?'':(' — '+new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(date));
   return {title:stage.name+city+' | USD',description:stage.name+when+city+'. Этап соревнований по автозвуку USD: место проведения, правила и регистрация.',indexable:true};
  }
  return {title:'Этап соревнований — USD',description:'Опубликованные этапы соревнований по автозвуку USD.',indexable:false};
 }
 const item=sections[route]??(isIndexablePublicRoute(route)?sections['/'+route.split('/')[1]]:null);
 return {title:item?.title??'Страница не найдена — USD',description:item?.description??'Официальный сайт соревнований по автозвуку USD.',indexable:isIndexablePublicRoute(route)};
}
export function structuredDataForPage(path:string,stage:SeoStage|null|undefined,origin:string):Record<string,unknown>|null{
 const route=path.split(/[?#]/,1)[0]||'/';
 const base=new URL(origin);
 if(!['https:','http:'].includes(base.protocol))return null;
 const homepage=base.origin+'/';
 const org={'@type':'Organization',name:'USD — Ultimate Sound Destruction',url:homepage};
 if(route==='/')return {'@context':'https://schema.org',...org};
 if(/^\/stages\/[^/]+$/.test(route)&&stage&&(stage.status==='PUBLISHED'||stage.status==='COMPLETED')){
  const city=stage.city?.trim()||'';
  return {
   '@context':'https://schema.org','@type':'SportsEvent',name:stage.name,
   url:base.origin+route,description:stage.name+' — соревнования по автозвуку USD',
   startDate:stage.date instanceof Date?stage.date.toISOString():stage.date,
   sport:'Автозвук',organizer:org,
   location:{'@type':'Place',name:stage.venue||city||'USD',
    address:{'@type':'PostalAddress',addressLocality:city,streetAddress:stage.address||''}},
  };
 }
 return null;
}
