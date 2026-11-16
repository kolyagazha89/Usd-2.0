/** A separate publication consent must be accessible as its own approved DOCX. */
export function hasApprovedProtocolConsentDocument(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const legal = value as {legalApproved?: unknown;documents?: Record<string, unknown>};
  const document = legal.documents?.officialProtocolConsent;
  if (!document || typeof document !== 'object' || Array.isArray(document)) return false;
  const {targetId,url} = document as {targetId?: unknown;url?: unknown};
  return legal.legalApproved === true &&
    typeof targetId === 'string' &&
    targetId.startsWith('legal-document-officialProtocolConsent-') &&
    targetId.length > 'legal-document-officialProtocolConsent-'.length &&
    typeof url === 'string' && url.trim().length > 0;
}
