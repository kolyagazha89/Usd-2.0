import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('ADMIN can edit and preview automatic PUSH templates without sending a broadcast',async()=>{
 const page=await readFile(new URL('../src/admin/NotificationsPage.tsx',import.meta.url),'utf8');
 assert.match(page,/user\.role==='ADMIN'/);
 assert.match(page,/apiGet<PushTemplateResponse>\('\/push\/admin\/templates'\)/);
 assert.match(page,/apiPatch<PushTemplateResponse>\('\/push\/admin\/templates',payload\)/);
 assert.match(page,/templates:templateDraft\.map/);
 assert.match(page,/revision:templateOriginal\.revision/);
 assert.match(page,/template\.enabled/);
 assert.match(page,/maxLength=\{80\}/);
 assert.match(page,/maxLength=\{240\}/);
 assert.match(page,/previewContent\(template\.title\)/);
 assert.match(page,/previewContent\(template\.body\)/);
 assert.match(page,/Сохранение не отправляет уведомления/);
 assert.match(page,/Сохранить шаблоны/);
 assert.match(page,/Поставить в очередь/);
});
