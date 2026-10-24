'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {PersonalLibrary} = require('../../src/main/personal-library.cjs');
const {DownloadManager} = require('../../src/main/download-manager.cjs');
const root = '/audios12';
const url = 'https://cs1.vkuseraudio.ru/audio';
const track = {key:'12_34', title:'Song', artist:'Artist', duration:6, available:true};
function wav(value=7) {
  const bytes=Buffer.alloc(4096,value);
  bytes.write('RIFF'); bytes.writeUInt32LE(4088,4); bytes.write('WAVE',8);
  return bytes;
}
// Structurally valid ADTS frames for transport tests, not a decoder fixture.
function adts(value=3) {
  const bytes=Buffer.alloc(100,value); bytes.set([255,241,80,128,12,159,252]); return bytes;
}
const {waitUntil}=require('./async.cjs');
const waitForIdle=manager=>waitUntil(()=>!manager.running,'download worker to finish');
async function createFixture(fetcher) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wave-tests-'));
  const options={directory:path.join(directory,'index'),encrypt:s=>Buffer.from(s),decrypt:b=>b.toString()};
  let library=new PersonalLibrary(options),accountRoot=root;
  const make=()=>new DownloadManager({library,getRoot:()=>accountRoot,defaultDirectory:path.join(directory,'files'),resolve:async()=>({format:'audio',url}),fetch:fetcher|| (async()=>new Response(wav(),{headers:{'content-length':'4096'}}))});
  let manager=make();
  return {
    directory, options, get library(){return library;}, get manager(){return manager;},
    setRoot:value=>accountRoot=value, wait:()=>waitForIdle(manager),
    async restart() {await manager.close();await library.close();library=new PersonalLibrary(options);manager=make();await manager.restore(accountRoot);},
    async close() {
      try {await manager.close();} finally {
        try {await library.close();} finally {
          const target=path.resolve(directory);
          assert.equal(path.dirname(target),path.resolve(os.tmpdir()));
          assert(path.basename(target).startsWith('wave-tests-'));
          await fs.rm(target,{recursive:true,force:true});
        }
      }
    }
  };
}
module.exports={createFixture,waitUntil,waitForIdle,track,root,url,wav,adts};
