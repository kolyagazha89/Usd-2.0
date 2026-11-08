import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=p=>readFile(new URL(p,import.meta.url),'utf8');

test('mobile public dock remains bottom-fixed instead of using 100dvh top coordinates',async()=>{
 const css=await source('../src/public/premium-public.css');
 assert.match(css,/body>\.u-mobile-dock\{[\s\S]*?bottom:0!important/);
 assert.doesNotMatch(css,/top:calc\(100dvh - 66px/);
});

test('mobile member navigation leaves the scrolling page and is anchored to the viewport',async()=>{
 const [nav,css]=await Promise.all([source('../src/participant/ParticipantNavigation.tsx'),source('../src/public/premium-member.css')]);
 assert.match(nav,/createPortal/);
 assert.match(nav,/document\.body/);
 assert.match(css,/body\s*>\s*\.participant-tabs/);
 assert.match(css,/bottom:0!important/);
});

test('member header covers the iPhone safe area and page reserves its height',async()=>{
 const css=await source('../src/public/premium-member.css');
 assert.match(css,/position:fixed!important/);
 assert.match(css,/safe-area-inset-top/);
 assert.match(css,/padding-top:var\(--usd-member-header-size,calc\(72px \+ env\(safe-area-inset-top/);
});
