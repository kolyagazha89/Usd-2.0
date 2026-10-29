import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {visiblePartners} from '../src/public/partner-model.ts';

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
 assert.match(showcase,/visiblePartners\(partners\)/);
 assert.match(await source('../src/public/partner-model.ts'),/sortOrder/);
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

test('home, directory and showcase use the same published partner predicate',async()=>{
 const [home,community,showcase]=await Promise.all([
  source('../src/public/PremiumHome.tsx'),
  source('../src/public/PublicCommunity.tsx'),
  source('../src/public/PartnerShowcase.tsx'),
 ]);
 for(const page of [home,community,showcase])assert.match(page,/visiblePartners\(\w+\.partners|visiblePartners\(partners\)/);
 assert.match(community,/partners\.length\?<PartnerShowcase partners=\{partners\}\/>:<EmptyState/);
 const partners=[
  {id:'draft',name:'Draft',isActive:true,isPublished:false,sortOrder:0},
  {id:'hidden',name:'Hidden',isActive:false,isPublished:true,sortOrder:0},
  {id:'old',name:'Legacy',isActive:true,sortOrder:4},
  {id:'premium',name:'Premium',isActive:true,isPublished:true,sortOrder:1},
  {id:'bad-order',name:'Unordered',isPublished:true,sortOrder:Number.POSITIVE_INFINITY},
  null,
 ];
 const snapshot=partners.slice();
 assert.deepEqual(visiblePartners(partners).map(p=>p.id),['bad-order','premium','old']);
 assert.deepEqual(partners,snapshot,'sorting must not mutate the CMS array');
 assert.deepEqual(visiblePartners([partners[0],partners[1]]),[],'draft-only directory must render its empty state');
 assert.deepEqual(visiblePartners(undefined),[]);
 assert.deepEqual(visiblePartners([null,false,'invalid',[]]),[]);
});
