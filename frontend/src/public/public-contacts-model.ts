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
  const known = CONTACT_CHANNELS.flatMap(([key, label]) => {
    // Missing keys may use legacy settings; an explicitly cleared contact
    // field must not resurrect a previously published legacy link.
    const supplied = Object.prototype.hasOwnProperty.call(contacts ?? {}, key)
      ? contacts?.[key]
      : social?.[key];
    const url = publicSocialUrl(supplied);
    return url ? [{ key, label, url }] : [];
  });
  // Keep additional channels from older installations; before this fix every
  // entry under settings.social could appear on the public contacts page.
  const listed = new Set<string>(CONTACT_CHANNELS.map(([key]) => key));
  const legacyExtra = Object.entries(social ?? {}).flatMap(([key, value]) => {
    if (listed.has(key)) return [];
    const url = publicSocialUrl(value);
    return url ? [{ key, label: key.toLocaleUpperCase('ru'), url }] : [];
  });
  return [...known, ...legacyExtra];
}
