import {safeHref} from './premium-model';

/** A media Blob URL is displayable only when created by our authenticated
 * media fetch, not when supplied as arbitrary user/CMS content. */
export function safePhotoSource(value:unknown,isTrustedPrivateUrl:(url:string)=>boolean):string {
 const candidate=String(value??'').trim();
 if(candidate.startsWith('blob:')&&isTrustedPrivateUrl(candidate))return candidate;
 const safe=safeHref(candidate);
 return safe&&(safe.startsWith('/')||/^https?:\/\//i.test(safe))?safe:'';
}
