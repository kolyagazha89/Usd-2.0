import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');

test('merge is a separate explicit ADMIN action, never a result of preview or profile search',async()=>{
 const [ui,controller,service,module]=await Promise.all([
  read('../src/admin/DuplicateProfilesPreview.tsx'),
  read('../../backend/src/auth/profile-links.controller.ts'),
  read('../../backend/src/auth/profile-merge.service.ts'),
  read('../../backend/src/auth/auth.module.ts'),
 ]);
 assert.match(controller,/@Controller\('admin\/profile-links'\)\s*@Roles\('ADMIN'\)/);
 assert.match(controller,/@Post\('duplicates\/merge'\)/);
 assert.match(controller,/@IsUUID\(\) sourceId/);
 assert.match(module,/ProfileMergeService/);
 assert.match(ui,/preview\.conflicts\.length===0/);
 assert.match(ui,/confirmation!==preview\.source\.id\.slice\(0,8\)/);
 assert.match(ui,/Подтвердить атомарное объединение/);
 assert.match(ui,/apiPost.*\/admin\/profile-links\/duplicates\/merge/);
 assert.match(service,/TransactionIsolationLevel\.Serializable/);
 assert.match(service,/PARTICIPANT_PROFILES_MERGED/);
 assert.match(service,/participantMergeRedirect\.create/);
 assert.doesNotMatch(ui,/useEffect\(\(\)=>.*merge\(/);
});

test('preview and confirmation explain immutable history and retain all public aliases',async()=>{
 const [ui,service,participants]=await Promise.all([
  read('../src/admin/DuplicateProfilesPreview.tsx'),
  read('../../backend/src/auth/profile-merge.service.ts'),
  read('../../backend/src/participants/participants.service.ts'),
 ]);
 assert.match(ui,/Операция записывается в аудит/);
 assert.match(ui,/автоматической отмены нет/);
 assert.match(service,/untouchedMediaUploads/);
 assert.match(service,/sourceWasPublic/);
 assert.match(service,/registration\.updateMany/);
 assert.match(participants,/participantMergeRedirect\?\.findUnique/);
 assert.match(participants,/mergeAsSource\?\.targetId/);
});
