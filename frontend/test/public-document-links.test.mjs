import test from 'node:test';
import assert from 'node:assert/strict';
import { publicDocumentLinks } from '../src/public/public-document-links.ts';

test('approved legal files open an internal reader instead of a cross-origin DOCX navigation', () => {
  const legal = { legalApproved: true, documents: {
    privacyPolicy: { targetId: 'legal-document-privacyPolicy-a', url: 'https://api.usd-russia.ru/media/public-file/SITE_ASSET/legal-document-privacyPolicy-a', fileName: 'Privacy.docx' },
    cookiePolicy: { targetId: 'legal-document-cookiePolicy-b', url: 'https://api.usd-russia.ru/media/public-file/SITE_ASSET/legal-document-cookiePolicy-b', fileName: 'Cookies.docx' },
    unknown: { targetId: 'other', url: 'https://example.com/unsafe' },
  } };
  const links = publicDocumentLinks(legal, { rulesDocument: { published: { url: 'https://api.usd-russia.ru/media/public-file/SITE_ASSET/rules-draft-valid', fileName: 'Rules.docx' } } });
  assert.deepEqual(links.map(x => x.openPath), ['/rules', '/documents/privacyPolicy', '/documents/cookiePolicy']);
  assert.ok(links.every(x => x.downloadUrl.startsWith('https://api.usd-russia.ru/')));
  assert.equal(links[1].fileName, 'Privacy.docx');
});

test('draft and missing legal documents are never presented as publicly readable', () => {
  const draft = { legalApproved: false, documents: { privacyPolicy: { targetId: 'legal-document-privacyPolicy-x', url: 'https://api.usd-russia.ru/file' } } };
  assert.deepEqual(publicDocumentLinks(draft, {}), []);
  assert.deepEqual(publicDocumentLinks({ legalApproved: true, documents: { constructor: { targetId: 'bad', url: 'https://example.test' } } }, {}), []);
  assert.deepEqual(publicDocumentLinks({ legalApproved: true, documents: { privacyPolicy: { targetId: 'wrong', url: 'https://api.usd-russia.ru/file' } } }, {}), []);
});


test('official protocol publication terms are a separate approved reader, never a draft', () => {
  const doc = { targetId: 'legal-document-officialProtocolConsent-v18', url: 'https://api.usd-russia.ru/media/public-file/SITE_ASSET/legal-document-officialProtocolConsent-v18', fileName: 'Протокол.docx' };
  const legal = { legalApproved: true, documents: { officialProtocolConsent: doc } };
  const links = publicDocumentLinks(legal, {});
  assert.deepEqual(links.map(item => item.openPath), ['/documents/officialProtocolConsent']);
  assert.equal(links[0].fileName, 'Протокол.docx');
  assert.deepEqual(publicDocumentLinks({ ...legal, legalApproved: false }, {}), []);
  assert.deepEqual(publicDocumentLinks({ ...legal, documents: { officialProtocolConsent: { ...doc, targetId: 'legal-document-photoProfileConsent-wrong' } } }, {}), []);
});

test('operator CMS and SEO know the official protocol document category', async () => {
  const { readFile } = await import('node:fs/promises');
  const [admin, seo] = await Promise.all([
    readFile(new URL('../src/admin/LegalDocumentsPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/public/seo-model.ts', import.meta.url), 'utf8'),
  ]);
  assert.match(admin, /key:'officialProtocolConsent'/);
  assert.match(admin, /filename:'usd-official-protocol-consent\.docx'/);
  assert.match(seo, /officialProtocolConsent:\s*'Согласие на публикацию ФИО/);
});
