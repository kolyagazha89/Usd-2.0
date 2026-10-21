import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const component=readFileSync(new URL('../src/public/UsdSoundReactor.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/public/UsdSoundReactor.css',import.meta.url),'utf8');

test('home keeps the CMS-managed hero toggle, title, subtitle and image',()=>{
 assert.match(app,/blockEnabled\('hero'\)/);
 assert.match(app,/settings\.homepage\?\.heroTitle/);
 assert.match(app,/settings\.homepage\?\.heroSubtitle/);
 assert.match(app,/UsdSoundReactor logoUrl=\{publicLogo\} heroImageUrl=\{settings\.homepage\?\.heroImageUrl\}/);
});

test('sound reactor retains safe CMS logo fallbacks and no audio playback',()=>{
 assert.match(component,/logoUrl&&!logoBroken/);
 assert.match(component,/onError=\{\(\)=>setLogoBroken\(true\)\}/);
 assert.match(component,/usd-release-reactor-wordmark/);
 assert.doesNotMatch(component,/AudioContext|new Audio\(|\.play\(/);
});

test('animation pauses offscreen, when hidden and for reduced motion',()=>{
 assert.match(component,/IntersectionObserver/);
 assert.match(component,/visibilitychange/);
 assert.match(component,/prefers-reduced-motion: reduce/);
 assert.match(component,/cancelAnimationFrame/);
 assert.match(component,/\.disconnect\(\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('mobile layouts keep the hero visual first and isolate admin styles',()=>{
 assert.match(css,/\.public-site \.public-hero-visual\{order:-1/);
 assert.match(css,/@media\(max-width:380px\)/);
 assert.match(css,/touch-action:pan-y/);
 for(const selector of css.match(/(?:^|\n)\s*[^@{}][^{}\n]*\{/g)||[]){
  const s=selector.trim();
  if(s.startsWith('from')||s.startsWith('to')||s.endsWith('%{'))continue;
  assert.ok(s.startsWith('.public-site ')||s.startsWith('50%')||s.startsWith('100%'),
   'public styling must not leak into admin: '+s);
 }
});
