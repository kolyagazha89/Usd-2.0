import {safeHref} from './premium-model.ts';

/** A media Blob URL is displayable only when created by our authenticated
 * media fetch, not when supplied as arbitrary user/CMS content. */
export function safePhotoSource(value:unknown,isTrustedPrivateUrl:(url:string)=>boolean):string {
 const candidate=String(value??'').trim();
 if(candidate.startsWith('blob:')&&isTrustedPrivateUrl(candidate))return candidate;
 const safe=safeHref(candidate);
 return safe&&(safe.startsWith('/')||/^https?:\/\//i.test(safe))?safe:'';
}

/** DB photoUrl points to private object storage, not a public browser image.
 * All public photos must go through the visibility-checked API media route. */
export function publicEntityPhotoSource(
 targetType:'PARTICIPANT_PHOTO'|'CAR_PHOTO',
 entity:{id?:unknown;photoUrl?:unknown;isPublic?:unknown}|null|undefined,
 publicUrl:(targetType:'PARTICIPANT_PHOTO'|'CAR_PHOTO',targetId:string)=>string,
):string {
 const id=typeof entity?.id==='string'?entity.id.trim():'';
 const reference=typeof entity?.photoUrl==='string'?entity.photoUrl.trim():'';
 if(!id||entity?.isPublic===false||!reference)return '';
 // Never expose the internal S3 key to anonymous users. An opaque revision
 // derived from the reference ensures a replaced picture has a new <img> URL,
 // even when the protected public media route has a stable entity ID.
 let revision=2166136261;
 for(let index=0;index<reference.length;index++){
  revision=Math.imul(revision^reference.charCodeAt(index),16777619);
 }
 const url=publicUrl(targetType,id);
 return url+(url.includes('?')?'&':'?')+'v='+(revision>>>0).toString(16).padStart(8,'0');
}
