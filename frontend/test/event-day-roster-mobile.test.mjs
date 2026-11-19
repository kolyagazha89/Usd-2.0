import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=path=>readFile(new URL('../src/'+path,import.meta.url),'utf8');

test('event-day mobile roster is reachable directly without changing stage or filtering',async()=>{
 const code=await source('admin/EventDayPage.tsx');
 assert.match(code,/id="event-day-records" className="panel event-day-roster"/);
 assert.match(code,/className="secondary-button compact event-day-list-jump" onClick=\{jumpToRoster\}/);
 assert.match(code,/document\.getElementById\('event-day-records'\)\?\.scrollIntoView/);
 assert.match(code,/document\.activeElement as HTMLElement\|null\)\?\.blur/);
 assert.match(code,/const filterCounts:Record<DayStatus,number>=\{ALL:counts\.active,PENDING:counts\.pending,PASSED:counts\.passed,FAILED:counts\.failed,EQUIPMENT:counts\.equipment,CANCELLED:counts\.cancelled\}/);
 assert.match(code,/const filteredTotal=filterCounts\[filter\]/);
});

test('six mobile status filters retain counts while the duplicate metric wall is hidden',async()=>{
 const code=await source('admin/EventDayPage.tsx');
 const css=await source('admin/admin-shell-layout.css');
 const local=await source('admin/event-day.css');
 assert.match(code,/\['ALL','PENDING','PASSED','FAILED','EQUIPMENT','CANCELLED'\] as DayStatus\[\]/);
 assert.match(code,/className="event-day-filter-count" aria-hidden="true"/);
 assert.match(code,/filterCounts\[value\]/);
 assert.match(css,/\.event-day-page \.event-day-overview \{display:none!important\}/);
 assert.match(css,/\.event-day-page \.event-day-filter-count \{\s*display:inline-flex/);
 assert.match(local,/\.event-day-filter-count \{display:none\}/,'desktop metric cards remain available without redundant tab counts');
 assert.match(css,/@media\s*\(max-width:760px\)/);
});

test('phone search clear remains 44px and has an accessible name without squeezed text',async()=>{
 const code=await source('admin/EventDayPage.tsx');
 const css=await source('admin/admin-shell-layout.css');
 assert.match(code,/className="secondary-button compact event-day-search-clear" aria-label="Очистить поиск"/);
 assert.match(code,/<X size=\{16\} aria-hidden="true"\/>/);
 assert.match(css,/\.event-day-search-clear \{[^}]*min-height:44px/);
 assert.match(css,/\.event-day-search-clear span \{display:none\}/);
 assert.match(css,/\.event-day-roster \{[^}]*scroll-margin-top:calc\(90px \+ env\(safe-area-inset-top,0px\)\)/);
});
