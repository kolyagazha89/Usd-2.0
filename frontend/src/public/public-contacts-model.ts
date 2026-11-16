const CONTACT_CHANNELS = [
  ['telegram', 'TELEGRAM'],
  ['vk', 'ВКОНТАКТЕ'],
  ['youtube', 'YOUTUBE'],
  ['rutube', 'RUTUBE'],
  ['whatsapp', 'WHATSAPP'],
] as const;

type ContactValues = Record<string, unknown> | null | undefined;

function publicSocialUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw || /[\u0000-\u001f\u007f\\]/.test(raw) || raw.startsWith('//')) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

/** Admin saves these channels under contacts; social is a legacy fallback. */
export function publicContactLinks(contacts: ContactValues, social: ContactValues) {
  return CONTACT_CHANNELS.flatMap(([key, label]) => {
    const primary = contacts?.[key];
    const legacy = social?.[key];
    const supplied = typeof primary === 'string' && primary.trim() ? primary : legacy;
    const url = publicSocialUrl(supplied);
    return url ? [{ key, label, url }] : [];
  });
}
