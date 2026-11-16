import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('public USD CSS never sends visitors to external font services',async()=>{
  const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
  assert.doesNotMatch(css,/fonts\\.(?:googleapis|gstatic)\\.com|@import\\s+(?:url\\()?['"]?https?:/i);
  assert.match(css,/font-family:\\s*(?:system-ui|-apple-system|BlinkMacSystemFont|["']Segoe UI["'])/i);
});
