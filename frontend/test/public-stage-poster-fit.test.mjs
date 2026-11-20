import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('homepage next-stage poster preserves all of a portrait poster without cropping on desktop',async()=>{
 const css=await readFile(new URL('../src/sitewide-premium-2026.css',import.meta.url),'utf8');
 const rule=css.match(/body \.usd-live \.p-next-poster\s*\{([^}]+)\}/)?.[1]??'';
 assert.ok(rule,'homepage stage poster has scoped styling');
 assert.match(rule,/object-fit\s*:\s*contain\s*;/,'cover would crop the competition details and sponsor logos');
 assert.match(rule,/background\s*:/,'letterbox must match the dark poster frame');
});

test('desktop stage-detail poster scales under viewport height while mobile retains natural size',async()=>{
 const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
 const rule=css.match(/@media\s*\(min-width:\s*761px\)\s*\{\s*\.public-site \.public-stage-detail img\.public-stage-poster\s*\{([^}]+)\}/)?.[1]??'';
 assert.ok(rule,'desktop-only poster fit override must exist');
 assert.match(rule,/max-height\s*:\s*calc\(100dvh\s*-\s*\d+px\)\s*!important/);
 assert.match(rule,/max-width\s*:\s*100%/);
 assert.match(rule,/object-fit\s*:\s*contain\s*!important/);
 assert.match(css,/\.public-site \.public-stage-detail img\.public-stage-poster\s*\{[\s\S]*?max-height:\s*none\s*!important/,'legacy mobile natural-height styling remains');
});

test('stage listing retains the entire portrait artwork in desktop cards',async()=>{
 const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
 const rules=css.match(/@media\s*\(min-width:\s*761px\)\s*\{[\s\S]*?\.public-site \.public-stage-card\.usd-stage-card-approved img\.public-stage-list-poster\s*\{([^}]+)\}/)?.[1]??'';
 assert.ok(rules,'desktop stage card poster fit has its own bounded layout');
 assert.match(rules,/max-height:\s*min\(\s*60dvh\s*,\s*620px\s*\)\s*!important/);
 assert.match(rules,/object-fit:\s*contain\s*!important/);
 assert.match(rules,/max-width:\s*100%\s*!important/);
 assert.match(rules,/aspect-ratio:\s*auto\s*!important/);
});
