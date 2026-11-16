import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {siteSettingsChangedSections} from '../src/admin/site-settings-save.ts';

test('saving one contact field never writes stale unrelated settings', () => {
 const old={contacts:{email:'old@usd.test',vk:'https://vk.com/old'},registration:{rulesDocument:{published:{id:'old-rules'}}},homepage:{heroTitle:'USD'},_newsRevision:'n1',_partnersRevision:'p1'};
 const current={...old,contacts:{email:'new@usd.test',vk:'https://vk.com/old'}};
 assert.deepEqual(siteSettingsChangedSections(old,current),{contacts:current.contacts});
});

test('edits across multiple tabs are saved together, without unrelated payload',()=>{
 const old={contacts:{email:'one@usd.test'},footer:{text:'first'},seo:{title:'USD'},updatedAt:'date-old'};
 const current={...old,contacts:{email:'two@usd.test'},footer:{text:'second'}};
 assert.deepEqual(siteSettingsChangedSections(old,current),{contacts:current.contacts,footer:current.footer});
});

test('changes to news and partners carry concurrency revisions',()=>{
 const old={news:[{id:'a'}],partners:[{id:'b'}],_newsRevision:'news-v1',_partnersRevision:'partners-v1'};
 const next={...old,news:[{id:'a',title:'Change'}],partners:[{id:'b',isPublished:true}]};
 assert.deepEqual(siteSettingsChangedSections(old,next),{news:next.news,partners:next.partners,_newsRevision:'news-v1',_partnersRevision:'partners-v1'});
});

test('metadata-only changes never produce a settings write',()=>{
 const old={contacts:{email:'usd@example.org'},updatedAt:'old',_newsRevision:'1'};
 const now={...old,updatedAt:'new',_newsRevision:'2'};
 assert.deepEqual(siteSettingsChangedSections(old,now),{});
});

test('site settings form saves only a changed-section payload',()=>{
 const code=readFileSync(new URL('../src/admin/SiteSettingsPage.tsx',import.meta.url),'utf8');
 assert.match(code,/siteSettingsChangedSections\(JSON\.parse\(savedSnapshot\),settings\)/);
 assert.match(code,/updateSiteSettings\(changedSections\)/);
});
