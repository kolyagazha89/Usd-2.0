import test from 'node:test';
import assert from 'node:assert/strict';
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
