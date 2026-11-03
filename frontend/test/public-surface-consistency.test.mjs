import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const css=readFileSync(fileURLToPath(new URL('../src/sitewide-premium-2026.css',import.meta.url)),'utf8');

test('public page surfaces use one scoped graphite contract',()=>{
 assert.match(css,/body \.usd-live\s*\{/);
 assert.match(css,/\.public-legal-document/);
 assert.match(css,/\.public-stage-card/);
 assert.match(css,/\.public-rules-card/);
 assert.match(css,/background:transparent!important/);
 assert.doesNotMatch(css,/body \.app-shell\s+\.public-legal-document/);
});

test('vehicle photo preview has an explicit background and save feedback',()=>{
 assert.match(css,/body \.usd-member \.participant-car-detail-photo/);
 assert.match(css,/\.member-car-photo-feedback/);
});
