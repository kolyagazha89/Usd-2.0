import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=async path=>readFile(new URL(path,import.meta.url),'utf8');

test('the homepage and partner directory share the CMS-driven tier showcase',async()=>{
 const [home,community,showcase]=await Promise.all([
  source('../src/public/PremiumHome.tsx'),
  source('../src/public/PublicCommunity.tsx'),
  source('../src/public/PartnerShowcase.tsx'),
 ]);
 assert.match(home,/import PartnerShowcase from '\.\/PartnerShowcase'/);
 assert.match(home,/<PartnerShowcase partners=\{partners\} variant="home"\/>/);
 assert.match(community,/import PartnerShowcase from '\.\/PartnerShowcase'/);
 assert.match(community,/<PartnerShowcase partners=\{partners\}\/>/);
 assert.match(showcase,/GENERAL.*PREMIUM.*REGULAR/s);
 assert.match(showcase,/normalizeTier\(p\.tier\)===tier\.id/);
 assert.match(showcase,/p\.isActive!==false/);
 assert.match(showcase,/sortOrder/);
 assert.match(showcase,/safeHref\(partner\.website\)/);
 assert.match(showcase,/rel="noopener noreferrer"/);
});

test('general, premium and regular sponsors have distinct responsive visual priorities',async()=>{
 const css=await source('../src/dark-velocity-sitewide.css');
 assert.match(css,/usd-partner-tier--general \.usd-partner-grid/);
 assert.match(css,/usd-partner-tier--premium \.usd-partner-grid/);
 assert.match(css,/usd-partner-tier--regular \.usd-partner-card/);
 assert.match(css,/usd-partner-showcase--home/);
 assert.match(css,/@media\(max-width:560px\)/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});


test('partner CMS supports draft publication independently from active visibility',async()=>{
 const [admin,backend]=await Promise.all([
  source('../src/admin/PartnersPage.tsx'),
  source('../../backend/src/site-settings/site-settings.service.ts'),
 ]);
 assert.match(admin,/isPublished:false/);
 assert.match(admin,/isPublished:v\.isPublished!==false/);
 assert.match(admin,/Опубликован на сайте/);
 assert.match(admin,/Черновик/);
 assert.match(backend,/partner\.isActive !== false && partner\.isPublished !== false/);
});
