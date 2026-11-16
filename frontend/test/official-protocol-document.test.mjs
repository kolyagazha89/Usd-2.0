import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('official results publication terms have a dedicated approved document reader and admin upload',async()=>{
 const [links,seo,admin]=await Promise.all([
  read('../src/public/public-document-links.ts'),read('../src/public/seo-model.ts'),
  read('../src/admin/LegalDocumentsPage.tsx')]);
 assert.match(links,/officialProtocolConsent:\s*'Согласие на публикацию ФИО/);
 assert.match(seo,/officialProtocolConsent:\s*'Согласие на публикацию ФИО/);
 assert.match(admin,/key:'officialProtocolConsent'/);
 assert.match(admin,/filename:'usd-official-protocol-consent.docx'/);
});

test('athlete and event staff can read the dedicated document before consent',async()=>{
 const [app,staff]=await Promise.all([
  read('../src/App.tsx'),read('../src/admin/InspectionsPage.tsx')]);
 assert.match(app,/href="\/documents\/officialProtocolConsent"/);
 assert.match(staff,/href="\/documents\/officialProtocolConsent"/);
 assert.match(app,/Перед подтверждением прочитайте/);
});
