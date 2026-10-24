'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {retryRead,requestAudio}=require('../src/main/downloads/download-http.cjs');
const {url}=require('./helpers/downloads.cjs');


test('safe GET retries are capped, honor short Retry-After and do not retry long throttling',async()=>{let calls=0;const waits=[];await assert.rejects(retryRead(()=>requestAudio(async()=>{calls++;return new Response('',{status:503,headers:{'retry-after':'1'}});},url),{delay:async ms=>waits.push(ms)}));assert.equal(calls,3);assert.deepEqual(waits,[1000,1000]);calls=0;await assert.rejects(retryRead(()=>requestAudio(async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'120'}});},url),{delay:async()=>assert.fail('must not back off for two minutes')}));assert.equal(calls,1);});

test('abort during backoff prevents another network read',async()=>{const controller=new AbortController();let calls=0;const task=retryRead(async()=>{calls++;throw Object.assign(Error('network'),{retryable:true});},{signal:controller.signal});controller.abort();await assert.rejects(task);assert.equal(calls,1);});
