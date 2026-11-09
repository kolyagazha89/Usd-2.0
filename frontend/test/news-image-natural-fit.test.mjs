import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('a news thumbnail centers the full original photo in a bounded preview instead of cropping it',async()=>{
 const [markup,base,finish]=await Promise.all([
  source('../src/public/PremiumUI.tsx'),
  source('../src/public/premium-public.css'),
  source('../src/sitewide-premium-2026.css'),
 ]);
 assert.match(markup,/className="p-news-media"[^>]*>\s*<Photo\b[^>]*className="p-news-cover"/);
 assert.match(finish,/body \.usd-live \.p-news-card \.p-news-media\s*\{[^}]*aspect-ratio:16\/9/s);
 assert.match(finish,/body \.usd-live \.p-news-card \.p-news-media > img\.p-news-cover\s*\{[^}]*object-fit:contain!important/s);
 assert.doesNotMatch(base,/\.usd-live \.p-news-cover\{[^}]*object-fit:cover/);
});

test('full article image preserves its natural aspect and is bounded rather than forced into a cropped wide 440px box',async()=>{
 const [markup,base,finish]=await Promise.all([
  source('../src/public/PublicCommunity.tsx'),
  source('../src/public/premium-public.css'),
  source('../src/sitewide-premium-2026.css'),
 ]);
 assert.match(markup,/className="p-article-cover"/);
 assert.doesNotMatch(base,/\.usd-live \.p-article-cover\{[^}]*height:440px/);
 assert.match(finish,/body \.usd-live \.p-article > img\.p-article-cover\s*\{[^}]*width:auto!important;[^}]*height:auto!important;[^}]*object-fit:contain!important/s);
 assert.match(finish,/body \.usd-live \.p-article > img\.p-article-cover\s*\{[^}]*max-height:min\(60vh,520px\)/s);
});

test('fallback news artwork remains visible without requiring a real image',async()=>{
 const [markup,finish]=await Promise.all([
  source('../src/public/PremiumUI.tsx'),
  source('../src/sitewide-premium-2026.css'),
 ]);
 assert.match(markup,/fallback=\{<>/);
 assert.match(finish,/body \.usd-live \.p-news-card \.p-news-media > \.p-news-cover\.p-photo-fallback\s*\{/);
});
