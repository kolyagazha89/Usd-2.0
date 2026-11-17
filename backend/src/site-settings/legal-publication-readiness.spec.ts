import { jest } from '@jest/globals';
import { SiteSettingsService } from './site-settings.service';
import { withSettingsTransaction } from './test-transaction';
import { missingLegalDocumentKeys, REQUIRED_PUBLIC_LEGAL_DOCUMENT_KEYS } from './legal-publication-readiness';

const doc = (key: string) => ({
  targetId: 'legal-document-' + key + '-release18',
  url: 'https://api.usd-russia.ru/media/public-file/SITE_ASSET/legal-document-' + key + '-release18',
  fileName: key + '.docx',
});

const baseLegal = () => ({
  legalApproved: false, legalVersion: '6',
  ipName: 'ИП оператор USD', operatorAddress: 'Адрес оператора',
  personalDataEmail: 'privacy@example.org',
  privacyText: 'Политика', consentText: 'Согласие', termsText: 'Соглашение',
  documents: Object.fromEntries(REQUIRED_PUBLIC_LEGAL_DOCUMENT_KEYS.map(key => [key, doc(key)])),
});

describe('release 1.8 legal approval preflight', () => {
  it('detects a missing official protocol consent, even if six other DOCX exist', () => {
    const legal = baseLegal();
    delete (legal.documents as Record<string,unknown>).officialProtocolConsent;
    expect(missingLegalDocumentKeys(legal.documents)).toContain('officialProtocolConsent');
  });

  it('rejects forged or incomplete document references', () => {
    const legal = baseLegal();
    (legal.documents as Record<string,unknown>).officialProtocolConsent = {
      targetId:'legal-document-photoProfileConsent-other', url:'https://api.usd-russia.ru/file.docx',
    };
    expect(missingLegalDocumentKeys(legal.documents)).toContain('officialProtocolConsent');
  });

  it('accepts the seven independently named published DOCX references', () => {
    expect(missingLegalDocumentKeys(baseLegal().documents)).toEqual([]);
  });

  it('does not permit an operator approval with missing protocol terms', async () => {
    const legal = baseLegal();
    delete (legal.documents as Record<string,unknown>).officialProtocolConsent;
    const prisma:any = {
      siteSettings: {
        findUnique: jest.fn(async () => ({legal, contacts: { email:'contact@example.org' }})),
        upsert: jest.fn(async () => ({id:'default'})),
      },
      auditLog: {create: jest.fn(async () => ({}))},
    };
    const service = new SiteSettingsService(withSettingsTransaction(prisma));
    await expect(service.update({legal:{legalApproved:true}} as any,'operator-admin'))
      .rejects.toThrow('официальных протоколов');
    expect(prisma.siteSettings.upsert).not.toHaveBeenCalled();
  });

  it('allows approval only after every required Word document is present', async () => {
    const legal = baseLegal();
    const prisma:any = {
      siteSettings: {
        findUnique: jest.fn(async () => ({legal, contacts: { email:'contact@example.org' }})),
        upsert: jest.fn(async (args:any) => ({id:'default', ...args.create})),
      },
      auditLog: {create: jest.fn(async () => ({}))},
    };
    const service = new SiteSettingsService(withSettingsTransaction(prisma));
    const result = await service.update({legal:{legalApproved:true}} as any,'operator-admin');
    expect(result.settings.legal.legalApproved).toBe(true);
    expect(result.settings.legal.legalApprovedBy).toBe('operator-admin');
  });
});
