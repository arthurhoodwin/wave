'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {RequestScheduler}=require('../src/main/request-scheduler.cjs');
const tick=()=>new Promise(r=>setImmediate(r));


test('scheduler reserves playback capacity and limits background work',async()=>{const s=new RequestScheduler(),started=[],release=new Map();const task=(id,priority)=>s.run(id,()=>new Promise(r=>{started.push(id);release.set(id,r);}),{priority});const jobs=[task('bg1','background'),task('bg2','background'),task('ui1','interactive'),task('ui2','interactive')];await tick();assert.deepEqual(started,['bg1','ui1','ui2']);jobs.push(task('play','playback'));await tick();assert.equal(started.at(-1),'play');release.get('bg1')();await tick();assert(started.includes('bg2'));for(const r of release.values())r();await Promise.all(jobs);assert.equal(s.stats().active,0);s.close();});

test('shared read cancellation does not cancel another reader',async()=>{const s=new RequestScheduler();let count=0,finish,signal;const fn=async input=>{count++;signal=input;return new Promise(r=>finish=r);};const abort=new AbortController(),a=s.run('same',fn,{signal:abort.signal}).catch(e=>e.kind),b=s.run('same',fn);await tick();abort.abort();assert.equal(await a,'cancelled');assert.equal(signal.aborted,false);finish(42);assert.equal(await b,42);assert.equal(count,1);assert.equal(s.stats().shared,1);s.close();});

test('queued background priority follows the currently open view',async()=>{const s=new RequestScheduler();const releases=[],order=[];const hold=id=>s.run(id,()=>new Promise(r=>releases.push(r)));const first=[hold('one'),hold('two'),hold('three')];await tick();let active=true;const old=s.run('old',async()=>order.push('old'),{priority:()=>active?'interactive':'background'});active=false;const current=s.run('current',async()=>order.push('current'));releases[0]();await tick();assert.equal(order[0],'current');for(const r of releases)r();await Promise.all([...first,old,current]);s.close();});

test('writes without a sharing key are never combined',async()=>{const s=new RequestScheduler();let n=0;await Promise.all([s.run(null,async()=>++n),s.run(null,async()=>++n)]);assert.equal(n,2);s.close();});
