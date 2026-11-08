import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL(p,import.meta.url),'utf8');

test('admin email templates show a separate, paginated provider-acceptance journal',async()=>{
 const [parent,panel]=await Promise.all([
  read('../src/admin/EmailTemplatesPage.tsx'),
  read('../src/admin/EmailJournalPanel.tsx'),
 ]);
 assert.match(parent,/import EmailJournalPanel/);
 assert.match(parent,/<EmailJournalPanel\s*\/>/);
 assert.match(panel,/\/mail\/journal/);
 assert.match(panel,/nextCursor/);
 assert.match(panel,/Показать ещё/);
 assert.match(panel,/PROVIDER_ACCEPTED/);
 assert.match(panel,/Не подтверждает доставку/);
 assert.match(panel,/role="alert"/);
 assert.doesNotMatch(panel,/lastError|message\.html|message\.text|rawToken/);
});
