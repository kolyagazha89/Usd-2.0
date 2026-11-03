import {HOMEPAGE_COPY_FIELDS} from '../public/homepage-copy';
/** Read-only progress hints for the USD CMS editor.
 * These are counts of filled editorial fields, not server validation or approval.
 * Existing display fallbacks intentionally do not count as manually configured.
 */
export const SITE_SETTING_SECTIONS=[
 {id:'branding',title:'Бренд',fields:['siteName','organizationName','logoUrl','splashLogoUrl','mobileLogoUrl','faviconUrl']},
 {id:'placeholders',title:'Заглушки',fields:['participant','car','stage']},
 {id:'homepage',title:'Главная',fields:['heroTitle','heroSubtitle','heroKicker','heroImageUrl','valuesTitle','communityTitle','documentsDescription']},
 {id:'navigation',title:'Меню',fields:[]},
 {id:'stream',title:'Трансляция',fields:['title','url','embedUrl']},
 {id:'live',title:'LIVE',fields:['stageId','refreshSeconds']},
 {id:'contacts',title:'Контакты',fields:['phone','email','address','telegram','vk','youtube','rutube','whatsapp']},
 {id:'seo',title:'SEO',fields:['title','description','keywords','ogTitle','ogDescription','ogImage','canonical']},
 {id:'legal',title:'Документы',fields:['ipName','inn','ogrnip','operatorAddress','personalDataEmail','privacyText','consentText','termsText']},
 {id:'registration',title:'Регистрация',fields:['price','additionalClassPrice','introText','successText','rulesText']},
 {id:'footer',title:'Подвал',fields:['copyright','text','description','phone','email']},
] as const;
export type SiteSettingSection=(typeof SITE_SETTING_SECTIONS)[number]['id'];
export const SITE_SETTING_IDS=new Set<string>(SITE_SETTING_SECTIONS.map(item=>item.id));
export const HOME_EDITOR_STEPS=[
 {id:'hero',title:'Первый экран',description:'Заголовок, подзаголовок, 3D-сцена и фото'},
 {id:'copy',title:'Тексты и карточки',description:'Подписи, сообщество и преимущества'},
 {id:'blocks',title:'Блоки и LIVE',description:'Видимость, порядок, трансляция и результаты'},
] as const;
export type HomeEditorStep=(typeof HOME_EDITOR_STEPS)[number]['id'];
export function normalizeSiteSection(value:string|null|undefined):SiteSettingSection {
 return SITE_SETTING_IDS.has(String(value))?value as SiteSettingSection:'branding';
}
export function normalizeHomeEditorStep(value:string|null|undefined):HomeEditorStep {
 return HOME_EDITOR_STEPS.some(x=>x.id===value)?value as HomeEditorStep:'hero';
}
function filled(value:unknown):boolean{
 if(typeof value==='string')return value.trim().length>0;
 if(typeof value==='number')return Number.isFinite(value);
 if(typeof value==='boolean')return false;
 return value!=null;
}
export function siteSettingProgress(settings:any,id:SiteSettingSection){
 const schema=SITE_SETTING_SECTIONS.find(item=>item.id===id)!;
 const raw=id==='placeholders'?settings?.branding?.placeholders:settings?.[id==='live'?'liveResults':id];
 const count=schema.fields.filter(field=>filled(raw?.[field])).length;
 // Navigation is a configurable collection, not a set of arbitrary fixed inputs.
 const navigation=id==='navigation';
 const legal=id==='legal';
 return {
  count: navigation?(Array.isArray(raw?.items)?raw.items.length:0):count,
  total: navigation?0:schema.fields.length,
  approved:legal&&settings?.legal?.legalApproved===true,
  label:legal&&settings?.legal?.legalApproved!==true?'Не утверждено':navigation?'Настроить меню':count===schema.fields.length?'Поля заполнены':count+' из '+schema.fields.length+' полей',
 };
}
export function homeEditorProgress(home:any,step:HomeEditorStep){
 if(step==='hero'){
  const fields=['heroTitle','heroSubtitle','heroKicker','heroImageUrl','heroStageLabel','heroStageTagline'];
  const done=fields.filter(key=>filled(home?.[key])).length;
  return {done,total:fields.length};
 }
 if(step==='copy'){
  const textKeys=['communityTitle','communitySubtitle','communityButtonLabel','documentsDescription','documentsButtonLabel','teamsEmptyTitle','teamsEmptyDescription','valuesTitle','valuesSubtitle'];
  const textFilled=textKeys.filter(key=>filled(home?.[key])).length;
  const copied=HOMEPAGE_COPY_FIELDS.filter(field=>filled(home?.copy?.[field.key])).length;
  const cards=Array.isArray(home?.valuesCards)?home.valuesCards:[];
  const cardFilled=cards.filter((x:any)=>filled(x.heading)&&filled(x.description)).length;
  return {done:copied+textFilled+cardFilled,total:HOMEPAGE_COPY_FIELDS.length+textKeys.length+cards.length};
 }
 const blocks=Array.isArray(home?.blocks)?home.blocks:[];
 return {done:blocks.filter((x:any)=>typeof x.enabled==='boolean').length,total:blocks.length};
}
