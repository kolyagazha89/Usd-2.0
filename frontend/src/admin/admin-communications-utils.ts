/** Read-only presentation helpers for staff communication and publishing desks. */
const mailNames:Record<string,string>={
 AUTH_EMAIL_VERIFICATION:'Подтверждение email',
 AUTH_PASSWORD_RESET:'Восстановление пароля',
 AUTH_EMAIL_CHANGE:'Изменение email',
 AUTH_TEST_CONNECTION:'Проверка почтового канала',
 TEST_AUTH_EMAIL_VERIFICATION:'Тест подтверждения email',
 TEST_AUTH_PASSWORD_RESET:'Тест восстановления пароля',
 TEST_AUTH_EMAIL_CHANGE:'Тест смены email',
};

export function mailTypeName(type:string):string {
 return mailNames[type]??type.replace(/_/g,' ');
}

export function filterMailJournalEntries<T extends {recipient:string;type:string}>(entries:readonly T[],search:string):T[]{
 const query=search.trim().toLocaleLowerCase('ru');
 if(!query)return [...entries];
 return entries.filter(row=>[row.recipient,mailTypeName(row.type),row.type].some(value=>value.toLocaleLowerCase('ru').includes(query)));
}

export type NewsPublicationFilter='all'|'published'|'draft';
export function filterNewsItems<T extends {title?:string;excerpt?:string;body?:string;isPublished?:boolean}>(items:readonly T[],search:string,status:NewsPublicationFilter):T[]{
 const query=search.trim().toLocaleLowerCase('ru');
 return items.filter(item=>{
  if(status==='published'&&item.isPublished===false)return false;
  if(status==='draft'&&item.isPublished!==false)return false;
  return !query||[item.title,item.excerpt,item.body].some(value=>String(value??'').toLocaleLowerCase('ru').includes(query));
 });
}

type TemplateSnapshot={key:string;enabled:boolean;title:string;body:string};
export function pushTemplatesChanged(saved:readonly TemplateSnapshot[],draft:readonly TemplateSnapshot[]):boolean {
 if(saved.length!==draft.length)return true;
 return saved.some((template,index)=>{
  const current=draft[index];
  return !current||template.key!==current.key||template.enabled!==current.enabled||template.title!==current.title||template.body!==current.body;
 });
}

export type PartnerVisibilityFilter='all'|'visible'|'draft'|'hidden';
export function filterPartners<T extends {name?:string;description?:string;tier?:string;website?:string;isActive?:boolean;isPublished?:boolean}>(
 partners:readonly T[],search:string,tier:string,visibility:PartnerVisibilityFilter,
):T[]{
 const query=search.trim().toLocaleLowerCase('ru');
 return partners.filter(partner=>{
  if(tier!=='all'&&partner.tier!==tier)return false;
  const visible=partner.isActive!==false&&partner.isPublished!==false;
  const draft=partner.isActive!==false&&partner.isPublished===false;
  const hidden=partner.isActive===false;
  if(visibility==='visible'&&!visible||visibility==='draft'&&!draft||visibility==='hidden'&&!hidden)return false;
  return !query||[partner.name,partner.description,partner.website].some(value=>String(value??'').toLocaleLowerCase('ru').includes(query));
 });
}
