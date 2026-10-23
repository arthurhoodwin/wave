const test=require('node:test'),assert=require('node:assert/strict');
const {cover,artistRoute,trackMeta}=require('./navigation-meta.cjs');
const {VkProvider}=require('./provider.cjs');
test('navigation metadata accepts only VK image hosts and artist routes',()=>{
 assert(cover('https://sun1-22.vkuserphoto.ru/impg/cover.jpg?size=68x68'));
 for(const bad of ['http://sun1.vkuserphoto.ru/a','https://vkuserphoto.ru.evil.test/a','https://user:pass@sun1.vkuserphoto.ru/a','javascript:alert(1)','https://evil.test/a'])assert.equal(cover(bad),undefined);
 assert.equal(artistRoute('/artist/123'),'https://vk.ru/artist/123');assert(artistRoute('/audio?performer=1&q=Автор'));
 for(const bad of ['/audio?performer=1&q=a&access_token=secret','https://evil.test/artist/123','/feed','/artist/123#x'])assert.equal(artistRoute(bad),undefined);
 assert.deepEqual(trackMeta({url:'stream',cookie:'x'}),{cover:undefined,artistRoute:undefined});
});
test('artist uses a known track handle, registers album handles and retains the playback engine',async()=>{
 const p=new VkProvider({},{});p.tracks.set('t',{artist:'Автор',artistRoute:'https://vk.ru/artist/123'});let navigated;
 p.route=async url=>{navigated=url;};p.readyRows=async()=>{};p.readRows=async()=>({tracks:[{id:'song'}],partial:true});p.engine.evaluate=async()=>({title:'Автор',albums:[{title:'Альбом',owner:'Автор',index:0,cover:'https://sun1.vkuserphoto.ru/a.jpg'}]});p.preparePlayback=()=>{};
 const r=await p.artist('t');assert.equal(navigated,'https://vk.ru/artist/123');assert.equal(r.albums.length,1);const a=p.playlists.get(r.albums[0].id);assert.equal(a.kind,'album');assert.equal(a.route,navigated);
 await assert.rejects(p.artist('unknown'),/устарел/);p.session={state:'cached'};await assert.rejects(p.artist('t'),/Подключитесь/);
});
test('album metadata survives disk normalization and restore without entering the playlist sidebar',async()=>{
 const {normalizePayload}=require('./metadata-store.cjs');const route='https://vk.ru/artist/123?z=audio_playlist-200_456_key';const image='https://sun1.vkuserphoto.ru/cover.jpg';
 const payload={version:1,accountRoot:'/audios123',savedAt:Date.now(),playlists:[{id:'album',title:'Album',owner:'Artist',index:0,route:'https://vk.ru/artist/123',kind:'album',cover:image}],collections:[{playlistId:'album',kind:'playlist',title:'Album',route,total:1,tracks:[{id:'song',key:'-200_1',title:'Song',artist:'Artist',time:'3:00',duration:180,available:true,index:0,scope:'[data-testid="MusicPlaylistModal"]',route,cover:image,artistRoute:'https://vk.ru/artist/123',url:'stream'}]}]};
 const saved=normalizePayload(payload);assert(saved);assert(!JSON.stringify(saved).includes('stream'));const p=new VkProvider({}, {},{store:{load:async()=>saved}});await p.restore();assert.equal(p.savedPlaylists.length,0);const album=await p.playlist('album');assert.equal(album.cover,image);assert.equal(album.tracks[0].cover,image);assert.equal(album.tracks[0].artistRoute,'https://vk.ru/artist/123');assert.equal(p.playlistHandles.get(JSON.stringify(['album','https://vk.ru/artist/123','Album','Artist'])),'album');
});
