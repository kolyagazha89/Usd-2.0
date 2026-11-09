/** Shared public partner visibility and ordering for the home and directory.
 * The API filters unpublished partners too; repeat the check in the client so
 * draft entries from cached or historical CMS payloads cannot render.
 */
export type PublicPartner={
 id?:string;name?:string;description?:string;photoUrl?:string|null;
 website?:string;isActive?:boolean;isPublished?:boolean;sortOrder?:number;tier?:string;
 imageLayout?:unknown;
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

/** Word-safe teaser for long public partner descriptions; full CMS copy is never discarded. */
export function partnerDescriptionPreview(value:unknown,limit=170):{text:string;truncated:boolean}{
 const full=typeof value==='string'?value.trim():'';
 // Count complete Unicode code points rather than UTF-16 units so a logo
 // emoji or a non-BMP letter is never sliced between its surrogate halves.
 const characters=Array.from(full);
 if(characters.length<=limit)return {text:full,truncated:false};
 const before=characters.slice(0,limit);
 const space=before.lastIndexOf(' ');
 const end=space>=Math.floor(limit*.65)?space:before.length;
 return {text:before.slice(0,end).join('').trimEnd(),truncated:true};
}
