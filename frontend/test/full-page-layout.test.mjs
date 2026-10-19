import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('public stage poster images inherit their natural aspect ratio and height', () => {
  const css = read('../src/styles.css');
  assert.match(css, /\.public-site \.public-stage-detail img\.public-stage-poster/);
  assert.match(css, /\.public-site \.public-stage-card img\.public-stage-list-poster/);
  const block = css.slice(css.lastIndexOf('/* USD stage artwork keeps'));
  assert.match(block, /height:\s*auto\s*!important/);
  assert.match(block, /aspect-ratio:\s*auto\s*!important/);
  assert.match(block, /max-height:\s*none\s*!important/);
});

test('admin forms do not own their viewport height or vertical scrolling', () => {
  const css = read('../src/ui-consistency.css');
  const block = css.slice(css.lastIndexOf('/* Admin detail/edit routes are ordinary'));
  assert.match(block, /\.main \.content \.modal-form/);
  assert.match(block, /height:\s*auto\s*!important/);
  assert.match(block, /max-height:\s*none\s*!important/);
  assert.match(block, /overflow:\s*visible\s*!important/);
});

test('import row resolution is routed as a document page without a modal overlay', () => {
  const page = read('../src/admin/ImportPage.tsx');
  const routes = read('../src/admin/AdminRoutes.tsx');
  assert.match(page, /\/admin\/import\/resolve\?jobId=/);
  assert.match(page, /<ImportResolutionPage /);
  assert.doesNotMatch(page, /<div className="import-resolution-overlay"/);
  assert.doesNotMatch(page, /aria-modal="true"/);
  assert.match(routes, /<ImportPage path=\{path\} go=\{go\}/);
});

test('resource details and embedded classes use URL routes', () => {
  const resource = read('../src/admin/ResourcePage.tsx');
  const classes = read('../src/admin/CompetitionPages.tsx');
  assert.match(resource, /routeViewId=routeParams\.get\('view'\)/);
  assert.match(resource, /'view='\+encodeURIComponent\(row\.id\)/);
  assert.match(classes, /<ResourcePage embedded routeEditors/);
});
