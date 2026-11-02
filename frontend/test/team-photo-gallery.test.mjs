import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('team news and achievements attach only saved private RustFS photos through a moderated draft',async()=>{
 const [api,editor,publicPage,css]=await Promise.all([
  readFile(new URL('../src/api.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/TeamWorkspace.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/public/PublicTeamsPage.tsx',import.meta.url),'utf8'),
  readFile(new URL('../src/teams/teams.css',import.meta.url),'utf8'),
 ]);
 assert.match(api,/export async function uploadTeamPostPhoto/);
 assert.match(api,/targetType:'SITE_ASSET',targetId,contentType:file.type/);
 assert.match(api,/await request\('\/media\/upload'/);
 assert.match(editor,/draft\.images\.length\+candidates\.length>8/);
 assert.match(editor,/сначала сохраните материал как черновик/i);
 assert.match(editor,/setDraft\(current=>\(\{\.\.\.current,images:\[\.\.\.current\.images,\.\.\.uploaded\]\}\)\)/);
 assert.match(editor,/status==='PUBLISHED'/);
 assert.match(publicPage,/Array\.isArray\(post\.images\)/);
 assert.match(publicPage,/getTeamPostPhotoUrl\(key\)/);
 assert.match(css,/\.team-public-gallery/);
 assert.match(css,/@media\(max-width:560px\)/);
});

test('moderation cannot silently approve swapped gallery photos',async()=>{
 const [editor,service,media]=await Promise.all([
  readFile(new URL('../src/teams/TeamWorkspace.tsx',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/teams/teams.service.ts',import.meta.url),'utf8'),
  readFile(new URL('../../backend/src/media/media.service.ts',import.meta.url),'utf8'),
 ]);
 assert.match(service,/existing\?\.status === 'IN_REVIEW' && user\.role !== 'ADMIN'/);
 assert.match(service,/input\.status === 'PUBLISHED' && existing\?\.status !== 'IN_REVIEW'/);
 assert.match(media,/post\.status !== 'DRAFT'/);
 assert.match(editor,/Отозвать с проверки/);
 assert.match(editor,/if\(uploaded\.length\)setDraft/);
 assert.match(editor,/Сохраните черновик, чтобы прикрепить их/);
});

test('admin cannot publish a draft before moving it into the review queue',async()=>{
 const editor=await readFile(new URL('../src/teams/TeamWorkspace.tsx',import.meta.url),'utf8');
 assert.match(editor,/p\.status==='IN_REVIEW'\?<button className="primary-button compact"/);
 assert.match(editor,/Передать на проверку/);
 assert.match(editor,/onClick=\{\(\)=>void changePost\(p,'IN_REVIEW'\)\}/);
});
