import { BadRequestException } from '@nestjs/common';
import {
  emptyPublicationConsent, mayPublish, publicationVersion,
  readPublicationConsent, validatePublicationConsent,
} from './publication-consent';

describe('separate subject-controlled publication permission', () => {
  const legal = { legalApproved: true, legalVersion: '1.5', documents: { photoProfileConsent: { targetId: 'legal-document-photoProfileConsent-current', url: 'https://example.org/photo-profile.docx' } } };
  const version = publicationVersion(legal);

  it('starts with nine independent unchecked categories', () => {
    expect(Object.keys(emptyPublicationConsent())).toHaveLength(9);
    expect(Object.values(readPublicationConsent(null)).every(value => value === false)).toBe(true);
  });

  it('rejects implied, partial and malformed permission submissions', () => {
    expect(() => validatePublicationConsent({ identity: true })).toThrow(BadRequestException);
    expect(() => validatePublicationConsent({ ...emptyPublicationConsent(), city: 'true' })).toThrow(BadRequestException);
    expect(() => validatePublicationConsent({ ...emptyPublicationConsent(), all: true })).toThrow(BadRequestException);
  });

  it('allows only explicitly selected categories on the approved version', () => {
    const choices = { ...emptyPublicationConsent(), identity: true, results: true };
    const row = { isPublic: true, publicationConsent: validatePublicationConsent(choices),
      publicationConsentAt: new Date(), publicationConsentVersion: version };
    expect(mayPublish(row, 'identity', version)).toBe(true);
    expect(mayPublish(row, 'results', version)).toBe(true);
    expect(mayPublish(row, 'profilePhoto', version)).toBe(false);
    expect(mayPublish(row, 'carPhoto', version)).toBe(false);
    expect(mayPublish({ ...row, publicationRestrictions: 'Запрещаю публикацию в социальных сетях' }, 'identity', version)).toBe(false);
    expect(mayPublish({ ...row, isPublic: false }, 'identity', version)).toBe(false);
    expect(mayPublish(row, 'identity', 'publication-v2')).toBe(false);
  });

  it('keeps the existing explicit publication consent when an unrelated legal revision changes but the signed publication document stays the same', () => {
    const original = publicationVersion(legal);
    const refreshed = publicationVersion({ ...legal, legalVersion: '8' });
    const choices = { ...emptyPublicationConsent(), identity: true, profilePhoto: false };
    const row = { isPublic: true, publicationConsentAt: new Date(),
      publicationConsentVersion: original, publicationConsent: choices };
    expect(original).not.toBe(refreshed);
    expect(mayPublish(row, 'identity', refreshed)).toBe(true);
    expect(mayPublish(row, 'profilePhoto', refreshed)).toBe(false);
  });

  it('requires a new explicit decision if the approved publication document itself changes', () => {
    const current = publicationVersion({ ...legal, legalVersion: '8', documents: {
      photoProfileConsent: { targetId: 'legal-document-photoProfileConsent-replaced', url: 'https://example.org/replaced.docx' },
    } });
    const choices = { ...emptyPublicationConsent(), identity: true };
    const recorded = { isPublic: true, publicationConsentAt: new Date(),
      publicationConsentVersion: version, publicationConsent: choices };
    expect(mayPublish(recorded, 'identity', current)).toBe(false);
    expect(mayPublish({ ...recorded, publicationConsentVersion: 'publication-v7@invalid-document' }, 'identity', current)).toBe(false);
    expect(mayPublish({ ...recorded, publicationConsentVersion: null }, 'identity', current)).toBe(false);
    expect(mayPublish(recorded, 'identity', null)).toBe(false);
  });

  it('treats revoked, unapproved or unrecorded permission as denial', () => {
    expect(publicationVersion({ legalApproved: false, legalVersion: '1.5' })).toBeNull();
    expect(publicationVersion({ legalApproved: true, legalVersion: '1.5' })).toBeNull();
    expect(mayPublish({ isPublic: true, publicationConsent: { profilePhoto: true } }, 'profilePhoto', version)).toBe(false);
    expect(mayPublish({ isPublic: true, publicationConsent: { profilePhoto: true },
      publicationConsentAt: new Date(), publicationConsentVersion: version }, 'profilePhoto', null)).toBe(false);
  });
});
