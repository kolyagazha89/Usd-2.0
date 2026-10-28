import test from 'node:test';
import assert from 'node:assert/strict';
import {getLiveQaConfig} from '../../scripts/public-browser-qa-config.mjs';

test('live acceptance checks the deployed prerelease site without candidate CSS',()=>{
 const config=getLiveQaConfig({});
 assert.equal(config.base,'https://app.usd-russia.ru');
 assert.equal(config.injectCandidateCss,false);
 assert.equal(config.visualSource,'deployed site, unmodified styles');
});

test('candidate CSS preview is explicitly enabled and labelled',()=>{
 const config=getLiveQaConfig({USD_QA_CANDIDATE_CSS:'1'});
 assert.equal(config.injectCandidateCss,true);
 assert.match(config.visualSource,/candidate CSS preview/);
 assert.match(config.visualSource,/not deployment acceptance/);
});

test('ambiguous preview settings fail instead of silently changing acceptance scope',()=>{
 for(const value of ['true','yes','0']) assert.throws(()=>getLiveQaConfig({USD_QA_CANDIDATE_CSS:value}),/USD_QA_CANDIDATE_CSS/);
});
