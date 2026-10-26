'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {VkHttpClient,playlistKeyOf,playlistRow,audioRow,keyOf}=require('../src/main/vk-http.cjs');
const {readFeed,collectFeed}=require('../src/main/home-feed.cjs');
const {VkProvider}=require('../src/main/provider.cjs');
const fixture=require('./fixtures/vk-home-catalog.json');
const helpers={keyOf:playlistKeyOf,playlistRow,audioRow,rememberPlaylist(){},rememberAudio(){}};
test('the anonymized observed VK catalogue exposes generated playlists, editorial albums, genres and similar tracks without fake mix cards',async()=>{
 const result=await readFeed({accountEpoch:1,connect:async()=>{},call:async(method,params)=>method==='catalog.getAudio'?fixture.initial:method==='catalog.getSection'?fixture.overview:{block:{id:params.block_id,playlists_ids:[],audios_ids:[]}}},helpers);
 assert.equal(result.state,'ready');assert.equal(result.sections.find(s=>s.id==='for-you').items.length,8);
 assert(result.sections.some(s=>s.id==='genres'&&s.items.length));assert(result.sections.some(s=>s.id==='editorial'&&s.items.length));assert(result.sections.some(s=>s.id==='new-releases'&&s.items.some(p=>p.kind==='album')));
 assert(result.sections.some(s=>s.id==='similar'&&s.type==='tracks'&&s.items.length));
 assert(!result.sections.some(s=>s.title==='Мои треки'||/настроения/i.test(s.title)));
 for(const group of result.sections){const keys=group.items.map(i=>i.key||i.vkId);assert.equal(new Set(keys).size,keys.length);}
});
test('generated playlist IDs are accepted only as playlist identities and remain read-only',async()=>{
 const row={owner_id:12,id:-3,type:'generated',title:'Generated',permissions:{edit:true}};
 assert.equal(keyOf(row),null);assert.equal(playlistKeyOf(row),'12_-3');assert.equal(playlistKeyOf({...row,type:'ugc'}),null);assert.equal(playlistRow(row).editable,false);
 const api=new VkHttpClient({fetch:async()=>{throw Error('No live network');}});api.connect=async()=>{};const calls=[];
 api.call=async(method,params)=>{calls.push([method,params]);return method==='audio.getPlaylistById'?row:{count:1,items:[{owner_id:4,id:5,title:'Song',artist:'Artist',duration:60}]};};
 const result=await api.playlist('12_-3');assert.equal(result.rows.length,1);assert.equal(calls[1][1].album_id,-3);assert.equal(result.generated,true);assert.throws(()=>api.parseIdentity('12_-3'));api.close();
});
test('a suspicious album title is resolved once per album and a late partial record cannot replace the full metadata',async()=>{
 const api=new VkHttpClient({fetch:async()=>{throw Error('No live network');}});api.connect=async()=>{};let calls=0,finish;
 api.rememberAudio([{owner_id:1,id:1,album:{owner_id:-2,id:9,title:'unnamed'}},{owner_id:1,id:2,album:{owner_id:-2,id:9,title:'unnamed'}}]);
 api.call=async method=>{assert.equal(method,'audio.getPlaylistById');calls++;return new Promise(r=>finish=r);};
 const a=api.albumForTrack('1_1'),b=api.albumForTrack('1_2');await new Promise(r=>setImmediate(r));assert.equal(calls,1);finish({owner_id:-2,id:9,title:'damage',type:'album'});
 assert.equal((await a).title,'damage');assert.equal((await b).albumTitleConfirmed,true);
 api.rememberPlaylist([{owner_id:-2,id:9,title:'unnamed'}]);api.rememberAudio([{owner_id:1,id:1,album:{owner_id:-2,id:9,title:'unnamed'}}]);assert.equal((await api.albumForTrack('1_1')).title,'damage');assert.equal(calls,1);api.close();
});
test('a verified real album called unnamed is retained, and a mismatched album response is rejected',async()=>{
 const api=new VkHttpClient({fetch:async()=>{}});api.connect=async()=>{};api.rememberAudio([{owner_id:1,id:1,album:{owner_id:-2,id:9,title:'unnamed'}}]);api.call=async()=>({owner_id:-2,id:9,title:'unnamed',type:'album'});const result=await api.albumForTrack('1_1');assert.equal(result.title,'unnamed');assert.equal(result.albumTitleConfirmed,true);
 api.rememberAudio([{owner_id:1,id:2,album:{owner_id:-2,id:10,title:'unnamed'}}]);await assert.rejects(api.albumForTrack('1_2'),e=>e.kind==='protocol');api.close();
});
test('album metadata repairs cached public occurrences and current playback without restarting it',async()=>{
 const p=new VkProvider({}, {},{network:{albumForTrack:async()=>({vkId:'-2_9',title:'damage',albumTitleConfirmed:true})}});p.root='/audios1';p.online=true;
 p.tracks.set('song',{id:'song',key:'1_1',title:'madam',albumTitle:'unnamed'});const entry=p.cache.create('one','One');entry.items.set('song',{id:'song',albumTitle:'unnamed'});p.active={id:'song',key:'1_1',albumTitle:'unnamed'};
 const result=await p.trackAlbum('song');assert.equal(p.active.albumTitle,'damage');assert.equal(entry.items.get('song').albumTitle,'damage');assert.equal(entry.items.get('song').albumId,result.id);assert.equal(p.tracks.get('song').albumTitleConfirmed,true);await p.cache.close();
});
test('feed failures preserve successful real sections and missing references remain partial',()=>{
 const section={title:'Собрано алгоритмами',blocks:[{data_type:'music_playlists',playlists_ids:['12_-3','12_-4']}]};
 const result=collectFeed({playlists:[{owner_id:12,id:-3,type:'generated',title:'Actual'}],catalog:{sections:[section]}},helpers);assert.equal(result[0].items.length,1);assert.equal(result[0].partial,true);
});
