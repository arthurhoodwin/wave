'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {parseMusicLink,canonicalLink,resolveMusicLink,linkedTrack,copyMusicLink}=require('../src/main/music-links.cjs');
const {VkProvider}=require('../src/main/provider.cjs');
const {historyData,historyRequest}=require('../src/main/search-history.cjs');
function fixture(){const p=new VkProvider({},{});p.root='/audios12';p.online=true;p.network={accountEpoch:1,playlistRefs:new Map(),rememberAudio(){},call:async()=>[{owner_id:-5,id:7,title:'Песня',artist:'Автор',duration:90,url:'https://private.invalid/audio?token=secret'}]};return p;}
test('music links normalize supported hosts, direct songs, albums, playlists and legacy z routes',()=>{
 for(const [url,kind,key] of [['https://vk.com/audio-5_7','track','-5_7'],['vk.ru/music/album/-5_7','album','-5_7'],['https://m.vk.ru/music/playlist/12_8','playlist','12_8'],['https://vk.com/audios12?section=all&z=audio_playlist-5_7_key','playlist','-5_7'],['https://vk.ru/audio?z=audio-5_7','track','-5_7']]){const r=parseMusicLink(url);assert.equal(r.kind,kind);assert.equal(r.key,key);assert(!canonicalLink(kind,r.key).includes('key'));}
});
test('foreign hosts, schemes, credentials, redirects, fragments and malformed identities cannot become a request',()=>{
 for(const bad of ['https://vk.ru.evil.test/audio1_2','http://vk.ru/audio1_2','https://x@vk.ru/audio1_2','https://vk.ru:999/audio1_2','javascript:alert(1)','https://vk.ru/away.php?to=audio1_2','https://vk.ru/audio1_2#x','https://vk.ru/audio0_2','https://vk.ru/audio1_0','https://vk.ru/audio9007199254740992_2','https://vk.ru/audio1_2?access_token=x','https://vk.ru/audio?z=audio1_2&z=audio2_3','https://vk.ru/music/playlist/1_2/../3_4','https://vk.ru\\@evil.test/audio1_2','https://vk.ru/audio1_2\nfoo'])assert.throws(()=>parseMusicLink(bad),undefined,bad);
});
test('link resolution returns opaque routes and retains access keys only in account-bound main memory',()=>{
 const p=fixture(),r=resolveMusicLink(p,'https://vk.ru/audio-5_7_private');assert.equal(r.route.type,'musicLink');assert(!JSON.stringify(r).includes('private'));assert.equal(p.musicLinkRefs.get(r.route.id).accessKey,'private');
 const list=resolveMusicLink(p,'https://vk.ru/music/album/-5_8_private');assert.equal(list.route.type,'album');assert.equal(p.playlists.get(list.route.id).vkId,'-5_8');assert.equal(p.network.playlistRefs.get('-5_8').accessKey,'private');assert(!JSON.stringify(list).includes('private'));
});
test('opening a song resolves exact identity without playback, exposing only public metadata',async()=>{
 const p=fixture(),id=resolveMusicLink(p,'https://vk.ru/audio-5_7').route.id;const r=await linkedTrack(p,id);assert.equal(r.tracks.length,1);assert.equal(r.title,'Песня');assert.equal(r.tracks[0].duration,90);assert(!JSON.stringify(r).includes('secret'));assert.equal(p.active,null);assert.equal(p.tracks.get(r.tracks[0].id).key,'-5_7');
});
test('unavailable songs and account changes fail without replacing the active collection with stale data',async()=>{
 const p=fixture(),id=resolveMusicLink(p,'https://vk.ru/audio-5_7').route.id;p.network.call=async()=>[];await assert.rejects(linkedTrack(p,id),/недоступна/);
 p.network.call=async()=>{p.root='/audios99';return[];};await assert.rejects(linkedTrack(p,id),/Аккаунт/);await assert.rejects(linkedTrack(p,id),/снова/);
});
test('a later navigation makes an in-flight linked track result inert',async()=>{
 const p=fixture(),id=resolveMusicLink(p,'https://vk.ru/audio-5_7').route.id;let finish;p.network.call=()=>new Promise(r=>finish=r);const job=linkedTrack(p,id);const other={items:new Map()};p.collection=other;finish([{owner_id:-5,id:7,title:'Late',duration:10}]);assert.equal((await job).canceled,true);assert.equal(p.tracks.size,0);assert.equal(p.collection,other);
});
test('copying uses opaque known handles and never publishes a stream or private access key',()=>{
 const p=fixture(),writes=[];p.tracks.set('known',{key:'-5_7',url:'secret'});p.playlists.set('album',{vkId:'-5_8_private',kind:'album'});
 copyMusicLink(p,{kind:'track',id:'known'},s=>writes.push(s));copyMusicLink(p,{kind:'album',id:'album'},s=>writes.push(s));assert.deepEqual(writes,['https://vk.ru/audio-5_7','https://vk.ru/music/album/-5_8']);assert.throws(()=>copyMusicLink(p,{kind:'track',id:'-5_7'},()=>{}));p.authTransition=true;assert.throws(()=>copyMusicLink(p,{kind:'album',id:'album'},()=>{}));
});
test('search history drops legacy links and rejects new URL-shaped entries before saving',async()=>{
 assert.deepEqual(historyData({accountRoot:'/audios12',queries:['Artist','https://vk.ru/audio1_2_private','vk.com/music/album/1_2']} ).queries,['Artist']);const writes=[],store={load:async()=>({accountRoot:'/audios12',queries:['Song','https://vk.ru/audio1_2_private']}),save:async(...args)=>writes.push(args)},p={root:'/audios12'};
 assert.deepEqual((await historyRequest(store,p,{action:'list'})).queries,['Song']);await assert.rejects(historyRequest(store,p,{action:'add',query:'https://vk.ru/audio1_2_private'}));assert.equal(writes.length,0);
});
