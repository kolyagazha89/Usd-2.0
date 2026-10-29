/** Rewrite ONLY old Railway-hosted public-file media links on public settings reads. */
const LEGACY_MEDIA_HOST = 'usd-api-production.up.railway.app';
const PUBLIC_MEDIA_PATH =
  /^\/media\/public-file\/(?:SITE_ASSET|CAR_PHOTO|PARTICIPANT_PHOTO)\/[^/?#]+$/;

function rewriteOne(value: string, apiPublicUrl: string): string {
  let original: URL;
  let destination: URL;
  try {
    original = new URL(value);
    destination = new URL(apiPublicUrl);
  } catch {
    return value;
  }
  if (
    original.protocol !== 'https:' ||
    original.hostname !== LEGACY_MEDIA_HOST ||
    original.username !== '' ||
    original.password !== '' ||
    original.port !== '' ||
    !PUBLIC_MEDIA_PATH.test(original.pathname) ||
    destination.protocol !== 'https:' ||
    destination.hostname !== 'api.usd-russia.ru' ||
    destination.username !== '' ||
    destination.password !== '' ||
    destination.port !== ''
  ) return value;
  return destination.origin + original.pathname + original.search + original.hash;
}

export function rewriteLegacyPublicMediaUrls<T>(value: T, apiPublicUrl: string): T {
  if (typeof value === 'string') return rewriteOne(value, apiPublicUrl) as T;
  if (Array.isArray(value)) {
    return value.map((item) => rewriteLegacyPublicMediaUrls(item, apiPublicUrl)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, rewriteLegacyPublicMediaUrls(item, apiPublicUrl)])) as T;
  }
  return value;
}
