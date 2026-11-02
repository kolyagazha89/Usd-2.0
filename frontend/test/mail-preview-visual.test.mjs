import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('mail editor previews the complete server-branded layout, not a plain text block', async () => {
  const [editor, css, mail] = await Promise.all([
    source('../src/admin/EmailTemplatesPage.tsx'),
    source('../src/admin/mail-preview.css'),
    source('../../backend/src/mail/mail.service.ts'),
  ]);
  assert.match(editor, /import '\.\/mail-preview\.css'/);
  for (const token of [
    'email-preview-masthead',
    'email-preview-logo',
    'email-preview-eyebrow',
    'email-preview-body',
    'email-preview-cta',
    'email-preview-end',
    'email-preview-disclaimer',
  ]) {
    assert.match(editor, new RegExp('className="' + token + '"'));
    assert.match(css, new RegExp('\\.' + token + '(?:[\\s,{:]|$)'));
  }
  assert.match(editor, /Стиль получателя/);
  assert.match(editor, /selected\.variableTexts\?\.heading/);
  assert.doesNotMatch(editor, /<button[^>]+email-preview-cta/);
  assert.match(mail, /export function renderBrandedEmail/);
  assert.match(mail, /background:#0d0e11/);
  assert.match(mail, /border-bottom:4px solid #ed2638/);
  assert.match(css, /background:\s*#0d0e11/);
  assert.match(css, /border-bottom:\s*4px solid #ed2638/);
});

test('mail preview stays scoped to light admin and adapts to narrow screens', async () => {
  const css = await source('../src/admin/mail-preview.css');
  assert.match(css, /body \.app-shell \.main \.content \.email-template-preview/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /grid-template-columns:\s*1fr/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(css, /(?:^|\n)\s*(?:body|:root)\s*\{/);
  assert.doesNotMatch(css, /@import|url\(/);
});
