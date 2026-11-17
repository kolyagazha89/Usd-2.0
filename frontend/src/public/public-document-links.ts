/** Public links intentionally open the HTML reader; DOCX is a separate download. */
export const LEGAL_DOCUMENT_LABELS: Record<string, string> = {
  privacyPolicy: 'Политика обработки данных',
  personalDataConsent: 'Согласие на обработку данных',
  termsOfUse: 'Пользовательское соглашение',
  cookiePolicy: 'Политика cookie',
  newsletterConsent: 'Согласие на рассылку',
  photoProfileConsent: 'Согласие на публикацию профиля',
  officialProtocolConsent: 'Согласие на публикацию ФИО и спортивных результатов',
};
/** Short public-facing descriptions never depend on the names uploaded by an admin. */
export const PUBLIC_DOCUMENT_DESCRIPTIONS: Record<string, string> = {
  rules: 'Правила участия и проведения соревнований USD',
  privacyPolicy: 'Порядок обработки и защиты персональных данных',
  personalDataConsent: 'Условия согласия на обработку персональных данных',
  termsOfUse: 'Правила пользования сайтом и личным кабинетом',
  cookiePolicy: 'Использование cookie и технических данных сайта',
  newsletterConsent: 'Добровольное согласие на получение рассылок',
  photoProfileConsent: 'Условия публикации профиля и изображений',
  officialProtocolConsent: 'Публикация ФИО и официальных спортивных результатов',
};
type DocumentRef = { targetId?: string; url?: string };
type LegalSettings = { legalApproved?: boolean; documents?: Record<string, DocumentRef> };
type RegistrationSettings = { rulesDocument?: { published?: {url?: string} | null } };
export type PublicDocumentLink = { key: string; label: string; description: string; openPath: string; downloadUrl: string };
export function publicDocumentLinks(legal: LegalSettings | undefined, registration: RegistrationSettings | undefined): PublicDocumentLink[] {
  const links: PublicDocumentLink[] = [];
  const rules = registration?.rulesDocument?.published;
  if (rules?.url) links.push({key:'rules',label:'Регламент соревнований',
    description:PUBLIC_DOCUMENT_DESCRIPTIONS.rules,openPath:'/rules',downloadUrl:rules.url});
  if (legal?.legalApproved !== true) return links;
  for (const [key, doc] of Object.entries(legal.documents || {})) {
    if (!Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENT_LABELS,key) ||
        !doc?.targetId?.startsWith('legal-document-' + key + '-') || !doc?.url) continue;
    links.push({key,label:LEGAL_DOCUMENT_LABELS[key],description:PUBLIC_DOCUMENT_DESCRIPTIONS[key],
      openPath:'/documents/' + encodeURIComponent(key), downloadUrl:doc.url});
  }
  return links;
}
