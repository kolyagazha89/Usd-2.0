import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('stage detail gets the currently published regulation without overwriting its snapshot', () => {
  const app = read('../src/App.tsx');
  assert.match(app, /<PublicStageRulesSnapshot\s+snapshot=\{stage\.rulesSnapshot\}\s+stageName=\{stage\.name\}\s+currentSnapshot=\{settings\.registration\?\.rulesDocument\?\.published\}/);
});

test('upcoming stage displays the current regulation and retains an explicitly labeled historical snapshot', () => {
  const component = read('../src/PublicStageRulesSnapshot.tsx');
  assert.match(component, /status !== 'COMPLETED' && currentSnapshot\?\.blocks\?\.length/);
  assert.match(component, /currentSnapshot\.id !== snapshot\?\.revisionId/);
  assert.match(component, /Действующий общий регламент/);
  assert.match(component, /Архивная редакция при публикации этапа/);
  assert.match(component, /Открыть действующий регламент/);
});

test('completed stages keep their published snapshot as the historical record', () => {
  const component = read('../src/PublicStageRulesSnapshot.tsx');
  assert.match(component, /status === 'COMPLETED'/);
  assert.match(component, /snapshot\.blocks/);
});
