import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = async file => readFile(new URL('../src/'+file,import.meta.url),'utf8');

test('catalog workspace separates browsing, bulk management, import, and requests',async()=>{
 const code=await source('admin/CatalogPage.tsx');
 for(const key of ['browse','manage','import']){
  assert.match(code,new RegExp("aria-pressed=\\{workspace==='"+key+"'\\}"));
 }
 assert.match(code,/aria-label="Рабочие вкладки каталога"/);
 assert.match(code,/workspace==='import'&&<section className="panel catalog-import-panel"/);
 assert.match(code,/workspace==='manage'&&<section className="panel catalog-merge"/);
 assert.match(code,/workspace==='manage'&&<section className="panel catalog-bulk-panel"/);
 assert.match(code,/workspace==='browse'&&<div className="catalog-two-column"/);
 assert.match(code,/tab==='requests'/);
 assert.match(code,/vibration\?<></);
 assert.match(code,/importConfirmed/);
});

test('registration keeps original actions while putting search ahead of bulky overview',async()=>{
 const code=await source('admin/RegistrationsPage.tsx');
 assert.ok(code.indexOf('className="event-ops-search"') < code.indexOf('className="event-ops-overview"'));
 assert.match(code,/onClick=\{\(\)=>go\(walkInRegistrationPath\(stageId\)\)\}/);
 assert.match(code,/aria-label="Поиск регистраций"/);
 assert.match(code,/className="toolbar stage-picker"/);
});

test('event day preserves QR and inspection actions, with mobile-only advanced actions',async()=>{
 const code=await source('admin/EventDayPage.tsx');
 const css=await source('admin/admin-shell-layout.css');
 assert.match(code,/event-day-more-toggle/);
 assert.match(code,/aria-expanded=\{showExtraDayActions\}/);
 assert.match(code,/id="event-day-extra-actions"/);
 assert.match(code,/Судейский протокол/);
 assert.match(code,/QR \/ USD ID/);
 assert.match(css,/\.event-day-extra-actions\.is-open/);
 assert.match(css,/\.event-day-more-toggle/);
});

test('existing admin stylesheet remains last and mobile participant/car cards are scoped',async()=>{
 const code=await source('main.tsx');
 const css=await source('admin/admin-shell-layout.css');
 assert.equal([...code.matchAll(/import '\.\/[^']+\.css';/g)].at(-1)?.[0],"import './admin/admin-shell-layout.css';");
 assert.match(css,/\[data-resource="\/admin\/participants"\]/);
 assert.match(css,/\.usd-admin-cars-list \.data-table/);
 assert.match(css,/\.catalog-workspace-tabs/);
 assert.match(css,/@media\s*\(max-width:760px\)/);
 assert.match(css,/min-height:44px/);
});
