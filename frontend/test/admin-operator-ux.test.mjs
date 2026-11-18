import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const get=path=>readFile(new URL('../src/admin/'+path,import.meta.url),'utf8');

test('profile-link work queue precedes the optional history/audit tools',async()=>{
 const code=await get('ProfileLinksPage.tsx');
 const queue=code.indexOf('className="profile-link-filters"');
 const tools=code.indexOf('className="profile-link-advanced-tools"');
 assert.ok(queue>0&&tools>queue,'pending claims must appear before secondary diagnostics');
 assert.match(code,/Заявки на привязку/);
 assert.match(code,/<details className="profile-link-advanced-tools"/);
 assert.match(code,/<summary[^>]*>Дополнительные инструменты/);
 assert.match(code,/<DuplicateProfilesPreview\/>/,'duplicate merge tool must remain available');
 assert.match(code,/className="profile-email-coverage"/,'email diagnostics must remain available');
 assert.match(code,/Заявок с выбранным статусом нет/);
});

test('user search supports explicit submit and one-click clearing',async()=>{
 const code=await get('UsersPage.tsx');
 assert.match(code,/aria-label="Поиск пользователей по email"/);
 assert.match(code,/Найти/);
 assert.match(code,/aria-label="Очистить поиск пользователей"/);
 assert.match(code,/onClick=\{\(\)=>void load\(\{search:''\}\)\}/);
 assert.match(code,/Пользователи не найдены/);
 assert.match(code,/Сбросить поиск и фильтры/);
 assert.match(code,/aria-label="Обновить список пользователей"/);
});

test('system and custom roles are only persisted after an explicit confirmation',async()=>{
 const code=await get('UsersPage.tsx');
 assert.match(code,/pendingRoleChange/);
 assert.match(code,/setPendingRoleChange\(\{userId:u\.id,kind:'system'/);
 assert.match(code,/setPendingRoleChange\(\{userId:u\.id,kind:'custom'/);
 assert.match(code,/Подтвердить изменение роли/);
 assert.match(code,/Отмена/);
 assert.match(code,/полный доступ/);
 assert.match(code,/disabled=\{roleSaving\}/);
 assert.match(code,/if\(roleSaving\)return/);
 assert.doesNotMatch(code,/onChange=\{e=>void changeRole\(u,e\.target\.value\)\}/);
 assert.doesNotMatch(code,/onChange=\{e=>void changeCustomRole\(u,e\.target\.value\)\}/);
});

test('user list remains keyboard accessible with labelled status actions and visible save errors',async()=>{
 const code=await get('UsersPage.tsx');
 assert.match(code,/tabIndex=\{0\}/);
 assert.match(code,/e\.target===e\.currentTarget&&\(e\.key==='Enter'\|\|e\.key===' '\)/);
 assert.match(code,/aria-label=\{'Изменить статус пользователя '/);
 assert.match(code,/role="status"/);
 assert.match(code,/setError\(''\)/);
});

test('technical diagnostics are compact on narrow screens without hiding the claim queue',async()=>{
 const css=await get('profile-links.css');
 assert.match(css,/\.profile-link-advanced-tools/);
 assert.match(css,/\.profile-link-advanced-tools\[open\]/);
 assert.match(css,/@media\(max-width:660px\)/);
});
