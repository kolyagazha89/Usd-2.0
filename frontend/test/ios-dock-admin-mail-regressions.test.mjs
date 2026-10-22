import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=p=>readFile(new URL(p,import.meta.url),'utf8');

test('iPhone dock is portalled to document.body with fixed safe-area anchoring',async()=>{
 const [shell,base,css]=await Promise.all([
  source('../src/public/PremiumShell.tsx'),
  source('../src/public/premium-base.css'),
  source('../src/public/premium-public.css'),
 ]);
 assert.match(shell,/import \{createPortal\} from 'react-dom'/);
 assert.match(shell,/createPortal\(<nav className="u-mobile-dock"/);
 assert.match(shell,/<\/nav>,document\.body\)/);
 assert.match(base,/\.u-mobile-dock\{position:fixed/);
 assert.match(css,/body>\.u-mobile-dock\{/);
 assert.match(css,/bottom:0!important/);
 assert.match(css,/env\(safe-area-inset-bottom/);
});
test('admin forms use flat search input and accessible mobile selector layout',async()=>{
 const styles=await source('../src/styles.css');
 assert.match(styles,/\.app-shell \.main \.search-box input:focus/);
 assert.match(styles,/border:0!important;border-radius:0!important/);
 assert.match(styles,/\.app-shell \.main \.data-table:not\(\.disqualification-table\) tbody td/);
 assert.match(styles,/grid-template-columns:minmax\(112px,40%\)/);
 assert.match(styles,/text-overflow:ellipsis/);
});
test('admin mail screen reports configured provider readiness without secrets',async()=>{
 const [page,controller,mail]=await Promise.all([
  source('../src/admin/EmailTestingPage.tsx'),
  source('../../backend/src/mail/mail.controller.ts'),
  source('../../backend/src/mail/mail.service.ts'),
 ]);
 assert.match(page,/apiGet<\{provider:string;ready:boolean;missing:string\[\];note:string\}>\('\/mail\/status'\)/);
 assert.match(page,/mail-channel-status/);
 assert.match(controller,/@Get\('status'\)/);
 assert.match(mail,/getDeliveryStatus\(\)/);
 assert.doesNotMatch(mail,/process\.env\.GOOGLE_CLIENT_ID \|\| process\.env\.GOOGLE_CLIENT_SECRET[\s\S]{0,80}process\.env\.GMAIL_REFRESH_TOKEN/);
});
