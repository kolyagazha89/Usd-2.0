import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('all public page families use one Dark Velocity finishing contract',async()=>{
  const [css,community,home,main]=await Promise.all([
    read('../src/dark-velocity-sitewide.css'),
    read('../src/public/PublicCommunity.tsx'),
    read('../src/public/PremiumHome.tsx'),
    read('../src/main.tsx'),
  ]);
  assert.match(css,/USD finish pass: route-wide Dark Velocity surfaces/);
  for(const cls of ['.p-person-card','.p-car-card','.p-profile-banner','.p-about-card','.p-news-card','.p-article','.p-history-entry','.p-search']) {
    assert.ok(css.includes(cls),'Shared visual treatment missing '+cls);
  }
  assert.match(css,/--usd-finish-surface:#101318/);
  assert.match(css,/--usd-finish-red:#ed2638/);
  assert.match(css,/@media\s*\(hover:hover\) and \(prefers-reduced-motion:no-preference\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/font-size:16px/);
  assert.ok(community.includes('p-person-card'));
  assert.ok(home.includes('u-home-dashboard'));
  assert.ok(main.indexOf("import './dark-velocity-sitewide.css'")<main.indexOf("import './admin/admin-shell-layout.css'"));
  assert.doesNotMatch(css,/\.app-shell[^\\n]*\{[^}]*background:#[01]/,
    'sitewide public finish must not turn light admin dark');
});

test('participant and account pages receive consistent graphite surface and focus treatment',async()=>{
  const css=await read('../src/dark-velocity-sitewide.css');
  for(const cls of ['.member-race-card','.member-pass-card','.member-garage-panel','.member-readiness','.usd-auth .login-card']){
    assert.ok(css.includes(cls),cls);
  }
  assert.match(css,/body \.usd-member :is\(input,select,textarea\):focus-visible/);
});

test('admin finish stays WHITE without touching sidebar and mobile pane geometry',async()=>{
  const [css,main]=await Promise.all([
    read('../src/admin/admin-shell-layout.css'),
    read('../src/main.tsx'),
  ]);
  assert.match(css,/USD light-premium admin finish/);
  assert.match(css,/--usd-admin-paper:#ffffff/);
  assert.match(css,/--usd-admin-canvas:#f2f3f6/);
  assert.match(css,/body \.app-shell > \.main,/);
  assert.match(css,/body \.app-shell \.main \.content :is\(\.primary-button,\.secondary-button\)/);
  assert.match(css,/body \.app-shell \.main \.content :is\(input,select,textarea\):focus-visible/);
  assert.match(css,/font-size:16px/);
  assert.equal(main.match(/admin-shell-layout\.css/g)?.length,1);
  assert.ok(css.includes('inline-size: calc(100% - 268px) !important'));
  assert.ok(css.includes('inline-size: 100% !important'));
});
