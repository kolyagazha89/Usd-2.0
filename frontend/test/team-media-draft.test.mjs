import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeDraftImageKeys} from '../src/teams/team-media-draft.ts';

test('partial photo upload cannot duplicate already added gallery keys when subsequent upload fails',()=>{
 const afterFirst=mergeDraftImageKeys(['original'],['uploaded-1']);
 const afterError=mergeDraftImageKeys(afterFirst,['uploaded-1']);
 assert.deepEqual(afterError,['original','uploaded-1']);
});
test('gallery preserves original ordering and uploaded keys while ignoring repeats',()=>{
 assert.deepEqual(mergeDraftImageKeys(['a','b'],['b','c','c','d']),['a','b','c','d']);
 assert.deepEqual(mergeDraftImageKeys(['a','b'],[]),['a','b']);
});
