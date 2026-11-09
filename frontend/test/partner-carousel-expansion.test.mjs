import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {shortPartnerDescription} from '../src/public/partner-description.ts';

test('partner description collapses safely and can be expanded in place',()=>{
 const source='Партнёры предоставляют услуги по установке автозвука. '.repeat(6);
 const preview=shortPartnerDescription(source,120);
 assert.equal(preview.truncated,true);
 assert.ok(preview.text.endsWith('…'));
 assert.ok([...preview.text].length<=122);
 assert.deepEqual(shortPartnerDescription('Коротко и понятно',120),{text:'Коротко и понятно',truncated:false});
 assert.deepEqual(shortPartnerDescription('',120),{text:'',truncated:false});
 assert.equal(shortPartnerDescription('🔊'.repeat(100),10).text,'🔊'.repeat(10)+'…');
});

test('ordinary partners have a swipe carousel only on homepage, and full-width equal-height cards in the directory',async()=>{
 const [showcase,css]=await Promise.all([
  readFile(new URL('../src/public/PartnerShowcase.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/dark-velocity-sitewide.css',import.meta.url),'utf8'),
 ]);
 assert.match(showcase,/usd-partner-carousel/);
 assert.match(showcase,/compact&&tier\.id==='REGULAR'/);
 assert.match(showcase,/aria-label="Карусель партнёров чемпионата"/);
 assert.match(showcase,/shortPartnerDescription\(partner\.description/);
 assert.match(showcase,/Читать далее/);
 assert.match(showcase,/aria-expanded=\{expanded\}/);
 assert.match(css,/\.usd-partner-showcase--home \.usd-partner-tier--regular \.usd-partner-carousel/);
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.match(css,/\.usd-partner-showcase--full \.usd-partner-tier--regular \.usd-partner-grid/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.usd-partner-showcase--full \.usd-partner-tier--regular \.usd-partner-card/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
