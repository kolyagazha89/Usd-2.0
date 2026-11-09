import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const file=(name)=>readFile(new URL(name,import.meta.url),'utf8');

test('season report exposes PDF printing only for a loaded real report',async()=>{
 const source=await file('../src/admin/SeasonReportPage.tsx');
 assert.match(source,/title="Отчёт по сезону"/);
 assert.match(source,/window\.print\(\)/);
 assert.match(source,/Печать\s*\/\s*PDF/);
 assert.match(source,/disabled=\{!report\|\|busy\|\|loading\}/);
 assert.match(source,/className="usd-season-report-page"/);
 assert.match(source,/className="season-report-document"/);
 assert.match(source,/comparison\.changes\[key\]/);
 assert.match(source,/report\.notes\.join/);
});
test('print rules preserve actual tables and hide admin controls in a readable A4 PDF',async()=>{
 const css=await file('../src/admin/season-report.css');
 assert.match(css,/@media print/);
 assert.match(css,/@page\{size:A4 portrait/);
 assert.match(css,/body:has\(\.usd-season-report-page\) \.app-shell > \.sidebar/);
 assert.match(css,/\.season-report-filters/);
 assert.match(css,/\.season-report-table-wrap\{overflow:visible/);
 assert.match(css,/\.season-report-table-wrap thead\{display:table-header-group/);
 assert.match(css,/break-inside:avoid/);
});

test('candidate browser covers season report printing with synthetic server-only data',async()=>{
 const qa=await file('../../scripts/candidate-browser-qa.mjs');
 assert.match(qa,/\/admin\/season-report/);
 assert.match(qa,/\/statistics\/season-report\/s1/);
 assert.match(qa,/\.season-report-document/);
 assert.match(qa,/page\.emulateMedia\(\{media:'print'\}\)/);
});
