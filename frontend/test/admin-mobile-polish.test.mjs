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

test('registration keeps original actions but moves lists ahead of optional metrics',async()=>{
 const code=await source('admin/RegistrationsPage.tsx');
 assert.ok(code.indexOf('className="event-ops-search"') < code.indexOf('className="event-ops-main-actions"') || code.indexOf('className="event-ops-search"') < code.indexOf('event-ops-quick-actions event-ops-main-actions'));
 assert.match(code,/<details className="event-ops-metrics-drawer"/);
 assert.doesNotMatch(code,/className="event-ops-overview"/);
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

test('participant search can be cleared and has actionable, accurate empty results',async()=>{
 const code=await source('admin/ResourcePage.tsx');
 assert.match(code,/path==='\/admin\/participants'&&search/);
 assert.match(code,/aria-label="Очистить поиск участников"/);
 assert.match(code,/Ничего не найдено по запросу/);
 assert.match(code,/Показать всех участников/);
 assert.match(code,/tabIndex=\{0\}/);
 assert.match(code,/onKeyDown=\{e=>\{if\(e\.target===e\.currentTarget/);
});

test('cars keep accessible row actions, search reset, and useful empty state',async()=>{
 const code=await source('admin/CarsPage.tsx');
 assert.match(code,/aria-label="Очистить поиск автомобилей"/);
 assert.match(code,/Показать все автомобили/);
 assert.match(code,/aria-label=\{'Открыть автомобиль: '/);
 assert.match(code,/onKeyDown=\{e=>\{if\(e.target===e.currentTarget/);
 assert.match(code,/aria-label=\{'Редактировать автомобиль/);
 assert.match(code,/aria-label=\{'Скрыть автомобиль/);
});

test('operator empty filter state has a one-click recovery and accurate filtered totals',async()=>{
 const code=await source('admin/EventDayPage.tsx');
 assert.match(code,/const filteredTotal=/);
 assert.match(code,/visible.length\+' из '\+filteredTotal/);
 assert.match(code,/Сбросить поиск и статус/);
 assert.match(code,/setSearch\(''\);setFilter\('ALL'\)/);
});

test('catalog filters offer reset and do not destroy user data',async()=>{
 const code=await source('admin/CatalogPage.tsx');
 assert.match(code,/aria-label="Сбросить фильтры комплектующих"/);
 assert.match(code,/setQuery\(''\);setActivityFilter\('ALL'\)/);
 assert.match(code,/setLifecycleFilter\('ALL'\)/);
 assert.match(code,/setModelBrand\(''\)/);
});

test('mobile catalog category picker exposes all categories without a horizontal swipe',async()=>{
 const code=await source('admin/CatalogPage.tsx');
 const css=await source('admin/admin-shell-layout.css');
 assert.match(code,/className="catalog-category-mobile"/);
 assert.match(code,/aria-label="Категория оборудования"/);
 assert.match(code,/onChange=\{e=>selectCategory\(e\.target\.value as CatalogCategory\)\}/);
 assert.match(code,/onClick=\{\(\)=>selectCategory\(x\.value\)\}/);
 assert.match(css,/\.catalog-category-mobile\s*\{display:none\}/);
 assert.match(css,/\.catalog-category-panel \.catalog-category-tabs \{\s*display:none!important/);
 assert.match(css,/\.catalog-category-panel \.catalog-category-mobile \{\s*display:grid!important/);
});

test('mobile competition operations put the selected stage above compact filters at full width',async()=>{
 const css=await source('admin/admin-shell-layout.css');
 assert.match(css,/\.event-ops-page \.stage-picker\s*\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.event-ops-page \.stage-picker>label\s*\{[^}]*grid-row:1/);
 assert.match(css,/\.event-ops-page \.stage-picker>\.usd-filter-drawer\s*\{[^}]*grid-row:2/);
 for(const file of ['RegistrationsPage.tsx','InspectionsPage.tsx','ResultsPage.tsx']){
  const code=await source('admin/'+file);
  const picker=code.slice(code.indexOf('className="toolbar stage-picker'));
  assert.ok(picker.indexOf('<label>Этап')>=0&&picker.indexOf('<label>Этап')<picker.indexOf('<CollapsibleFilters'),file+' must put the stage before optional filters in DOM order');
 }
});
