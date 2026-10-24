'use strict';
const test=require('node:test'),assert=require('node:assert/strict');const {VkProvider}=require('../src/main/provider.cjs');const {normalizePayload}=require('../src/main/metadata-store.cjs');
function fixture(){const route='https://vk.ru/audios123?section=all';return{version:1,accountRoot:'/audios123',savedAt:Date.now(),playlists:[{id:'list',title:'Плейлист',owner:'User',index:0,route}],collections:[{playlistId:'library:/audios123',kind:'library',title:'Моя музыка',route,total:1,tracks:[{id:'song',key:'123_1',title:'Песня',artist:'Автор',time:'3:00',duration:180,available:true,index:0,scope:'[data-testid="AudioCatalog_SectionTracks"]',route}]}]};}
test('restored library returns immediately without network and cannot play before verification',async()=>{
 let calls=0;const engine={evaluate:async()=>{calls++;throw Error('offline')}};const p=new VkProvider(engine,engine,{store:{load:async()=>fixture()}});await p.restore();assert.equal((await p.status()).state,'cached');const r=await p.library();assert.equal(r.tracks.length,1);assert.equal(r.total,1);assert.equal(r.stale,true);assert.equal(calls,0);await assert.rejects(p.play('song'),/Подключитесь/);assert.equal(calls,0);
});
test('network failure retains saved lists and does not pretend the account is verified',async()=>{
 const p=new VkProvider({}, {},{store:{load:async()=>fixture()}});await p.restore();await p.startSession(Promise.reject(Error('network')));assert.equal((await p.status()).state,'cached');assert.equal(p.online,false);assert.equal((await p.library()).tracks[0].id,'song');
});
test('verified account change invalidates all prior handles and cache entries',async()=>{
 const states=[];const engine={evaluate:async()=>({ready:true,root:'/audios456'})};const p=new VkProvider(engine,engine,{store:{load:async()=>fixture()},onSession:s=>states.push(s)});await p.restore();await p.checkSession();assert.equal(p.root,'/audios456');assert.equal(p.tracks.size,0);assert.equal(p.savedPlaylists.length,0);assert.equal(p.cache.entries.size,0);assert(states.some(s=>s.accountChanged));assert.equal((await p.status()).state,'ready');await assert.rejects(p.play('song'),/устарел/);
});
test('revalidation replaces the old complete list atomically and failure preserves it',async()=>{
 const p=new VkProvider({});const old=p.cache.create('list','Saved');old.total=2;old.cacheState='complete';old.items.set('a',{id:'a'});old.items.set('b',{id:'b'});old.refreshing=true;old.stale=true;
 const update=p.cache.create('list','Saved');p.cache.byPlaylist.set('list',old);update.refreshTarget=old;update.total=1;update.items.set('c',{id:'c'});assert.deepEqual(p.cache.snapshot(old).tracks.map(t=>t.id),['a','b']);p.cache.finish(update,true);assert.deepEqual(p.cache.snapshot(old).tracks.map(t=>t.id),['c']);assert.equal(old.refreshing,false);
 const fail=p.cache.create('list','Saved');p.cache.byPlaylist.set('list',old);fail.refreshTarget=old;old.refreshing=true;p.cache.finish(fail,false);assert.deepEqual(p.cache.snapshot(old).tracks.map(t=>t.id),['c']);assert.equal(old.refreshError,true);assert.equal(old.cacheState,'complete');
});
test('restored handles remain stable across refresh and export strips player URLs',async()=>{
 const p=new VkProvider({}, {},{store:{load:async()=>fixture()}});await p.restore();const e=p.cache.create('library:/audios123','Моя музыка','library');p.absorbRows({route:fixture().collections[0].route,total:1,rows:[{key:'123_1',title:'Песня',artist:'Автор',time:'3:00',index:0,available:true,url:'secret-stream'}]},e);e.route=fixture().collections[0].route;e.cacheState='complete';assert.equal([...e.items.keys()][0],'song');const result=p.exportMetadata();assert(!JSON.stringify(result).includes('secret-stream'));assert(normalizePayload(result));
});


test('unchanged cache polls skip arrays; metadata changes invalidate the version',()=>{const p=new VkProvider({},{}),e=p.cache.create('library:/audios123','Library','library');e.items.set('id',{id:'id',title:'A',duration:60,available:true});e.total=1;e.cacheState='complete';const first=p.playlistCache(e.id);assert.equal(first.tracks.length,1);assert.deepEqual(p.playlistCache({id:e.id,version:first.version}),{unchanged:true,version:first.version});e.items.get('id').available=false;p.metadataRevision=1;const changed=p.playlistCache({id:e.id,version:first.version});assert.equal(changed.tracks[0].available,false);assert.notEqual(changed.version,first.version);});

test('conditional navigation adopts its collection while background polling does not',()=>{const p=new VkProvider({},{}),a=p.cache.create('a','A'),b=p.cache.create('b','B');a.cacheState=b.cacheState='complete';p.collection=b;const first=p.playlistCache(a.id);assert.equal(p.collection,b);const result=p.playlistCache({id:a.id,version:first.version,activate:true});assert.equal(result.unchanged,true);assert.equal(p.collection,a);p.playlistCache(b.id);assert.equal(p.collection,a);});
