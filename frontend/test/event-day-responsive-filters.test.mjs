import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('competition day status tabs wrap into readable touch targets instead of escaping 320/390/1024px viewports',async()=>{
 const css=await readFile(new URL('../src/admin/event-day.css',import.meta.url),'utf8');
 const view=await readFile(new URL('../src/admin/EventDayPage.tsx',import.meta.url),'utf8');
 assert.match(view,/event-day-filter-tabs/);
 assert.match(view,/aria-pressed=\{filter===value\}/);
 assert.match(css,/@media\(max-width:1150px\)\{[^}]*\.event-day-filter-tabs\s*\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/s);
 assert.match(css,/@media\(max-width:650px\)\{[^}]*\.event-day-filter-tabs\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/s);
 assert.match(css,/\.event-day-filter-tabs button\s*\{[^}]*min-height:44px[^}]*white-space:normal/s);
});
