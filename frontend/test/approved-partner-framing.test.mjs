import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('redesign keeps partner banner cover mode and original manual framing',async()=>{
 const frame=await readFile(new URL('../src/public/PartnerImage.tsx',import.meta.url),'utf8');
 const layout=await readFile(new URL('../src/public/partner-image.css',import.meta.url),'utf8');
 const refresh=await readFile(new URL('../src/approved-public-refresh.css',import.meta.url),'utf8');
 assert.match(frame,/framing\.mode==='BANNER'\?'cover':'contain'/);
 assert.match(layout,/object-fit:var\(--partner-image-fit,contain\)/);
 assert.doesNotMatch(refresh,/\.usd-partner-visual img\s*\{[^}]*object-fit:/,
   'broad redesign styles must not override manually configured banner image cropping');
});
