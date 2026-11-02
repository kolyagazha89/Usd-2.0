import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=p=>readFile(new URL(p,import.meta.url),'utf8');

test('iPhone public dock is CSS-anchored to 100dvh without JS scroll offsets',async()=>{
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
 assert.match(css,/top:calc\(100dvh - 66px - env\(safe-area-inset-bottom/);
 assert.match(css,/bottom:auto!important/);
 assert.doesNotMatch(shell,/visualViewport/);
 assert.doesNotMatch(shell,/usd-dock-visual-top/);
 assert.match(css,/env\(safe-area-inset-bottom/);
 assert.match(css,/--usd-dock-height:calc\(66px/);
 const premium=await source('../src/premium-ui.css');
 assert.match(premium,/body:has\(\.usd-live\):has\(> \.u-mobile-dock\) \{ --usd-dock-height:calc\(66px/,'body must expose the dock height to the cookie notice');
 const notice=await source('../src/CookieNotice.tsx');
 assert.match(notice,/body:has\(> \.u-mobile-dock\) \.cookie-notice/);
 assert.match(notice,/top: max\(12px, calc\(100dvh/);
 assert.match(notice,/bottom: auto !important/);
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
 assert.match(page,/type MailStatus=\{provider:string;ready:boolean;missing:string\[\];note:string\}/);
 assert.match(page,/apiGet<MailStatus>\('\/mail\/status'\)/);
 assert.match(page,/apiPost<\{message:string\}>\('\/mail\/check-connection'/);
 assert.doesNotMatch(page,/STAGE_REMINDER_3D|STAGE_REMINDER_1D|stageId:/);
 assert.match(page,/mail-channel-status/);
 assert.match(controller,/@Get\('status'\)/);
 assert.match(controller,/@Post\('check-connection'\)/);
 assert.match(controller,/MAIL_ACCOUNT_ONLY === 'true'/);
 assert.match(mail,/getDeliveryStatus\(\)/);
 assert.doesNotMatch(mail,/process\.env\.GOOGLE_CLIENT_ID \|\| process\.env\.GOOGLE_CLIENT_SECRET[\s\S]{0,80}process\.env\.GMAIL_REFRESH_TOKEN/);
});

test('installed USD app opens home rather than profile-pinned iOS shortcut on cold launch',async()=>{
 const [app,manifest]=await Promise.all([source('../src/App.tsx'),source('../public/manifest.webmanifest')]);
 const pwa=JSON.parse(manifest);
 assert.equal(pwa.start_url,'/');
 assert.equal(pwa.scope,'/');
 assert.match(app,/display-mode: standalone/);
 assert.match(app,/navigator as Navigator & \{standalone\?:boolean\}/);
 assert.match(app,/usd-pwa-launched/);
 assert.match(app,/history\.replaceState\(\{\},'', '\/'\)/);
});

test('USD finishing layer is last and preserves dark public/member with light admin',async()=>{
 const [entry,styles]=await Promise.all([source('../src/main.tsx'),source('../src/sitewide-finish.css')]);
 assert.ok(entry.indexOf("import './sitewide-finish.css'") > entry.indexOf("import './dark-velocity-sitewide.css'") && entry.lastIndexOf("import './admin/admin-shell-layout.css'") > entry.indexOf("import './sitewide-finish.css'"));
 assert.match(styles,/body \.usd-live :is\(/);
 assert.match(styles,/body \.usd-member :is\(/);
 assert.match(styles,/body \.app-shell>\.main\{/);
 assert.match(styles,/background: #f5f5f7!important/);
 assert.match(styles,/prefers-reduced-motion:reduce/);
 assert.doesNotMatch(styles,/body\s*\{\s*background:/);
});
