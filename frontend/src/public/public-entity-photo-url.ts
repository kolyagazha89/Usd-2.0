import {resolveUsdApiBase} from '../venue-api-config';

/** No API auth/session side effects in the public presentation layer.
 * Calculate this only when an image actually renders: SSR/node tests can
 * safely import the components without a browser global.
 */
export function getPublicEntityPhotoUrl(targetType:'PARTICIPANT_PHOTO'|'CAR_PHOTO',targetId:string):string{
 const runtime=typeof window==='undefined'?{}:window as unknown as Record<string,unknown>;
 const buildBase=import.meta.env?.VITE_API_URL as string|undefined;
 const apiBase=resolveUsdApiBase(buildBase,runtime.__USD_VENUE_MODE__,runtime.__USD_VENUE_API_BASE__);
 return apiBase+'/media/public-file/'+encodeURIComponent(targetType)+'/'+encodeURIComponent(targetId);
}
