import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHistoricalBatch} from '../src/admin/global-historical-response.ts';
const batch=()=>({id:'batch',status:'RUNNING',sourceResults:1,imported:0,kept:0,aliases:0,needsReview:0,failedStages:0,processedStages:0,totalStages:1,peopleInSource:1,stages:[{name:'Финал',year:2026,number:12,status:'PENDING',sourceRows:1,imported:0,aliases:0,kept:0,review:[]}]});
test('empty server response after deleting old imports does not become a batch',()=>{for(const body of [null,undefined,{},JSON.parse('{}')])assert.equal(parseHistoricalBatch(body),null)});
test('valid running and completed batches retain stages and counters',()=>{for(const status of ['RUNNING','COMPLETED','NEEDS_REVIEW']){const input={...batch(),status};assert.equal(parseHistoricalBatch(input).stages[0].name,'Финал');assert.equal(parseHistoricalBatch(input).status,status)}});
test('missing review collection is safe to render',()=>{const input=batch();delete input.stages[0].review;assert.deepEqual(parseHistoricalBatch(input).stages[0].review,[])});
test('malformed response stays in the request error path instead of crashing React',()=>{for(const body of [{id:'batch'}, {...batch(),stages:null},{...batch(),stages:[null]},{...batch(),sourceResults:{}},{...batch(),stages:[{...batch().stages[0],review:[{name:{}}]}]}])assert.throws(()=>parseHistoricalBatch(body))});
