import test from 'node:test';
import assert from 'node:assert/strict';
import { PUBLICATION_OPTIONS, emptyChoices, coerceChoices } from '../src/participant/publication-consent-model.ts';

test('each legal publication purpose starts unselected', () => {
 assert.equal(PUBLICATION_OPTIONS.length,9);
 assert.ok(Object.values(emptyChoices()).every(value=>value===false));
});
test('missing or malformed server permissions cannot become affirmative', () => {
 assert.equal(coerceChoices({identity:true}).identity,true);
 assert.equal(coerceChoices({profilePhoto:'true'}).profilePhoto,false);
 assert.equal(coerceChoices({eventPhoto:1}).eventPhoto,false);
 assert.equal(coerceChoices(null).results,false);
});
