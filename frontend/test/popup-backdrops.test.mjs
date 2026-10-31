import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=path=>readFile(new URL(path,import.meta.url),'utf8');

test('public mobile navigation uses real click-blocking scrim, never transparent links',async()=>{
 const [nav,css]=await Promise.all([
  get('../src/navigation/PublicNavigation.tsx'),
  get('../src/dark-velocity-sitewide.css'),
 ]);
 assert.match(nav,/\{open&&<div className="public-nav-backdrop"><button type="button" className="public-nav-backdrop-dismiss"/);
 assert.match(nav,/document\.body\.style\.overflow='hidden'/);
 assert.match(nav,/event\.target as Element\)\?\.closest\?\.\('\.public-nav-backdrop'\)/,'never remove scrim on pointerdown or clicks can hit the page behind');
 assert.match(nav,/onClick=\{\(\)=>setOpen\(false\)\}/);
 assert.match(nav,/window\.addEventListener\('resize',resize\)/);
 assert.match(nav,/event\.key==='Escape'/);
 assert.match(nav,/aria-expanded=\{open\}/);
 assert.match(css,/body \.public-nav-backdrop/);
 assert.match(css,/background:rgba\(3,6,12,\.84\)!important/);
 assert.match(css,/\.p-public-header:has\(\.public-nav-links\[data-open=true\]\)/);
 assert.match(css,/\.public-nav-links\[data-open=true\]\{\s*z-index:1502;isolation:isolate;\s*background:#0b131d!important/);
 assert.match(css,/\.public-nav:has\(\.public-nav-backdrop\)/);
});

test('admin menu overlay is behind sidebar, dialog overlay is above both, form stays light',async()=>{
 const [shell,css]=await Promise.all([get('../src/admin/AdminShell.tsx'),get('../src/dark-velocity-sitewide.css')]);
 assert.match(shell,/mobileOpen&&<button className="mobile-backdrop"/);
 assert.match(css,/\.app-shell>\.mobile-backdrop\{/);
 assert.match(css,/z-index:104!important/);
 assert.match(css,/\.app-shell \.sidebar\{z-index:105!important\}/);
 assert.match(css,/\.app-shell \.modal-backdrop\{\s*z-index:1200!important/);
 assert.match(css,/\.app-shell \.modal-backdrop \.modal\{\s*background:#fff!important/);
});

test('member catalog and actions sheets use opaque graphite panels with accessible scrims',async()=>{
 const [css,config]=await Promise.all([
  get('../src/dark-velocity-sitewide.css'),
  get('../src/public/premium-configurator.css'),
 ]);
 assert.match(css,/\.member-config-picker-overlay,\.member-config-actions-overlay/);
 assert.match(css,/background:rgba\(3,6,12,\.87\)!important/);
 assert.match(css,/\.member-config-picker-screen,\.member-config-actions-sheet/);
 assert.match(css,/background:#111a25!important/);
 assert.match(css,/@media\(prefers-reduced-transparency:reduce\)/);
 assert.match(config,/member-config-picker-overlay/);
 assert.match(config,/member-config-actions-overlay/);
});
