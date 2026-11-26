'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createFixture, root, track, wav} = require('./helpers/downloads.cjs');
const {StorageMaintenance, checksum, audioPath} = require('../src/main/downloads/storage-maintenance.cjs');
const {OfflineLyrics} = require('../src/main/lyrics/offline-lyrics.cjs');
const {ArtworkContentCache} = require('../src/main/artwork-content-cache.cjs');
const {createHash} = require('node:crypto');

async function setup(t, fetch) {
  const f = await createFixture(fetch);
  t.after(() => f.close());
  await f.manager.add(root,[track]);
  await f.wait();
  const account = await f.library.account(root);
  const [record] = account.data.downloads;
  assert(record);
  const target = path.join(f.directory,'destination');
  await fs.mkdir(target);
  return {f,account,record,target,storage:new StorageMaintenance(f.manager)};
}

test('moving offline audio moves its text and metadata and survives restart', async t => {
  const {f,record,target,storage} = await setup(t);
  const lyrics = new OfflineLyrics({library:f.library,getRoot:()=>root});
  await lyrics.save(root,record.track,{text:'Text',source:'VK'});
  const old = audioPath(record),original = await fs.readFile(old);
  assert.deepEqual(await storage.move(root,target),{moved:1,retained:0});
  await assert.rejects(fs.stat(old),{code:'ENOENT'});
  await f.restart();
  const current = await f.manager.locate(root,track.key);
  assert.deepEqual(await fs.readFile(current.file),original);
  assert.equal(path.dirname(path.dirname(current.file)),await fs.realpath(target));
  const reopened = new OfflineLyrics({library:f.library,getRoot:()=>root});
  assert.equal((await reopened.read(root,track)).result.text,'Text');
});

test('cancel and failed index commit leave the original playable', async t => {
  const {f,account,record,target,storage} = await setup(t);
  const old = audioPath(record);
  const progress = storage.progress.bind(storage);
  storage.progress = (...args) => {
    progress(...args);
    if(args[0]==='copying'&&args[1]>0)storage.cancel();
  };
  assert.deepEqual(await storage.move(root,target),{cancelled:true});
  assert.equal(audioPath(record),old);
  storage.progress = progress;
  const save = f.library.save.bind(f.library);
  f.library.save = async () => {throw Error('Index failure');};
  await assert.rejects(storage.move(root,target),/Index failure/);
  f.library.save = save;
  assert.equal(account.data.directory,null);
  assert.equal((await f.manager.locate(root,track.key)).file,old);
  for(const dir of await fs.readdir(target))assert.deepEqual(await fs.readdir(path.join(target,dir)),[]);
});

test('a corrupt file is reported and replacement preserves the saved text', async t => {
  const {f,account,record,storage} = await setup(t);
  const lyrics = new OfflineLyrics({library:f.library,getRoot:()=>root});
  f.manager.offlineLyrics = lyrics;
  await lyrics.save(root,track,{text:'Text',source:'VK'});
  await fs.writeFile(audioPath(record),Buffer.alloc(record.bytes));
  const result = await storage.inspect(root);
  assert.deepEqual(result.issues.map(issue=>issue.id),[record.id]);
  const queued = await f.manager.add(root,[record.track],{replaceId:record.id});
  assert.equal(queued.added,1);
  await f.wait();
  assert.equal(account.data.downloads.length,1);
  assert.notEqual(account.data.downloads[0].id,record.id);
  assert.equal((await lyrics.read(root,track)).result.text,'Text');
  assert.deepEqual((await storage.inspect(root)).issues,[]);
});

test('adding tags to an older MP3 preserves its audio payload and index', async t => {
  const mp3 = wav();
  mp3.set([0xff,0xfb,0x90,0],0);
  const {f,record,storage} = await setup(t,async()=>new Response(mp3));
  // Simulate a pre-tagging local copy.
  const original = audioPath(record);
  await fs.writeFile(original,mp3);
  record.bytes=mp3.length;
  record.sha256=await checksum(original);
  delete record.tagged;
  assert.equal((await storage.tag(root)).tagged,1);
  await f.restart();
  const current=await f.manager.locate(root,track.key);
  assert(current.record.tagged);
  const bytes=await fs.readFile(current.file);
  assert.equal(bytes.subarray(0,3).toString(),'ID3');
  assert.deepEqual(bytes.subarray(-mp3.length),mp3);
});

test('cache cleanup removes only this account’s cache files', async t => {
  const {f} = await setup(t);
  const folder = path.join(f.directory,'cache');
  const userFolder = account=>path.join(folder,createHash('sha256').update(account).digest('hex'));
  const cache = new ArtworkContentCache({directory:folder,fetch:async()=>{throw Error('unexpected');}});
  for(const account of [root,'/audios55']){
    const dir=userFolder(account);
    await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,'a'.repeat(64)+'.image'),'cover');
    await fs.writeFile(path.join(dir,'a'.repeat(64)+'.json'),'meta');
    await fs.writeFile(path.join(dir,'unrelated.json'),'retain');
  }
  assert.equal((await cache.diskUsage(root)).bytes,9);
  assert.equal((await cache.diskUsage(root,{clean:true})).freed,9);
  assert.deepEqual(await fs.readdir(userFolder(root)),['unrelated.json']);
  assert.equal((await cache.diskUsage('/audios55')).bytes,9);
  assert(await f.manager.locate(root,track.key));
});
