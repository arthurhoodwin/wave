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
 const old=p.play('a').catch(e=>e.message);await new Promise(r=>setTimeout(r,20));
 const result=await p.play('b');assert.equal(result.playing,true);assert.match(await old,/другой трек/);assert.equal(p.active.actualKey,'b');
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

const {CollectionEditor}=require('../src/main/collection-editor.cjs');
const route='https://vk.ru/audios123?section=all&z=audio_playlist123_2';


test('editing a warmed empty playlist reloads it only on the next explicit play',async()=>{
 let navigations=0;const engine={evaluate:async()=>route,navigate:async()=>{navigations++;}};const p=new VkProvider(engine,engine);p.root='/audios123';p.playbackDocument={key:p.playbackKey(route),revision:0};p.readyRows=async()=>{};
 const id=p.applyCollectionMutation({action:'create'},{vkId:'123_2',title:'New',owner:'User',rows:[],route},{}).playlistId;
 p.applyCollectionMutation({action:'add',playlistId:id},{vkId:'123_2',title:'New',rows:[{key:'123_5',title:'Song',artist:'Artist',time:'2:00',index:0,available:true}],route},{});assert.equal(navigations,0);
 const track=[...p.cache.byPlaylist.get(id).items.values()][0];p.rawPlayer=async()=>({key:'123_5',title:'Song',playing:true,duration:120});const played=await p.play(track.id);assert.equal(played.playing,true);assert.equal(navigations,1);
 await p.play(track.id);assert.equal(navigations,1);assert.equal(p.playbackKey(route+'&x=ignored'),p.playbackKey('https://vk.ru/music/playlist/123_2_hash'));
});

test('playback readiness waits for the selected list instead of background library rows',async()=>{
 const vm=require('node:vm'),p=new VkProvider({});let attempts=0;
 const target={innerText:'',querySelectorAll:()=>attempts>1?[{}]:[]};
 const document={readyState:'complete',body:{innerText:''},querySelectorAll:()=>Array(100).fill({}),querySelector:selector=>{assert.equal(selector,'[data-testid="MusicPlaylistModal"]');return target;}};
 const engine={evaluate:async script=>{attempts++;return vm.runInNewContext(script,{document});}};
 await p.readyRows(engine,'[data-testid="MusicPlaylistModal"]');assert.equal(attempts,2);
});

test('the collection editor reuses one isolated page and closes it on shutdown',async()=>{
 let forks=0,closed=0;const engine={close:async()=>{closed++;}};const editor=new CollectionEditor({fork:async()=>{forks++;return engine;}});const first=await editor.page();await editor.release(first,true);assert.equal(await editor.page(),first);assert.equal(forks,1);assert.equal(closed,0);await editor.close();assert.equal(closed,1);
});

test('a new selection cancels waiting for rows in the old playlist',async()=>{
 const p=new VkProvider({});let cancelled=false;await assert.rejects(p.readyRows({evaluate:async()=>{cancelled=true;return{loaded:true,rows:0,empty:false};}},'[data-testid="MusicPlaylistModal"]',()=>cancelled),/Выбран другой/);
});


test('an authoritative VK playback refusal invalidates every cached occurrence and survives export',async()=>{const player={current:null,play:async()=>{throw Object.assign(Error('Unavailable'),{kind:'unavailable'});}};const p=new VkProvider({}, {},{network:{},player});p.root='/audios123';p.online=true;p.setSession({state:'ready'});const route='https://vk.ru/audios123?section=all';for(const id of ['library:/audios123','list']){const entry=p.cache.create(id,id,id.startsWith('library:')?'library':'playlist');p.absorbRows({route,total:1,rows:[{key:'456_7',title:'Historical',artist:'Author',duration:120,time:'2:00',available:true,index:0}]},entry);entry.cacheState='complete';entry.route=route;}const ids=[...p.tracks.keys()];assert.equal(ids.length,2);await assert.rejects(p.play(ids[0]),e=>e.kind==='unavailable'&&e.unavailableIds.length===2);for(const t of p.tracks.values())assert.equal(t.available,false);for(const e of p.cache.entries.values())assert.equal([...e.items.values()][0].available,false);assert.equal(p.exportMetadata().collections[0].tracks[0].available,false);await p.cache.close();});

test('a transient CDN failure preserves availability of all cached tracks',async()=>{const p=new VkProvider({}, {},{network:{},player:{current:null,play:async()=>{throw Error('CDN timeout');}}});p.root='/audios123';p.setSession({state:'ready'});const e=p.cache.create('library:/audios123','Music','library');p.absorbRows({route:'https://vk.ru/audios123?section=all',total:1,rows:[{key:'456_7',title:'Song',artist:'Author',time:'2:00',duration:120,index:0,available:true}]},e);await assert.rejects(p.play([...p.tracks.keys()][0]),/timeout/);assert.equal([...e.items.values()][0].available,true);await p.cache.close();});
