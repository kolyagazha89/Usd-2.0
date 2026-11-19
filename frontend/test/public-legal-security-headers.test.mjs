import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publicDocumentListState} from '../src/public/public-document-links.ts';

const approved={legalApproved:true,documents:{
 privacyPolicy:{targetId:'legal-document-privacyPolicy-v18',url:'https://api.usd-russia.ru/media/public-file/SITE_ASSET/legal-document-privacyPolicy-v18'},
 cookiePolicy:{targetId:'legal-document-cookiePolicy-v18',url:'https://api.usd-russia.ru/media/public-file/SITE_ASSET/legal-document-cookiePolicy-v18'},
}};

test('document listing does not claim files are unpublished before public settings arrive',()=>{
 assert.deepEqual(publicDocumentListState(undefined,{},true),{status:'loading',files:[]});
 assert.deepEqual(publicDocumentListState(undefined,{},false),{status:'error',files:[]});
 const shown=publicDocumentListState(approved,{},false);
 assert.equal(shown.status,'published');
 assert.deepEqual(shown.files.map(file=>file.openPath),['/documents/privacyPolicy','/documents/cookiePolicy']);
});

test('revoked documents remain hidden and approved standalone legal texts are still linked',()=>{
 assert.deepEqual(publicDocumentListState({legalApproved:false,documents:approved.documents},{},false),{status:'empty',files:[]});
 const fallback=publicDocumentListState({legalApproved:true,privacyText:'Утверждённая политика',consentText:'Согласие',termsText:'Условия'}, {},false);
 assert.equal(fallback.status,'published');
 assert.deepEqual(fallback.files.map(file=>file.openPath),['/privacy','/consent','/terms']);
});

test('online nginx sends enforcing anti-framing CSP and one-year HSTS on HTML, redirects and errors',async()=>{
 const nginx=await readFile(new URL('../nginx.conf',import.meta.url),'utf8');
 assert.match(nginx,/add_header Content-Security-Policy "(?:[^"]*; )*frame-ancestors 'none'/);
 assert.match(nginx,/add_header Strict-Transport-Security "max-age=31536000"/);
 assert.match(nginx,/Content-Security-Policy-Report-Only/);
 assert.doesNotMatch(nginx,/includeSubDomains; preload/);
 const server=nginx.slice(nginx.indexOf('server {'));
 for(const header of ['Content-Security-Policy','Strict-Transport-Security']){
  assert.match(server,new RegExp('add_header '+header+' [^\\n]+ always;'));
 }
 // Location-scoped add_header on nginx 1.27 would suppress inherited security headers.
 assert.doesNotMatch(server,/location [^{]+\\{[^}]*add_header/s);
});
