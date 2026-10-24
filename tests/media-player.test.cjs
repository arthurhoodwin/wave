const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');

function renderer(){let command,audio,hls,timer;const reports=[];
 class Audio extends EventTarget{constructor(){super();audio=this;this.duration=120;this.currentTime=0;this.readyState=4;this.paused=true;this.buffered={length:1,start:()=>0,end:()=>5};}play(){this.paused=false;return Promise.resolve();}pause(){this.paused=true;}load(){}removeAttribute(){}canPlayType(){return false;}}
 class Hls{static isSupported(){return true;}static Events={ERROR:'error'};constructor(){hls=this;this.starts=[];}on(){}loadSource(){}attachMedia(){}startLoad(time){this.starts.push(time);}destroy(){}}
 const context={window:{music:{onPlaybackCommand:fn=>command=fn,mediaEvent:e=>reports.push(e)}},Audio,Hls,setTimeout:fn=>(timer=fn,1),clearTimeout(){},Error};context.window.Hls=Hls;
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/media-player.js'),'utf8'),context);
 return{send:c=>command({generation:1,...c}),reports,get audio(){return audio;},get hls(){return hls;},timeout:()=>timer()};
}


test('unbuffered HLS seek starts loading at requested time and waits for seek completion',async()=>{const f=renderer();await f.send({type:'reset',id:1});await f.send({type:'load',id:2,format:'hls',url:'fixture',volume:.5});f.audio.seeking=true;const pending=f.send({type:'seek',id:3,time:90});assert.deepEqual(f.hls.starts,[90]);assert.equal(f.audio.currentTime,90);assert(!f.reports.some(e=>e.requestId===3));f.audio.seeking=false;f.audio.dispatchEvent(new Event('seeked'));await pending;assert(f.reports.some(e=>e.requestId===3&&e.type==='state'&&!e.buffering));});

test('seek preserves pause intent and timeout does not become a fatal media failure',async()=>{const f=renderer();await f.send({type:'reset'});await f.send({type:'load',id:1,format:'hls',url:'fixture',volume:.5});await f.send({type:'pause',id:2});f.audio.seeking=true;const pending=f.send({type:'seek',id:3,time:80});f.timeout();await pending;assert.equal(f.audio.paused,true);assert(f.reports.some(e=>e.requestId===3&&e.type==='seek-error'));assert(!f.reports.some(e=>e.type==='error'));});

test('reset cancels an in-flight seek and ignores its late events',async()=>{const f=renderer();await f.send({type:'reset'});await f.send({type:'load',id:1,format:'hls',url:'fixture',volume:.5});f.audio.seeking=true;const old=f.audio,pending=f.send({type:'seek',id:3,time:90});await f.send({type:'reset',generation:2,id:4});old.seeking=false;old.dispatchEvent(new Event('seeked'));await pending;assert(!f.reports.some(e=>e.requestId===3));assert(f.reports.some(e=>e.requestId===4));});

test('seek failure releases its command without refreshing the selected track',async()=>{const {NativePlayer}=require('../src/main/native-player.cjs');let p,resolves=0;p=new NativePlayer({api:{resolveAudio:async()=>{resolves++;return{url:'fixture'};}},proxy:{open:async()=>({url:'fixture',leaseId:'fixture'}),reset(){},close:async()=>{}},send:c=>{setImmediate(()=>p.accept({generation:c.generation,requestId:c.id,type:c.type==='seek'?'seek-error':'state',playing:true,duration:120,currentTime:0}));return true;}});try{await p.play({id:'selected',key:'fixture',duration:120});await assert.rejects(p.seek(90),/перемотать/);assert.equal(resolves,1);assert.equal(p.current.id,'selected');assert.equal(p.pending.size,0);assert.equal(p.last.buffering,false);}finally{await p.close();}});
