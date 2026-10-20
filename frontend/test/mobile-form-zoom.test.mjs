import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('mobile editable fields render at least 16px to avoid iOS Safari focus zoom', () => {
  const css = read('../src/ui-consistency.css');
  const fix = css.slice(css.lastIndexOf('/* Prevent iOS Safari form-focus zoom'));
  assert.match(fix, /@media\s*\(max-width:\s*1024px\)/);
  assert.match(fix, /body :is\(/);
  assert.match(fix, /input:not\(\[type="checkbox"\]\)/);
  assert.match(fix, /select,/);
  assert.match(fix, /textarea/);
  assert.match(fix, /font-size:\s*16px\s*!important/);
});

test('mobile form fix loads after existing style sheets and retains pinch zoom', () => {
  const main = read('../src/main.tsx');
  const html = read('../index.html');
  assert.ok(main.indexOf("'./ui-consistency.css'") > main.indexOf("'./participant-ui-polish.css'"));
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1\.0"/);
  assert.doesNotMatch(html, /user-scalable=no|maximum-scale=1(?:\.0)?/i);
});
