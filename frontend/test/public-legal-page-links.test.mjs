import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publicLegalPageDocumentPath} from '../src/public/public-document-links.ts';

const approved={legalApproved:true,documents:{
 privacyPolicy:{targetId:'legal-document-privacyPolicy-v18',url:'https://api.usd-russia.ru/media/public-file/SITE_ASSET/legal-document-privacyPolicy-v18',fileName:'01_usd_privacy_policy.docx'},
 termsOfUse:{targetId:'legal-document-termsOfUse-v18',url:'https://api.usd-russia.ru/media/public-file/SITE_ASSET/legal-document-termsOfUse-v18',fileName:'03_usd_terms_of_use.docx'},
 personalDataConsent:{targetId:'legal-document-personalDataConsent-v18',url:'https://api.usd-russia.ru/media/public-file/SITE_ASSET/legal-document-personalDataConsent-v18',fileName:'02_usd_personal_data_consent.docx'},
 cookiePolicy:{targetId:'legal-document-cookiePolicy-v18',url:'https://api.usd-russia.ru/media/public-file/SITE_ASSET/legal-document-cookiePolicy-v18'},
}};

test('each public legal text page links only its approved Word reader',()=>{
 assert.equal(publicLegalPageDocumentPath('privacy',approved),'/documents/privacyPolicy');
 assert.equal(publicLegalPageDocumentPath('terms',approved),'/documents/termsOfUse');
 assert.equal(publicLegalPageDocumentPath('consent',approved),'/documents/personalDataConsent');
 assert.equal(publicLegalPageDocumentPath('anything',approved),null);
});

test('legal pages never expose draft, revoked, wrong-key or missing attachments',()=>{
 assert.equal(publicLegalPageDocumentPath('privacy',{...approved,legalApproved:false}),null);
 assert.equal(publicLegalPageDocumentPath('privacy',{...approved,documents:{privacyPolicy:{targetId:'legal-document-termsOfUse-bad',url:'https://example.org/file'}}}),null);
 assert.equal(publicLegalPageDocumentPath('privacy',{legalApproved:true,documents:{}}),null);
 assert.equal(publicLegalPageDocumentPath('privacy',undefined),null);
});

test('privacy, terms and consent screens never render upload filenames or the full Word inventory',async()=>{
 const source=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8');
 const start=source.indexOf("{(page==='privacy'||page==='terms'||page==='consent')");
 const end=source.indexOf("{page==='stages'",start);
 assert.ok(start>0&&end>start,'public legal screens must exist');
 const legalBlock=source.slice(start,end);
 assert.doesNotMatch(legalBlock,/\.fileName|Object\.entries\(settings\.legal\.documents|Документы Word/);
 assert.match(legalBlock,/publicLegalPageDocumentPath/);
 assert.match(legalBlock,/href="\/documents"/);
 assert.match(legalBlock,/Все документы USD/);
});
