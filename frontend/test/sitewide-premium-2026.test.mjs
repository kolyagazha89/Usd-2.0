import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('all three USD surfaces share the 2026 design system without turning admin dark',async()=>{
 const [entry,css,admin,publicCss,member]=await Promise.all([
  read('../src/main.tsx'),read('../src/sitewide-premium-2026.css'),
  read('../src/admin/admin-shell-layout.css'),read('../src/public/premium-public.css'),
  read('../src/participant/member-experience.css')]);
 const imports=[...entry.matchAll(/import\s+['"]([^'"]+\.css)['"]/g)].map(match=>match[1]);
 assert.deepEqual(imports.slice(-3),['./sitewide-finish.css','./sitewide-premium-2026.css','./admin/admin-shell-layout.css']);
 assert.match(css,/--usd-brand:#ed2638/);
 assert.match(css,/--usd-brand-soft:rgba\(237,38,56,\.14\)/);
 for(const selector of ['.usd-live','.usd-member','.app-shell','.public-page-heading','.public-page-kicker','.u-cinema-hero','.public-stage-card','.public-result-card','.public-record-card','.p-car-card','.registration-card','.configuration-editor-page','.participant-portal-main']){
  assert.ok(css.includes(selector),'new sitewide finish misses '+selector);
 }
 assert.match(css,/\.usd-live\s*\{[\s\S]*?background:var\(--usd-background\)!important;/);
 assert.match(css,/\.usd-member\s*\{[\s\S]*?background:#06090d!important;/);
 assert.match(admin,/body \.app-shell > \.main/);
 assert.match(admin,/color-scheme:light/);
 assert.match(css,/\.login-page\.usd-auth/,'login and account recovery must use Dark Velocity');
 assert.match(css,/\.usd-member\.profile-match-page/,'first-login page must be dark');
 assert.match(css,/background:#121a23!important/,'no white auth inputs');
 for(const selector of ['.resource-editor-page','.notification-overview','.data-table'])assert.ok(admin.includes(selector),'admin design owns '+selector);
 assert.match(css,/body > \.u-mobile-dock/,'portaled iOS dock must inherit the dark system');
 assert.match(admin,/body \.app-shell > \.main/);
 assert.match(publicCss,/\.usd-live\{/);
 assert.match(member,/body \.usd-member/);
});

test('page headers and homepage splash are stable through fonts and media load',async()=>{
 const [app,css,boot]=await Promise.all([read('../src/App.tsx'),read('../src/sitewide-premium-2026.css'),read('../test/home-boot-menu.test.mjs')]);
 assert.match(app,/className="public-page-heading"/);
 assert.match(app,/className="public-page-kicker"/);
 assert.match(app,/className="public-page-error"/);
 assert.match(app,/setHomeMinDelayPassed\(true\),650/);
 assert.match(app,/document\.fonts\?\.ready/);
 assert.match(app,/Promise\.allSettled\(assets\)/);
 assert.match(app,/window\.setTimeout\(done,2600\)/,'broken assets must never block public home indefinitely');
 assert.match(app,/!homeVisualReady\|\|loading/);
 assert.match(app,/aria-busy=\{showHomeSplash\} inert=\{showHomeSplash\}/);
 assert.match(css,/p-home-main\.is-ready/);
 assert.match(css,/@keyframes usd-home-entrance/);
 assert.match(css,/\.public-page-heading h1/);
 assert.match(boot,/initial USD splash persists/);
});

test('LIVE classes and record carousel animate entire panels, preserving manual accessibility',async()=>{
 const [component,css]=await Promise.all([read('../src/public/HomeScoreboards.tsx'),read('../src/public/home-results.css')]);
 assert.match(component,/className="usd-carousel-viewport"/);
 assert.match(component,/className="usd-carousel-track"/);
 assert.match(component,/className="usd-record-viewport"/);
 assert.match(component,/className="usd-record-track"/);
 assert.match(component,/transform:`translate3d\(-\$\{index%groups\.length\*100\}%,0,0\)`/);
 assert.match(component,/transform:`translate3d\(-\$\{current\*100\}%,0,0\)`/);
 assert.match(component,/aria-hidden=\{g\.key!==group\.key\} inert=\{g\.key!==group\.key\}/);
 assert.match(component,/aria-hidden=\{slide!==current\} inert=\{slide!==current\}/);
 assert.match(component,/aria-label="Следующий класс"/);
 assert.match(component,/aria-label="Следующие рекорды"/);
 assert.match(component,/setPaused\(true\)/,'manual interaction stops automatic advance');
 assert.doesNotMatch(component,/className="usd-live-class-entries" key=\{group\.key\}/,'do not remount class result list on every rotation');
 assert.match(css,/\.usd-carousel-track,[\s\S]*?\.usd-record-track/);
 assert.match(css,/transition:transform \.7s cubic-bezier/);
 assert.match(css,/flex:0 0 100%/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(css,/transition:none!important/);
});

test('mobile layout avoids blank rail, forced white member inputs and iOS zoom',async()=>{
 const [css,admin]=await Promise.all([read('../src/sitewide-premium-2026.css'),read('../src/admin/admin-shell-layout.css')]);
 assert.match(css,/@media\(max-width:800px\)/);
 assert.match(css,/@media\(max-width:480px\)/);
 assert.match(css,/font-size:16px!important/);
 assert.match(css,/\.usd-member :is\(input:not\(\[type=checkbox\]/);
 assert.match(css,/background:#0d151d!important/);
 assert.match(css,/color-scheme:light/);
 assert.match(admin,/scrollbar-color:#babdc5 transparent/);
 assert.match(admin,/@media \(max-width: 800px\)/);
 assert.doesNotMatch(css,/body\s+\.usd-live\s+\.main\s+\.content/,'admin styling must not leak into public');
});
