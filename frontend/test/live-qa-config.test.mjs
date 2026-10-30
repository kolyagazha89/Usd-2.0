import test from 'node:test';
import assert from 'node:assert/strict';
import {getLiveQaConfig, isLiveQaReadRequest} from '../../scripts/public-browser-qa-config.mjs';
import {isCandidateApiRequest} from '../../scripts/candidate-browser-qa-config.mjs';
import {getBrowserLaunchOptions} from '../../scripts/browser-qa-config.mjs';

test('live browser reads are confined to the approved app and API hosts',()=>{
 for(const host of ['app.usd-russia.ru','api.usd-russia.ru']){
  for(const method of ['GET','HEAD','OPTIONS'])assert.equal(isLiveQaReadRequest('https://'+host+'/public',method),true);
  assert.equal(isLiveQaReadRequest('https://'+host+'/auth/refresh','POST'),false);
 }
 for(const url of ['https://usd-russia.ru/','https://www.usd-russia.ru/','https://app.usd-russia.ru.example.test/','https://user@app.usd-russia.ru/','http://api.usd-russia.ru/','invalid'])assert.equal(isLiveQaReadRequest(url,'GET'),false);
});

test('browser QA can use an installed Chromium and an explicit environment proxy',()=>{
 assert.deepEqual(getBrowserLaunchOptions({}),{headless:true});
 assert.deepEqual(getBrowserLaunchOptions({USD_BROWSER_EXECUTABLE:'/usr/bin/chromium',USD_BROWSER_PROXY:'http://proxy:8080'}),{
  headless:true,executablePath:'/usr/bin/chromium',proxy:{server:'http://proxy:8080',bypass:'127.0.0.1,localhost'},
 });
});

test('candidate browser fixtures intercept only the self-hosted API',()=>{
 for(const url of ['https://api.usd-russia.ru/auth/refresh','https://api.usd-russia.ru/stages/public'])assert.equal(isCandidateApiRequest(url),true);
 for(const url of ['https://api.usd-russia.ru.example.com/auth/refresh','https://api.usd-russia.ru@unrelated.example/auth/refresh','https://usd-russia.ru/','http://127.0.0.1:3000/','invalid'])assert.equal(isCandidateApiRequest(url),false);
});

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
