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

test('judge gate checks published protocol document and requires confirmation of signed paper', async()=>{
 const staff=await read('../src/admin/InspectionsPage.tsx');
 assert.match(staff,/legal\.documents\?\.officialProtocolConsent/);
 assert.match(staff,/protocolReady/);
 assert.match(staff,/подписанный оригинал передан организатору/);
});


test('CMS release status shows missing protocol document rather than a green approval',async()=>{
 const {missingLegalDocuments}=await import('../src/admin/legal-release-readiness.ts');
 const descriptors=[{key:'privacyPolicy',title:'Политика'},{key:'officialProtocolConsent',title:'Протокол'}];
 const docs={privacyPolicy:{targetId:'legal-document-privacyPolicy-1',fileName:'privacy.docx',url:'https://api.example.test/doc'}};
 assert.deepEqual(missingLegalDocuments(descriptors,docs),['Протокол']);
 assert.deepEqual(missingLegalDocuments(descriptors,{...docs,officialProtocolConsent:{targetId:'legal-document-officialProtocolConsent-1',fileName:'protocol.docx',url:'https://api.example.test/doc'}}),[]);
});

test('single-batch legal release upload requires exactly the seven named DOCX',async()=>{
 const {planLegalReleaseUpload}=await import('../src/admin/legal-release-readiness.ts');
 const descriptors=[
  {key:'privacyPolicy',title:'Политика'},{key:'personalDataConsent',title:'Обработка'},
  {key:'termsOfUse',title:'Соглашение'},{key:'cookiePolicy',title:'Cookie'},
  {key:'newsletterConsent',title:'Рассылки'},{key:'photoProfileConsent',title:'Фото'},
  {key:'officialProtocolConsent',title:'Протокол'},
 ];
 const originals=['01_usd_privacy_policy.docx','02_usd_personal_data_consent.docx',
  '03_usd_terms_of_use.docx','04_usd_cookie_policy.docx','05_usd_newsletter_consent.docx',
  '06_usd_publication_consent.docx','07_usd_official_protocol_consent.docx'];
 const files=originals.map(name=>({name,size:1200,type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
 assert.deepEqual(planLegalReleaseUpload(files,descriptors).map(x=>x.key),descriptors.map(x=>x.key));
 assert.throws(()=>planLegalReleaseUpload(files.slice(0,6),descriptors),/недоста/);
 assert.throws(()=>planLegalReleaseUpload([...files.slice(0,6),{...files[0]}],descriptors),/дубликат/);
 assert.throws(()=>planLegalReleaseUpload([...files.slice(0,6),{...files[6],size:0}],descriptors),/размер/);
});
