import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stagePosterAssetKey} from '../src/admin/stage-poster-assets.ts';

const source=async path=>readFile(new URL(path,import.meta.url),'utf8');

test('every replacement of the same event poster gets a distinct cache-safe public target',()=>{
 const first=stagePosterAssetKey('event-42');
 const second=stagePosterAssetKey('event-42');
 assert.match(first,/^stage-poster-event-42-[a-f0-9-]{36}$/);
 assert.notEqual(first,second,'reusing target id allows browser/CDN to show the old poster');
 assert.notEqual(first,stagePosterAssetKey('event-43'));
 assert.equal(stagePosterAssetKey('event-42','revision-1'),'stage-poster-event-42-revision-1');
 assert.throws(()=>stagePosterAssetKey(''),/Не указан этап/);
 assert.throws(()=>stagePosterAssetKey('../danger'),/Некорректный идентификатор/);
});

test('stage poster editor publishes the unique URL only after settings persistence is verified',async()=>{
 const [admin,media]=await Promise.all([
  source('../src/admin/CompetitionPages.tsx'),source('../src/api.ts')
 ]);
 assert.match(admin,/uploadSiteAsset\(stagePosterAssetKey\(stage\.id\),file\)/);
 assert.match(admin,/const posters=\{\.\.\.\(s\.homepage\?\.stagePosters\?\?\{\}\),\[stage\.id\]:uploaded\.publicPath\}/);
 assert.match(admin,/updateSiteSettings\(\{homepage:\{stagePosters:posters\}\}\)/);
 assert.match(admin,/if\(saved!==uploaded\.publicPath\)/);
 assert.doesNotMatch(admin,/uploadSiteAsset\('stage-poster-'\+stage\.id,file\)/);
 assert.match(media,/public-file\/SITE_ASSET/);
});

test('stage images keep natural height in admin preview and public detail/list views',async()=>{
 const [admin,styles]=await Promise.all([
  source('../src/admin/CompetitionPages.tsx'),source('../src/styles.css')
 ]);
 assert.match(admin,/height:'auto',maxHeight:'none',aspectRatio:'auto'/);
 assert.match(styles,/\.public-site \.public-stage-detail img\.public-stage-poster \{/);
 assert.match(styles,/height: auto !important;/);
 assert.match(styles,/aspect-ratio: auto !important;/);
});
