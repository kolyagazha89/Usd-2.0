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

/** Bind the consent to the exact approved DOCX, not only the legal version.
 * Replacing a document without changing the release label invalidates consent.
 */
export function currentProtocolConsentVersion(value:unknown):string|null {
  if(!hasApprovedProtocolConsentDocument(value))return null;
  const legal=value as {legalVersion?:unknown;documents:Record<string,any>};
  const version=String(legal.legalVersion??'').trim();
  const targetId=String(legal.documents.officialProtocolConsent.targetId);
  return version?version+'@'+targetId:null;
}

/** Same age gate in consent state and mutation, so minors do not see a broken opt-in. */
export function requiresProtocolRepresentative(birthDate:unknown,at:Date=new Date()):boolean {
 if(!birthDate)return false;
 const date=birthDate instanceof Date?birthDate:new Date(String(birthDate));
 if(!Number.isFinite(date.getTime()))return false;
 const years=at.getUTCFullYear()-date.getUTCFullYear()-
  (at.getUTCMonth()<date.getUTCMonth()||
   (at.getUTCMonth()===date.getUTCMonth()&&at.getUTCDate()<date.getUTCDate())?1:0);
 return years<18;
}
