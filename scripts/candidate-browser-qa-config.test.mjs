import test from 'node:test';
import assert from 'node:assert/strict';
import {getCandidateQaOptions} from './candidate-browser-qa-config.mjs';
test('default UI matrix stays intact and release axe pass can select bounded viewports',()=>{
 assert.deepEqual(getCandidateQaOptions({}),{widths:[1440,1024,390,320],axe:false});
 assert.deepEqual(getCandidateQaOptions({USD_CANDIDATE_QA_WIDTHS:'768,1920',USD_CANDIDATE_QA_AXE:'1'}),{widths:[768,1920],axe:true});
});
test('rejects invalid or duplicate viewport matrices rather than silently skipping acceptance',()=>{
 for(const widths of ['','0','NaN','768,768','768,','768.5','12345'])assert.throws(()=>getCandidateQaOptions({USD_CANDIDATE_QA_WIDTHS:widths}));
});
