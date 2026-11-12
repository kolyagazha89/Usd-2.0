import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('historical email counters are visible only in ADMIN profile links and never expose personal addresses', async () => {
  const [controller, view] = await Promise.all([
    read('../backend/src/auth/profile-links.controller.ts'),
    read('../src/admin/ProfileLinksPage.tsx'),
  ]);
  assert.match(controller, /@Controller\('admin\/profile-links'\)[\s\S]*?@Roles\('ADMIN'\)/);
  assert.match(controller, /@Get\('coverage'\)/);
  assert.match(view, /\/admin\/profile-links\/coverage/);
  assert.match(view, /Архивный email есть/);
  assert.match(view, /Без архивного email/);
  assert.match(view, /Не означает автоматическую привязку/);
});
