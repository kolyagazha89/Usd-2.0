import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read = file => readFile(new URL(file, import.meta.url),'utf8');

test('one last-loaded admin layout contract owns all admin routes', async () => {
  const [entry, layout, shell] = await Promise.all([
    read('../src/main.tsx'),
    read('../src/admin/admin-shell-layout.css'),
    read('../src/admin/AdminShell.tsx'),
  ]);
  const imports = [...entry.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)].map(match=>match[1]);
  assert.equal(imports.at(-1),'./admin/admin-shell-layout.css',
    'admin geometry must override legacy/page/global themes last');
  assert.match(shell,/className="app-shell"/);
  assert.match(shell,/className="content"/);
  assert.match(layout,/body \.app-shell > \.main\s*\{/);
  assert.match(layout,/body \.app-shell \.main \.content > \.page\s*\{/);
  assert.match(layout,/\.admin-configurations-shell > \.participant-portal-main/);
  assert.match(layout,/max-inline-size: none !important;/,
    'all admin PageFrame routes must use the complete work area');
});

test('mobile drawer never reduces the main viewport, and matches AdminShell breakpoint', async () => {
  const [layout, shell, legacy] = await Promise.all([
    read('../src/admin/admin-shell-layout.css'),
    read('../src/admin/AdminShell.tsx'),
    read('../src/styles.css'),
  ]);
  assert.match(shell,/window\.innerWidth>800/);
  assert.match(legacy,/@media\(max-width:800px\)/);
  assert.match(layout,/@media \(max-width: 800px\)\s*\{/);
  assert.match(layout,/body \.app-shell > \.main\s*\{\s*margin-inline-start: 0 !important;\s*inline-size: 100% !important;/);
  assert.match(layout,/body \.app-shell > \.sidebar\s*\{\s*inline-size: min\(320px, calc\(100vw - 48px\)\) !important;/);
  assert.match(layout,/body \.app-shell > \.mobile-backdrop\s*\{/);
  assert.match(layout,/overflow-x: clip;/);
  assert.match(layout,/box-sizing: border-box !important;/);
});

test('graphite navigation stays neutral, selected state and focus remain branded red', async () => {
  const [layout, source] = await Promise.all([
    read('../src/admin/admin-shell-layout.css'),
    read('../src/dark-velocity-sitewide.css'),
  ]);
  assert.match(layout,/background: linear-gradient\(180deg,#111114,#080809\) !important;/);
  assert.match(layout,/scrollbar-color: #56565e transparent;/);
  assert.match(layout,/\.nav-item\[aria-current="page"\]/);
  assert.match(layout,/border-left: 3px solid #e72642 !important;/);
  assert.match(layout,/:focus-visible\s*\{\s*outline: 2px solid #ef2744 !important;/);
  assert.match(source,/\.content:has\(> \.page\.event-ops-page\)/);
});

test('wide tables scroll inside the pane, not the document; panels size border-box', async () => {
  const css = await read('../src/admin/admin-shell-layout.css');
  assert.match(css,/\.table-wrap,\.data-table-wrap,\.smart-table-wrap\)/);
  assert.match(css,/overflow-x: auto;/);
  assert.match(css,/\.notification-overview,/);
  assert.match(css,/\.notification-composer,/);
  assert.match(css,/\.notification-history,/);
  assert.match(css,/\.event-ops-results,/);
  assert.match(css,/\.page-heading-actions,/);
});
