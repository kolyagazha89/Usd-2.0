/** Required operator-uploaded Word documents for a registration-ready legal release. */
export const REQUIRED_PUBLIC_LEGAL_DOCUMENT_KEYS = [
  'privacyPolicy',
  'personalDataConsent',
  'termsOfUse',
  'cookiePolicy',
  'newsletterConsent',
  'photoProfileConsent',
  'officialProtocolConsent',
] as const;

export type PublicLegalDocumentKey = typeof REQUIRED_PUBLIC_LEGAL_DOCUMENT_KEYS[number];

/** Never approve a bundle with a missing or substituted publication consent. */
export function missingLegalDocumentKeys(documents: unknown): PublicLegalDocumentKey[] {
  const entries = documents && typeof documents === 'object' && !Array.isArray(documents)
    ? documents as Record<string, unknown> : {};
  return REQUIRED_PUBLIC_LEGAL_DOCUMENT_KEYS.filter(key => {
    const raw = entries[key];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true;
    const doc = raw as Record<string, unknown>;
    const prefix = 'legal-document-' + key + '-';
    return !(typeof doc.targetId === 'string' && doc.targetId.startsWith(prefix) &&
      doc.targetId.length > prefix.length &&
      typeof doc.url === 'string' && doc.url.trim().length > 0 &&
      typeof doc.fileName === 'string' && /\.docx$/i.test(doc.fileName));
  });
}

export const LEGAL_DOCUMENT_LABELS: Record<PublicLegalDocumentKey,string> = {
  privacyPolicy:'политику обработки персональных данных',
  personalDataConsent:'согласие на обработку персональных данных',
  termsOfUse:'пользовательское соглашение',
  cookiePolicy:'политику cookie',
  newsletterConsent:'согласие на рассылки',
  photoProfileConsent:'согласие на публикацию фото и профиля',
  officialProtocolConsent:'согласие на публикацию официальных протоколов',
};
