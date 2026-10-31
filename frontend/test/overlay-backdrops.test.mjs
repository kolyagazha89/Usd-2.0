import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('mobile public navigation owns a full-screen click-dismissable scrim in the body',async()=>{
 const nav=await read('../src/navigation/PublicNavigation.tsx');
 assert.match(nav,/import \{createPortal\} from 'react-dom'/);
 assert.match(nav,/createPortal\(<button type="button" className="public-nav-scrim"/);
 assert.match(nav,/nav\.current\?\.closest\('\.usd-live'\)\?\?document\.body/,'scrim and header share stacking context');
 assert.match(nav,/document\.body\.style\.overflow='hidden'/);
 assert.match(nav,/document\.body\.style\.overflow=previous/);
 assert.match(nav,/window\.addEventListener\('resize',responsive\)/);
 assert.match(nav,/window\.innerWidth>1100/);
 assert.match(nav,/event\.key==='Escape'/);
 assert.match(nav,/event\.key!=='Tab'/);
 assert.match(nav,/toggle\.current\?\.focus\(\)/);
});

test('admin drawer restores background scroll after dismissal, route change or escape',async()=>{
 const shell=await read('../src/admin/AdminShell.tsx');
 assert.match(shell,/className="mobile-backdrop"/);
 assert.match(shell,/document\.body\.style\.overflow='hidden'/);
 assert.match(shell,/document\.body\.style\.overflow=previous/);
 assert.match(shell,/if\(event\.key==='Escape'\)setMobileOpen\(false\)/);
 assert.match(shell,/if\(window\.innerWidth>800\)setMobileOpen\(false\)/);
 assert.match(shell,/\[routePath\]/);
});

test('floating menus are opaque; public, admin and modal backdrops cover the screen with the correct layer order',async()=>{
 const css=await read('../src/dark-velocity-sitewide.css');
 const scrim=css.slice(css.indexOf('body .public-nav-scrim{'));
 assert.ok(scrim.length>0,'public scrim CSS required');
 assert.match(scrim,/position:fixed;inset:0;z-index:105/);
 assert.match(scrim,/background:rgba\(3,7,13,\.77\)/);
 assert.match(scrim,/\.p-public-header\{position:sticky;z-index:110!important/);
 assert.match(scrim,/\.public-nav-links\[data-open="true"\]\{/);
 assert.match(scrim,/background:#121316!important/);
 assert.match(scrim,/body \.app-shell \.mobile-backdrop\{/);
 assert.match(scrim,/background:rgba\(5,10,18,\.75\)!important/);
 assert.match(scrim,/body \.modal-backdrop\{/);
 assert.match(scrim,/z-index:500!important/);
 assert.match(scrim,/background:rgba\(5,10,20,\.74\)!important/);
 assert.match(scrim,/body \.app-shell \.modal-backdrop \.modal\{/);
 assert.match(scrim,/background:#fff!important;color:#17202d!important/);
 assert.match(scrim,/prefers-reduced-transparency:reduce/);
 assert.match(scrim,/@media\(max-width:480px\)/);
});

test('real browser QA exercises both backdrops, scroll restoration and mobile navigation',async()=>{
 const qa=await read('../../scripts/candidate-browser-qa.mjs');
 assert.match(qa,/body > \.public-nav-scrim/);
 assert.match(qa,/publicBackdrop\.click/);
 assert.match(qa,/adminBackdrop\.click/);
 assert.match(qa,/tapping backdrop closes mobile menu/);
 assert.match(qa,/admin drawer restores page scroll/);
 assert.match(qa,/menuBackground/);
});
