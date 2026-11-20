import { BadRequestException } from '@nestjs/common';

export const PUBLICATION_CONSENT_KEYS = [
  'identity', 'city', 'team', 'results', 'car',
  'profilePhoto', 'carPhoto', 'eventPhoto', 'promotionPhoto',
] as const;
export type PublicationConsentKey = (typeof PUBLICATION_CONSENT_KEYS)[number];
export type PublicationConsentChoices = Record<PublicationConsentKey, boolean>;

export const emptyPublicationConsent = (): PublicationConsentChoices => ({
  identity: false, city: false, team: false, results: false,
  car: false, profilePhoto: false, carPhoto: false,
  eventPhoto: false, promotionPhoto: false,
});

/** Never interpret missing, malformed, or old data as a granted permission. */
export function readPublicationConsent(input: unknown): PublicationConsentChoices {
  const obj = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown> : {};
  const choices = emptyPublicationConsent();
  for (const key of PUBLICATION_CONSENT_KEYS) choices[key] = obj[key] === true;
  return choices;
}

/** Accept a complete explicit decision; no implicit opt-ins or invented keys. */
export function validatePublicationConsent(input: unknown): PublicationConsentChoices {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException('Выберите разрешения на публикацию отдельно');
  }
  const obj = input as Record<string, unknown>;
  if (Object.keys(obj).length !== PUBLICATION_CONSENT_KEYS.length ||
      PUBLICATION_CONSENT_KEYS.some(key => typeof obj[key] !== 'boolean')) {
    throw new BadRequestException('Передайте явное решение по каждому виду публикации');
  }
  return readPublicationConsent(obj);
}

export function publicationVersion(legal: unknown): string | null {
  const record = legal && typeof legal === 'object' ? legal as Record<string, unknown> : {};
  const version = String(record.legalVersion ?? '').trim();
  const documents = record.documents && typeof record.documents === 'object'
    ? record.documents as Record<string, unknown> : {};
  const publication = documents.photoProfileConsent && typeof documents.photoProfileConsent === 'object'
    ? documents.photoProfileConsent as Record<string, unknown> : {};
  const documentIsPublished = typeof publication.url === 'string' && publication.url.trim().length > 0 &&
    typeof publication.targetId === 'string' &&
    publication.targetId.startsWith('legal-document-photoProfileConsent-');
  return record.legalApproved === true && version && documentIsPublished
    ? 'publication-v' + version + '@' + publication.targetId : null;
}

type ConsentRow = {
  isPublic?: boolean;
  publicationConsent?: unknown;
  publicationConsentAt?: Date | null;
  publicationConsentVersion?: string | null;
  publicationRestrictions?: string | null;
};

/** The subject consents to this specific immutable publication document, not to
 * every unrelated revision of the site's general legal settings. Keep accepting
 * legacy publication-vN@documentId records only while that *same* separately
 * approved document remains published. Changed or absent document fails closed. */
export function consentMatchesPublicationDocument(recordedVersion: string | null | undefined, currentVersion: string | null): boolean {
  if (!recordedVersion || !currentVersion) return false;
  const documentId = (version: string): string | null => {
    const match = /^publication-v[^@]+@(legal-document-photoProfileConsent-[A-Za-z0-9-]+)$/.exec(version);
    return match?.[1] ?? null;
  };
  const activeDocument = documentId(currentVersion);
  return Boolean(activeDocument && activeDocument === documentId(recordedVersion));
}

/** isPublic controls visibility, consent controls permitted categories independently. */
export function mayPublish(row: ConsentRow | null | undefined, key: PublicationConsentKey, version: string | null): boolean {
  return Boolean(row?.isPublic === true &&
    !String(row?.publicationRestrictions ?? '').trim() &&
    row.publicationConsentAt && consentMatchesPublicationDocument(row.publicationConsentVersion, version) &&
    readPublicationConsent(row.publicationConsent)[key]);
}
