/** Shared public partner visibility and ordering for the home and directory.
 * The API filters unpublished partners too; repeat the check in the client so
 * draft entries from cached or historical CMS payloads cannot render.
 */
export type PublicPartner={
 id?:string;name?:string;description?:string;photoUrl?:string|null;
 website?:string;isActive?:boolean;isPublished?:boolean;sortOrder?:number;tier?:string;
};

const order=(value:unknown):number=>{
 const number=typeof value==='number'?value:typeof value==='string'&&value.trim()?Number(value):0;
 return Number.isFinite(number)?number:0;
};

export function visiblePartners(value:unknown):PublicPartner[]{
 if(!Array.isArray(value))return [];
 return value.filter((partner):partner is PublicPartner=>
  partner!==null&&typeof partner==='object'&&!Array.isArray(partner)
  &&partner.isActive!==false&&partner.isPublished!==false
 ).slice().sort((a,b)=>order(a.sortOrder)-order(b.sortOrder)
  ||String(a.name??'').localeCompare(String(b.name??''),'ru'));
}
