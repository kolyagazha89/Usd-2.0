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
type DocumentRef = { targetId?: string; url?: string; fileName?: string };
type LegalSettings = { legalApproved?: boolean; documents?: Record<string, DocumentRef> };
type RegistrationSettings = { rulesDocument?: { published?: {url?: string;fileName?: string} | null } };
export type PublicDocumentLink = { key: string; label: string; fileName: string; openPath: string; downloadUrl: string };
export function publicDocumentLinks(legal: LegalSettings | undefined, registration: RegistrationSettings | undefined): PublicDocumentLink[] {
  const links: PublicDocumentLink[] = [];
  const rules = registration?.rulesDocument?.published;
  if (rules?.url) links.push({key:'rules',label:'Регламент соревнований',
    fileName:rules.fileName || 'Регламент USD',openPath:'/rules',downloadUrl:rules.url});
  if (legal?.legalApproved !== true) return links;
  for (const [key, doc] of Object.entries(legal.documents || {})) {
    if (!Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENT_LABELS,key) ||
        !doc?.targetId?.startsWith('legal-document-' + key + '-') || !doc?.url) continue;
    links.push({key,label:LEGAL_DOCUMENT_LABELS[key],fileName:doc.fileName || 'Документ USD',
      openPath:'/documents/' + encodeURIComponent(key), downloadUrl:doc.url});
  }
  return links;
}
