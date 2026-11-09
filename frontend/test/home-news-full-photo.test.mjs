import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=file=>readFile(new URL(file,import.meta.url),'utf8');

test('home and news-list cards grow with the original image ratio instead of forcing a 16:9 crop frame',async()=>{
 const css=await source('../src/sitewide-premium-2026.css');
 const frame=css.match(/body \.usd-live \.p-news-card \.p-news-media\s*\{([^}]+)\}/)?.[1]??'';
 const image=css.match(/body \.usd-live \.p-news-card \.p-news-media > img\.p-news-cover\s*\{([^}]+)\}/)?.[1]??'';
 assert.ok(frame,'news image frame style must exist');
 assert.ok(image,'news photo style must exist');
 assert.match(frame,/aspect-ratio:auto/,'no forced landscape crop for portrait posters');
 assert.match(frame,/max-height:none/,'no cap that masks a portion of original photo');
 assert.match(image,/width:100%!important/,'image uses available card width on mobile');
 assert.match(image,/height:auto!important/,'height follows original width/height ratio');
 assert.match(image,/max-height:none!important/,'portrait photo cannot be clipped by 210px limit');
});

test('news thumbnail fallback retains a predictable frame when no photo is uploaded',async()=>{
 const css=await source('../src/sitewide-premium-2026.css');
 const fallback=css.match(/body \.usd-live \.p-news-card \.p-news-media > \.p-news-cover\.p-photo-fallback\s*\{([^}]+)\}/)?.[1]??'';
 assert.match(fallback,/aspect-ratio:16\/9/,'fallback should remain visually consistent');
});
