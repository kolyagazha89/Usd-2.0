import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('admin confirms or rejects profile claims directly without mandatory text or checkbox',async()=>{
 const [view,controller,service]=await Promise.all([
  read('../src/admin/ProfileLinksPage.tsx'),
  read('../../backend/src/auth/profile-links.controller.ts'),
  read('../../backend/src/auth/profile-links.service.ts'),
 ]);
 assert.match(view,/Подтвердить привязку/);
 assert.match(view,/Отклонить/);
 assert.match(view,/\{decision\}/);
 assert.doesNotMatch(view,/reason\.trim|setReason|verified|setVerified|<textarea|type="checkbox"/);
 assert.doesNotMatch(controller,/@MinLength\(12\)\s+reason/);
 assert.match(service,/ADMIN_VERIFIED/);
 assert.match(service,/ADMIN_REJECTED/);
 assert.match(service,/PROFILE_LINK_APPROVED/);
 assert.match(service,/PROFILE_LINK_REJECTED/);
 assert.match(service,/profile-link:\x27\+requestId/);
 assert.match(service,/participant-claim:/);
 assert.match(service,/claimant-user:/);
 assert.match(view,/row\.participant\.user\|\|row\.claimant\.participantId/);
});

test('participant can self-link only on server-approved verified historical-email match',async()=>{
 const [view,app,auth]=await Promise.all([
  read('../src/participant/FirstLoginOnboarding.tsx'),
  read('../src/App.tsx'),
  read('../../backend/src/auth/auth.service.ts'),
 ]);
 assert.match(view,/c\.canSelfLink\?/);
 assert.match(view,/onLink\(c\.id\)/);
 assert.match(view,/onRequestLink\(c\.id,requestNote\)/);
 assert.match(app,/linkHistoricalProfile\(id\)/);
 assert.match(auth,/participantLegacyEmail\.findUnique/);
 assert.match(auth,/emailVerifiedAt/);
 assert.match(auth,/normalizeHistoricalLinkEmail\(legacyEmail\.email\) === userEmail/);
});

test('ADMIN diagnostics are explicit, protected and never return raw archived email values',async()=>{
 const [view,controller,service,diagnosis]=await Promise.all([
  read('../src/admin/ProfileLinksPage.tsx'),
  read('../../backend/src/auth/profile-links.controller.ts'),
  read('../../backend/src/auth/profile-links.service.ts'),
  read('../../backend/src/auth/profile-link-diagnostics.ts'),
 ]);
 assert.match(controller,/@Controller\('admin\/profile-links'\)[\s\S]*?@Roles\('ADMIN'\)/);
 assert.match(controller,/@Get\('diagnostics'\)/);
 assert.match(view,/Проверить историческую привязку/);
 assert.match(view,/\/admin\/profile-links\/diagnostics\?userId=/);
 assert.match(service,/classifyHistoricalLink\(user,participant,legacy\)/);
 assert.match(diagnosis,/canSelfLink:false/);
 assert.doesNotMatch(diagnosis,/return\s*\{[^}]*email:/);
});
