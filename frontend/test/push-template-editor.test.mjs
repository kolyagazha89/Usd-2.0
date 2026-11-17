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

test('automatic PUSH editor hint text meets WCAG AA contrast on white forms',async()=>{
 const css=await readFile(new URL('../src/admin/notifications.css',import.meta.url),'utf8');
 const declaration=css.match(/\.push-template-card\s*>\s*label\s+small\s*\{([^}]*)\}/)?.[1];
 assert.ok(declaration,'Editor label hint must have an explicit readable style');
 const foreground=declaration.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{6})\s*(?:;|$)/i)?.[1];
 assert.ok(foreground,'Editor label hint must specify its own color');
 const opacity=declaration.match(/(?:^|;)\s*opacity\s*:\s*([\d.]+)\s*(?:;|$)/)?.[1];
 assert.equal(opacity===undefined?1:Number(opacity),1,'Hint opacity must not wash out text');
 const channels=[1,3,5].map(index=>parseInt(foreground.slice(index,index+2),16)/255)
   .map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
 const luminance=channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
 const ratio=1.05/(luminance+0.05);
 assert.ok(ratio>=4.5,'Hints need WCAG AA 4.5:1 contrast; got '+ratio.toFixed(2));
});
