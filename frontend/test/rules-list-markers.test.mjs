import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rulesListMarkers } from '../src/rules-list-markers.ts';

const item = (ordered = true, level = 0) => ({ type: 'list-item', ordered, level });
const heading = { type: 'heading' };
const paragraph = { type: 'paragraph' };

test('numbered DOCX rules show 1, 2, 3 instead of repeating 1', () => {
  assert.deepEqual(rulesListMarkers([item(), item(), item()]), ['1.', '2.', '3.']);
});

test('nested numbering resumes its parent and resets a new nested list', () => {
  assert.deepEqual(rulesListMarkers([
    item(), item(true, 1), item(true, 1), item(), item(true, 1), item(),
  ]), ['1.', '1.', '2.', '2.', '1.', '3.']);
});

test('bullets and new paragraphs restart the relevant numbering sequence', () => {
  assert.deepEqual(rulesListMarkers([
    item(), item(false), item(), item(), paragraph, item(), heading, item(), item(false, 1), item(true, 1),
  ]), ['1.', '•', '1.', '2.', null, '1.', null, '1.', '•', '1.']);
});

test('invalid or excessive list depths are bounded without mutating the source', () => {
  const blocks = [item(true, -4), item(true, Number.POSITIVE_INFINITY), item(true, 99)];
  const copy = structuredClone(blocks);
  assert.deepEqual(rulesListMarkers(blocks), ['1.', '2.', '1.']);
  assert.deepEqual(blocks, copy);
});

test('search uses the original DOCX indexes and all three views share markers', async () => {
  const [publicRules, stageRules, adminRules] = await Promise.all([
    readFile(new URL('../src/PublicRulesPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/PublicStageRulesSnapshot.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/RulesAdminPage.tsx', import.meta.url), 'utf8'),
  ]);
  for (const view of [publicRules, stageRules, adminRules]) {
    assert.match(view, /import \{ rulesListMarkers \} from '\.\/rules-list-markers'/);
    assert.match(view, /rulesListMarkers\(/);
    assert.doesNotMatch(view, /ordered\s*\?\s*'1\.'/);
  }
  assert.match(publicRules, /listMarkers\[index\]/);
  assert.match(publicRules, /visibleDocumentEntries/);
  assert.doesNotMatch(publicRules, /documentBlocks\.indexOf\(block\)/);
  assert.match(stageRules, /listMarkers\[index\]/);
  assert.match(adminRules, /listMarkers\[i\]/);
  const blocks = [heading, item(), item(), paragraph, item()];
  const markers = rulesListMarkers(blocks);
  assert.deepEqual([markers[2], markers[4]], ['2.', '1.'], 'filtered sections retain original numbering');
});
