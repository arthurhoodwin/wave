'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const {VkProvider}=require('../src/main/provider.cjs');
test('0:00 is disabled at normalization and rejected before any player calls',async()=>{
 let calls=0;const engine={evaluate:async()=>{calls++;return true}};const p=new VkProvider(engine);const context={items:new Map(),scope:'body'};
 p.absorbRows({route:'https://vk.ru/audio',rows:[{key:'zero',title:'Deleted',artist:'Artist',time:'0:00',available:true},{key:'ok',title:'Live',artist:'Artist',time:'3:12',available:true}]},context);
 const tracks=Array.from(context.items.values());assert.equal(tracks[0].available,false);assert.equal(tracks[1].available,true);
 await assert.rejects(p.play(tracks[0].id),/недоступна/);assert.equal(calls,0);assert.equal(p.playRequest,0);
});
test('new valid selection cancels the old confirmation wait and ignores catalogue backlog',async()=>{
 const engine={evaluate:async()=>true};const p=new VkProvider(engine);p.route=async()=>{};p.readyRows=async()=>{};
 p.tracks.set('a',{id:'a',key:'a',title:'A',duration:10,available:true,route:'https://vk.ru/audio',scope:'body'});
 p.tracks.set('b',{id:'b',key:'b',title:'B',duration:10,available:true,route:'https://vk.ru/audio',scope:'body'});
 p.rawPlayer=async()=>p.playRequest>=2?{playing:true,key:'b',title:'B'}:{playing:false,key:'a',title:'A'};
 p.serial=new Promise(()=>{}); // Catalogue navigation must not own the player lock.
 const start=Date.now();const old=p.play('a').catch(e=>e.message);await new Promise(r=>setTimeout(r,20));
 const result=await p.play('b');assert.equal(result.playing,true);assert.match(await old,/другой трек/);assert(Date.now()-start<1000);assert.equal(p.active.actualKey,'b');
});
test('a complete library cache is reused without navigating or rereading the catalogue',async()=>{
 let evaluations=0;const engine={evaluate:async()=>{evaluations++;return{ready:true,root:'/audios123'}}};const p=new VkProvider(engine);p.root='/audios123';
 const e=p.cache.create('library:/audios123','Моя музыка','library');e.total=1;e.items.set('a',{id:'a',title:'A',duration:10,available:true});e.cacheState='complete';p.savedPlaylists=[{id:'list',title:'List'}];
 const result=await p.library();assert.equal(result.cacheId,e.id);assert.equal(result.tracks.length,1);assert.equal(result.playlists.length,1);assert.equal(evaluations,0);
});
test('a new playback window can be empty until its first navigation',async()=>{
 const {ElectronEngine}=require('../src/main/engines.cjs');let executed=false;const engine=new ElectronEngine({isDestroyed:()=>false,webContents:{getURL:()=>'',executeJavaScript:()=>{executed=true;}}});
 assert.equal(await engine.evaluate('location.href'),null);assert.equal(executed,false);
});
test('idle preparation does not issue play and is skipped for an active or paused song',async()=>{
 const calls=[];const engine={evaluate:async text=>{calls.push(text);return{ready:true,playing:false}}};const data={};const p=new VkProvider(data,engine);p.route=async url=>calls.push('route:'+url);
 p.preparePlayback('https://vk.ru/audio');await p.playSerial;assert(calls.some(x=>x.startsWith('route:')));assert(!calls.some(x=>/playByButton|\.play\(/.test(x)));assert.equal(p.active,null);
 const count=calls.length;p.active={id:'paused'};p.preparePlayback('https://vk.ru/other');await p.playSerial;assert.equal(calls.length,count);
});
test('repeat of the current track starts at zero rather than resuming its end',async()=>{
 const calls=[];const e={evaluate:async x=>{calls.push(x);return true}};const p=new VkProvider(e);p.route=async()=>{};p.readyRows=async()=>{};p.tracks.set('a',{id:'a',key:'a',title:'A',duration:20,available:true,route:'https://vk.ru/audio'});p.rawPlayer=async()=>({key:'a',title:'A',playing:true,duration:20,currentTime:19.9});
 await p.play('a');assert(calls.some(x=>x.includes('seekToTime(0)')));assert.equal(p.active.lastTime,0);
});
test('an ended track is detected after VK resets progress, a manual pause is not',async()=>{
 const p=new VkProvider({});p.active={title:'A',artist:'B',actualKey:'a',duration:20,lastDuration:20,lastTime:19.5};p.rawPlayer=async()=>({key:'a',playing:false,currentTime:0,duration:20});assert.equal((await p.player()).ended,true);
 p.active={title:'A',artist:'B',actualKey:'a',duration:20,lastDuration:20,lastTime:5};assert.notEqual((await p.player()).ended,true);
});
test('VK auto-next is stopped and passed to the local playback context',async()=>{
 const p=new VkProvider({});p.active={title:'A',artist:'B',actualKey:'a',duration:20};p.rawPlayer=async()=>({key:'b',playing:true,currentTime:0,duration:30});let paused=0;p.pause=async()=>{paused++;return{playing:false}};const r=await p.player();assert.equal(r.ended,true);assert.equal(r.playing,false);assert.equal(paused,1);
});
test('a replacement Play cancels an unfinished page navigation',async()=>{
 let cancelled=0;const e={evaluate:async()=>true,cancelNavigation:()=>cancelled++};const p=new VkProvider(e);p.playPending=true;p.playNavigating=true;p.route=async()=>{};p.readyRows=async()=>{};p.tracks.set('a',{id:'a',key:'a',title:'A',duration:20,available:true,route:'https://vk.ru/audio'});p.rawPlayer=async()=>({key:'a',title:'A',playing:true,duration:20});await p.play('a');assert.equal(cancelled,1);
});
