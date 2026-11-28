'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {ListeningRecaps}=require('../src/main/listening-recaps.cjs');

const root='/audios13';
const track={key:'13_1',title:'A song',artist:'An artist',duration:120};
const stamp=(month,day,hour=0,minute=0,second=0)=>new Date(2026,month-1,day,hour,minute,second).getTime();

async function setup(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wave-recap-test-'));
 t.after(async()=>{
  const verified=await fs.realpath(directory);
  const expected=await fs.realpath(os.tmpdir());
  assert.equal(path.dirname(verified),expected);
  assert(path.basename(verified).startsWith('wave-recap-test-'));
  // Files are known from the test fixture itself.
  for(const entry of await fs.readdir(verified,{withFileTypes:true})){
   if(!entry.isDirectory()||!/^[a-f0-9]{64}$/.test(entry.name))continue;
   const sub=path.join(verified,entry.name);
   for(const file of await fs.readdir(sub))await fs.unlink(path.join(sub,file));
   await fs.rmdir(sub);
  }
  await fs.rmdir(verified);
 });
 let now=stamp(11,1),enabled=true;
 const factory=()=>new ListeningRecaps({directory,firstLaunch:stamp(10,22),now:()=>now,historyAllowed:async()=>enabled,
  encrypt:async text=>Buffer.from(text),decrypt:async bytes=>bytes.toString()});
 let recap=factory();
 return {
  get recap(){return recap;},
  setNow:value=>{now=value;},
  restart:async()=>{await recap.close();recap=factory();},
  setEnabled:async value=>{enabled=value;await recap.trackingChanged(root,value);},
  sample:(currentTime,extra={},device=root)=>recap.sample(device,track,{currentTime,playing:true,...extra},{generation:1,offline:true})
 };
}

test('recaps record actual playback, excluding pause, buffering and seeks',async t=>{
 const f=await setup(t), start=stamp(11,10);
 await f.recap.archive(root);
 f.setNow(start);
 await f.sample(0);
 for(let i=1;i<=31;i++){f.setNow(start+i*1000);await f.sample(i);}
 f.setNow(start+32000);await f.sample(31,{playing:false});
 f.setNow(start+33000);await f.sample(31);
 f.setNow(start+34000);await f.sample(70);
 f.setNow(start+35000);await f.sample(70,{buffering:true});
 f.setNow(start+36000);await f.sample(71);
 f.setNow(start+37000);await f.sample(72);
 await f.restart();
 f.setNow(stamp(12,1));
 const {report}=await f.recap.view(root,'2026-11');
 assert.equal(report.plays,1);
 assert.equal(report.ms,32000, '31 seconds of initial playback plus one after buffering');
 assert.equal(report.offlineMs,report.ms);
 assert.equal(report.track.trackKey,track.key);
});
test('calendar archive separates months and consumes invitation once across restarts',async t=>{
 const f=await setup(t);
 await f.recap.archive(root);
 const start=stamp(11,30,23,59,58);
 f.setNow(start);await f.sample(0);
 f.setNow(start+3000);await f.sample(3);
 assert.equal((await f.recap.view(root,'2026-11')).report.ms,2000);
 assert.deepEqual(await f.recap.invitation(root),{month:'2026-11'});
 await f.restart();
 assert.deepEqual(await f.recap.invitation(root),{month:null});
 const archive=await f.recap.archive(root);
 assert.deepEqual(archive.months.map(m=>[m.month,m.coverage,m.hasData]),[['2026-11','complete',true],['2026-10','missing',false]]);
 f.setNow(stamp(1,1)+365*86400000);
 assert.equal((await f.recap.view(root,'2026-12')).report.ms,1000);
});
test('disabled and cleared analytics remain isolated from another profile',async t=>{
 const f=await setup(t);
 await f.recap.archive(root);
 const start=stamp(11,3);
 f.setNow(start);await f.sample(0);
 f.setNow(start+1000);await f.sample(1);
 f.setNow(start+2000);await f.sample(2,{},'/audios42');
 f.setNow(start+3000);await f.sample(3,{},'/audios42');
 await f.setEnabled(false);
 f.setNow(start+4000);await f.sample(4);
 f.setNow(stamp(12,1));
 assert.equal((await f.recap.view(root,'2026-11')).report.ms,1000);
 assert.equal((await f.recap.view(root,'2026-11')).coverage,'partial');
 await f.recap.clear(root);
 assert.equal((await f.recap.view(root,'2026-11')).report,null);
 assert.equal((await f.recap.view('/audios42','2026-11')).report.ms,1000);
});
