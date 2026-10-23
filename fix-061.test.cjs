const test=require('node:test'),assert=require('node:assert/strict');const {VkProvider}=require('./provider.cjs');const {CollectionEditor}=require('./collection-editor.cjs');const {normalizePayload}=require('./metadata-store.cjs');
const route='https://vk.ru/audios123?section=all&z=audio_playlist123_2';
test('a partial or stale carousel cannot remove a confirmed new playlist or revert its name',()=>{
 const p=new VkProvider({});p.root='/audios123';p.absorbPlaylists([{vkId:'123_1',title:'Old',owner:'User',index:0,editable:true}],'https://vk.ru/audios123?section=all');
 const r=p.applyCollectionMutation({action:'create'},{vkId:'123_2',title:'New',owner:'User',rows:[],route,playlists:[]},{});const id=r.playlistId;assert(p.savedPlaylists.some(x=>x.id===id));
 p.absorbPlaylists([{vkId:'123_1',title:'Old',owner:'User',index:0,editable:true}],'https://vk.ru/audios123?section=all',{revision:0});assert(p.savedPlaylists.some(x=>x.id===id));
 p.applyCollectionMutation({action:'rename',playlistId:id},{vkId:'123_2',title:'Renamed',rows:[],route},{});p.absorbPlaylists([{vkId:'123_2',title:'New',owner:'User',index:0,editable:true}],'https://vk.ru/audios123?section=all',{revision:0});assert.equal(p.playlists.get(id).title,'Renamed');
 p.absorbPlaylists([],'https://vk.ru/audios123?section=all');assert(p.savedPlaylists.some(x=>x.id===id));const payload=normalizePayload(p.exportMetadata());assert(payload);assert(payload.playlists.some(x=>x.id===id&&x.title==='Renamed'));
});
test('editing a warmed empty playlist reloads it only on the next explicit play',async()=>{
 let navigations=0;const engine={evaluate:async()=>route,navigate:async()=>{navigations++;}};const p=new VkProvider(engine,engine);p.root='/audios123';p.playbackDocument={key:p.playbackKey(route),revision:0};p.readyRows=async()=>{};
 const id=p.applyCollectionMutation({action:'create'},{vkId:'123_2',title:'New',owner:'User',rows:[],route},{}).playlistId;
 p.applyCollectionMutation({action:'add',playlistId:id},{vkId:'123_2',title:'New',rows:[{key:'123_5',title:'Song',artist:'Artist',time:'2:00',index:0,available:true}],route},{});assert.equal(navigations,0);
 const track=[...p.cache.byPlaylist.get(id).items.values()][0];p.rawPlayer=async()=>({key:'123_5',title:'Song',playing:true,duration:120});const played=await p.play(track.id);assert.equal(played.playing,true);assert.equal(navigations,1);
 await p.play(track.id);assert.equal(navigations,1);assert.equal(p.playbackKey(route+'&x=ignored'),p.playbackKey('https://vk.ru/music/playlist/123_2_hash'));
});
test('playback readiness waits for the selected list instead of background library rows',async()=>{
 const p=new VkProvider({});let attempts=0;const engine={evaluate:async script=>{assert(script.includes('document.querySelector("[data-testid=\\"MusicPlaylistModal\\"]")'));attempts++;return{loaded:true,rows:attempts===1?0:1,empty:false};}};await p.readyRows(engine,'[data-testid="MusicPlaylistModal"]');assert.equal(attempts,2);
});
test('the collection editor reuses one isolated page and closes it on shutdown',async()=>{
 let forks=0,closed=0;const engine={close:async()=>{closed++;}};const editor=new CollectionEditor({fork:async()=>{forks++;return engine;}});const first=await editor.page();await editor.release(first,true);assert.equal(await editor.page(),first);assert.equal(forks,1);assert.equal(closed,0);await editor.close();assert.equal(closed,1);
});
test('a new selection cancels waiting for rows in the old playlist',async()=>{
 const p=new VkProvider({});let cancelled=false;await assert.rejects(p.readyRows({evaluate:async()=>{cancelled=true;return{loaded:true,rows:0,empty:false};}},'[data-testid="MusicPlaylistModal"]',()=>cancelled),/Выбран другой/);
});
