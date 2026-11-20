import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('season sponsor analytics shows separate speaker/amplifier rankings, not a combined five-type leaderboard',async()=>{
 const view=await readFile(new URL('../src/admin/StatisticsPage.tsx',import.meta.url),'utf8');
 assert.match(view,/Бренды динамиков и усилителей/);
 assert.match(view,/analytics\.speakerBrands/);
 assert.match(view,/analytics\.amplifierBrands/);
 assert.match(view,/Динамики/);
 assert.match(view,/Усилители/);
 assert.doesNotMatch(view,/analytics\.configurationBrands\.map/,'never render mixed historical brand leaderboards');
 assert.match(view,/регистраций с брендом/,'percent describes distinct registrations');
});

test('sponsor brand rankings adapt to mobile without horizontal overflow',async()=>{
 const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
 assert.match(css,/\.statistics-audio-groups\s*\{/);
 assert.match(css,/@media\(max-width:800px\)[\s\S]*?\.statistics-audio-groups\s*\{grid-template-columns:1fr\}/);
});
