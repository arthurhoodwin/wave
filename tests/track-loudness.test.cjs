'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {measure}=require('../src/renderer/loudness-meter.js');
const {TrackLoudness,gainFor}=require('../src/main/track-loudness.cjs');
const {HybridProxy}=require('../src/main/local-media.cjs');
const rate=48000;
const tone=(amplitude,frequency=997,phase=0,length=2*rate)=>
 Float32Array.from({length},(_,i)=>amplitude*Math.sin(2*Math.PI*frequency*i/rate+phase));
const approximately=(a,b,tolerance=.08)=>assert(Math.abs(a-b)<tolerance,`${a} ≠ ${b}`);

test('loudness tracks the ITU reference, rejects silence and gates quiet content',()=>{
 const reference=tone(1);
 approximately(measure([reference]).lufs,-3.01);
 const minutesOfSilence=new Float32Array(5*rate);
 minutesOfSilence.set(reference,2*rate);
 approximately(measure([minutesOfSilence]).lufs,-3.01,.9);
 assert.equal(measure([tone(0)]),null);
 const loud=tone(.45),quiet=tone(.225);
 approximately(measure([loud,quiet]).lufs-measure([tone(.225),tone(.1125)]).lufs,20*Math.log10(2));
});

test('four-phase true peak catches intersample peaks and constrains gain',()=>{
 const between=tone(.99,12000,Math.PI/4),level=measure([between]);
 assert(level.dbtp>20*Math.log10(.99/Math.sqrt(2))+2);
 assert(level.dbtp+gainFor(level)<=-1.5);
 assert.equal(gainFor({lufs:-60,dbtp:-30,channels:2}),6);
 assert.equal(gainFor({lufs:-24,dbtp:0,channels:2}),-1.5);
 assert.equal(gainFor(undefined),null);
 approximately(gainFor(measure([tone(.15)])),gainFor(measure([tone(.15),tone(.15)])));
});

async function complete(service){
 const deadline=Date.now()+4000;
 while(['running','cancelling'].includes(service.status().phase)&&Date.now()<deadline)
  await new Promise(resolve=>setTimeout(resolve,10));
 return service.status();
}

test('local analysis stores results by verified content, supports cancellation and reuses results after restart',async t=>{
 const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'wave-loudness-'));
 t.after(async()=>{for(const entry of await fs.readdir(scratch))await fs.unlink(path.join(scratch,entry));await fs.rmdir(scratch);});
 const a={sha256:'a'.repeat(64),track:{key:'1_1',duration:80},bytes:120},
       b={sha256:'b'.repeat(64),track:{key:'1_2',duration:80},bytes:120};
 const library={encrypt:async value=>Buffer.from(value),decrypt:async bytes=>bytes.toString(),
  account:async()=>({data:{downloads:[a,b]}})};
 let root='/audios1',began,reads=0;
 const started=new Promise(resolve=>began=resolve);
 const common={directory:scratch,library,getRoot:()=>root,downloads:{locate:async(_root,key)=>({record:key===a.track.key?a:b})}};
 const job=new TrackLoudness({...common,measure:async({record},signal)=>{
  reads++;
  if(record===a)return {lufs:-20,dbtp:-8,channels:2};
  began();
  return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 }});
 job.start();await started;assert.equal(job.cancel().phase,'cancelling');
 const cancelled=await complete(job);
 assert.equal(cancelled.phase,'cancelled');assert.equal(cancelled.measured,1);assert.equal(reads,2);
 const next=new TrackLoudness({...common,measure:async()=>({lufs:-12,dbtp:-3,channels:2})});
 assert.equal(await next.gain(root,a),4);
 assert.equal(await next.gain(root,b),null);
 next.start();const finished=await complete(next);
 assert.equal(finished.cached,1);assert.equal(finished.measured,1);
 const proxy=new HybridProxy({locate:async()=>({file:'fixture',record:a}),getRoot:()=>root,localGain:(r,record)=>next.gain(r,record)});
 try{
  assert.equal((await proxy.open('wave-local:1_1')).trackGainDb,4);
  root='/audios2';assert.equal((await proxy.open('wave-local:1_1')).trackGainDb,undefined);
 }finally{await proxy.close();}
});


test('track gain is separate from crossfade, EQ and library volume',async()=>{
 const {create,presets}=require('../src/renderer/equalizer.js');
 class Param{
  constructor(){this.value=1;}
  cancelAndHoldAtTime(){}
  cancelScheduledValues(){}
  setTargetAtTime(value){this.value=value;}
  setValueAtTime(value){this.value=value;}
  linearRampToValueAtTime(value){this.value=value;}
 }
 class AudioNode{
  connect(node){this.next=node;return node;}
  disconnect(){this.next=null;}
 }
 let context;
 class Context{
  constructor(){context=this;this.sampleRate=48000;this.currentTime=0;this.destination=new AudioNode();this.inputs=[];}
  createMediaElementSource(audio){const source=new AudioNode();this.inputs.push({source,audio});return source;}
  createGain(){const node=new AudioNode();node.gain=new Param();return node;}
  createBiquadFilter(){const node=this.createGain();node.frequency=new Param();node.Q=new Param();return node;}
  createWaveShaper(){return new AudioNode();}
  async resume(){}
 }
 const engine=create(Context);
 engine.setLoudnessEnabled(true);
 const active={volume:.42},prepared={volume:.42},unmeasured={volume:.42};
 const detach=await Promise.all([engine.attach(active,-6),engine.attach(prepared,4),engine.attach(unmeasured)]);
 const [activeTrim,preparedTrim,unity]=context.inputs.map(input=>input.source.next);
 approximately(activeTrim.gain.value,10**(-6/20));
 approximately(preparedTrim.gain.value,10**(4/20));
 assert.equal(unity.gain.value,1);
 detach[0].gain(1,0,2);
 detach[1].gain(0,1,2);
 const envelope=activeTrim.next;
 engine.set({enabled:true,gains:presets.bass});
 assert.equal(envelope.gain.value,0);
 assert.equal(active.volume,.42);
 approximately(activeTrim.gain.value,10**(-6/20));
 engine.setLoudnessEnabled(false);
 assert.equal(activeTrim.gain.value,1);
 assert.equal(preparedTrim.gain.value,1);
 assert.equal(envelope.gain.value,0);
 for(const disconnect of detach)disconnect();
 assert.equal(engine.info().connections,0);
});
