'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createFixture,track,root,wav,waitUntil}=require('./helpers/downloads.cjs');
test('three transfers run by default; reducing the preference lets active jobs finish before starting more',async()=>{
 let active=0,peak=0,calls=0;const releases=[];
 const f=await createFixture(async()=>{active++;calls++;peak=Math.max(peak,active);await new Promise(r=>releases.push(()=>{active--;r();}));return new Response(wav(),{headers:{'content-length':'4096'}});});
 try{await f.manager.add(root,Array.from({length:5},(_,i)=>({...track,key:'12_'+(100+i)})));await waitUntil(()=>calls===3);assert.equal(peak,3);const account=await f.library.account(root);account.data.downloadConcurrency=1;f.manager.pump();releases.shift()();await waitUntil(()=>account.data.downloads.length===1);assert.equal(calls,3);releases.shift()();releases.shift()();await waitUntil(()=>calls===4);assert.equal(peak,3);releases.shift()();await waitUntil(()=>calls===5);releases.shift()();await f.wait();assert.equal(account.data.downloads.length,5);await f.restart();assert.equal((await f.library.account(root)).data.downloadConcurrency,1);}finally{for(const r of releases)r();await f.close();}
});
test('parallel transfers share quota and cannot commit more bytes than the library limit',async()=>{
 const f=await createFixture();try{const account=await f.library.account(root);account.data.limitBytes=9000;await f.manager.add(root,Array.from({length:3},(_,i)=>({...track,key:'12_'+(200+i)})));await f.wait();assert(account.data.downloads.length<=2);assert(account.data.downloads.reduce((n,r)=>n+r.storageBytes,0)<=9000);assert(f.manager.public(root).some(j=>j.state==='error'));assert.equal(f.manager.reservations.size,0);}finally{await f.close();}
});
test('simultaneous additions deduplicate keys and cancellation stops all active workers without losing the journal',async()=>{
 const f=await createFixture(async(_url,{signal})=>new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true});}));try{await Promise.all([f.manager.add(root,[track]),f.manager.add(root,[track,{...track,key:'12_35'}])]);await waitUntil(()=>[...f.manager.jobs.values()].filter(j=>j.controller).length===2);assert.equal(f.manager.jobs.size,2);await f.manager.controlAll(root,'pause');await f.wait();assert(f.manager.public(root).every(j=>j.state==='paused'));await f.restart();assert.equal(f.manager.jobs.size,2);assert(f.manager.public(root).every(j=>j.state==='paused'));}finally{await f.close();}
});
test('HTTP429 lowers the pool and honours server cooldown instead of launching queued work',async()=>{
 let calls=0;const f=await createFixture(async()=>{calls++;return new Response('',{status:429,headers:{'retry-after':'10'}});});try{await f.manager.add(root,[track]);await f.wait();assert.equal(calls,1);assert.equal(f.manager.throttle,1);assert(f.manager.cooldown>Date.now()+5000);await f.manager.add(root,[{...track,key:'12_99'}]);assert.equal(calls,1);}finally{await f.close();}
});
