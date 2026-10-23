'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {MetadataStore,normalizePayload}=require('../src/main/metadata-store.cjs');
const route='https://vk.ru/audios123?section=all';
function payload(){
 const track={id:'track-1',key:'-123_456',title:'Песня 🌊',artist:'Исполнитель',time:'0:00',duration:0,available:true,index:0,scope:'body',route};
 return {version:1,accountRoot:'/audios123',savedAt:Date.now(),playlists:[{id:'p',title:'Избранное',owner:'Я',index:0,route}],collections:[{playlistId:'library:/audios123',kind:'library',title:'Моя музыка',route,total:2,tracks:[track,{...track,id:'track-2',index:1}]}]};
}
const encrypt=bytes=>Buffer.from(bytes.map(x=>x^0xa5));
const decrypt=encrypt;
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wave-metadata-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return {directory,store:new MetadataStore({directory,encrypt,decrypt})};}
test('normalizer preserves Unicode, order and duplicates and disables zero-duration tracks',()=>{
 const p=normalizePayload(payload());assert.equal(p.collections[0].tracks.length,2);assert.equal(p.collections[0].tracks[0].title,'Песня 🌊');assert.equal(p.collections[0].tracks[1].index,1);assert(p.collections[0].tracks.every(t=>!t.available));
});
test('only whitelisted metadata survives normalization',()=>{
 const p=payload();p.token='secret';p.playlists[0].cookies=['secret'];p.collections[0].tracks[0].url='https://stream.example/secret';p.collections[0].tracks[0].access_token='secret';
 const result=JSON.stringify(normalizePayload(p));assert(!result.includes('secret'));assert(!result.includes('cookies'));assert(!result.includes('access_token'));
});
test('rejects foreign origins, credentials, tokens and invalid account roots',()=>{
 for(const bad of ['https://evil.test/audio','https://vk.ru.evil.test/audio','https://user:pass@vk.ru/audio','https://vk.ru/audio?access_token=secret','https://vk.ru/audio#secret']){const p=payload();p.collections[0].route=bad;assert.equal(normalizePayload(p),null,bad);}
 for(const bad of ['/audios123?token=secret','/audios-123',null]){const p=payload();p.accountRoot=bad;assert.equal(normalizePayload(p),null);}
 for(const suffix of ['', '/abc123', '_abc123']){const p=payload();p.playlists[0].route='https://vk.ru/audios123?section=all&z='+encodeURIComponent('audio_playlist-123_456'+suffix);assert(normalizePayload(p));}
});
test('partial collections are omitted while playlist metadata survives',()=>{
 const p=payload();p.collections[0].total=1000;const result=normalizePayload(p);assert.deepEqual(result.collections,[]);assert.equal(result.playlists.length,1);
});
test('encrypted disk roundtrip without plaintext metadata',async t=>{
 const {store}=await fixture(t);const p=payload();assert.equal(await store.save(p),true);const bytes=await fs.readFile(store.file);assert(!bytes.includes(Buffer.from('Песня')));assert(bytes.subarray(0,10).equals(Buffer.from('WAVEMETA1\n')));assert.deepEqual(await store.load(),normalizePayload(p));await store.close();assert.equal(await store.save(p),false);
});
test('corruption and decryption failure return null',async t=>{
 const {store,directory}=await fixture(t);assert.equal(await store.load(),null);await fs.writeFile(store.file,'broken');assert.equal(await store.load(),null);await store.save(payload());const bad=new MetadataStore({directory,encrypt,decrypt:()=>{throw Error('locked');}});assert.equal(await bad.load(),null);await fs.writeFile(store.file,Buffer.concat([Buffer.from('WAVEMETA1\n'),encrypt(Buffer.from('{bad'))]));assert.equal(await store.load(),null);
});
test('failed serialization or encryption preserves the prior complete file',async t=>{
 const {store}=await fixture(t);const p=payload();await store.save(p);const prior=await fs.readFile(store.file);const bad=payload();bad.collections[0].tracks[0].duration=NaN;assert.equal(await store.save(bad),false);store.encrypt=()=>{throw Error('encryption unavailable');};assert.equal(await store.save(p),false);assert.deepEqual(await fs.readFile(store.file),prior);
});
test('write failure preserves previous file and cleans temporary file',async t=>{
 const {store,directory}=await fixture(t);await store.save(payload());const prior=await fs.readFile(store.file);const open=fs.open;fs.open=async()=>{throw Error('disk full');};try{assert.equal(await store.save(payload()),false);}finally{fs.open=open;}assert.deepEqual(await fs.readFile(store.file),prior);assert.deepEqual(await fs.readdir(directory),['cache.dat']);
});
test('queued writes preserve invocation order and snapshot mutable payloads',async t=>{
 const {directory}=await fixture(t);let first=true;const store=new MetadataStore({directory,decrypt,encrypt:async bytes=>{if(first){first=false;await new Promise(r=>setTimeout(r,20));}return encrypt(bytes);}});
 const p=payload();const one=store.save(p);p.savedAt=123;const two=store.save(p);p.savedAt=999;await store.close();assert.deepEqual(await Promise.all([one,two]),[true,true]);assert.equal((await store.load()).savedAt,123);
});
