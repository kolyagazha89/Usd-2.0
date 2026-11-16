import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectPublicStageRules } from '../src/stage-rules-model.ts';

const oldStageRevision = Object.freeze({
  revisionId: 'old-stage-revision',
  publishedAt: '2026-10-15T10:00:00Z',
  blocks: [{ type: 'paragraph', text: 'Старая редакция' }],
});
const newPublishedRevision = Object.freeze({
  id: 'new-published-revision',
  publishedAt: '2026-11-09T10:00:00Z',
  blocks: [{ type: 'paragraph', text: 'Новый регламент' }],
});

test('published general regulation wins over stale historical stage snapshot', () => {
  const result = selectPublicStageRules(newPublishedRevision, oldStageRevision);
  assert.equal(result.source, 'current');
  assert.equal(result.document?.id, 'new-published-revision');
  assert.equal(result.document?.blocks[0].text, 'Новый регламент');
  assert.equal(oldStageRevision.blocks[0].text, 'Старая редакция');
});

test('completed stages retain historical event-time regulations for archive accuracy', () => {
  const result = selectPublicStageRules(newPublishedRevision, oldStageRevision, true);
  assert.equal(result.source, 'historical');
  assert.equal(result.document?.revisionId, 'old-stage-revision');
});

test('historical snapshot is clearly marked when published regulation is unavailable', () => {
  const result = selectPublicStageRules(null, oldStageRevision);
  assert.equal(result.source, 'historical');
  assert.equal(result.document?.revisionId, 'old-stage-revision');
});

test('empty or malformed current regulation never hides a valid historical copy', () => {
  const result = selectPublicStageRules({id:'broken',blocks:[]}, oldStageRevision);
  assert.equal(result.source, 'historical');
  assert.equal(result.document, oldStageRevision);
});

test('missing both versions does not invent a regulation', () => {
  const result = selectPublicStageRules(null, null);
  assert.equal(result.source, 'unavailable');
  assert.equal(result.document, null);
});

test('stage detail passes the same current published document as the public rules page', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const component = readFileSync(new URL('../src/PublicStageRulesSnapshot.tsx', import.meta.url), 'utf8');
  assert.match(app, /<PublicStageRulesSnapshot[^>]*currentPublished=\{settings\.registration\?\.rulesDocument\?\.published\}/);
  assert.match(component, /selectPublicStageRules\(currentPublished, snapshot, preferHistorical\)/);
  assert.match(app, /preferHistorical=\{stage\.status==='COMPLETED'\}/);
  assert.match(component, /source==='historical'/);
  assert.match(component, /href="\/rules"/);
});
