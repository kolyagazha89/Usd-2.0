import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {test} from 'node:test';
const file=(path)=>new URL('../../'+path,import.meta.url);
const read=(path)=>readFileSync(file(path),'utf8');
test('retired assistant cannot be opened, called or assigned as a permission',()=>{
 for(const path of ['frontend/src/admin/AdminRoutes.tsx','frontend/src/admin/AdminShell.tsx','frontend/src/App.tsx','frontend/src/admin/RolesPage.tsx','frontend/src/api.ts','backend/src/app.module.ts','backend/src/auth/roles.guard.ts','backend/src/auth/auth.service.ts']){
  assert.doesNotMatch(read(path),/\/admin\/assistant|\/assistant\/chat|AssistantModule|AssistantPage|AssistantController|['"]assistant['"]|chatAssistant/,path);
 }
 assert.equal(existsSync(file('backend/src/assistant/assistant.controller.ts')),false);
 assert.equal(existsSync(file('frontend/src/admin/AssistantPage.tsx')),false);
});
test('release no longer builds a model corpus or configures an inference container',()=>{
 for(const path of ['.github/workflows/backend-ci.yml','.github/workflows/publish-home-pc-images.yml','deploy/home-pc/compose.yaml']){
  assert.doesNotMatch(read(path),/build-usd-research-corpus|usd-research-corpus\.json|^\s+ollama:|profiles: \[local-ai\]/m,path);
 }
});
