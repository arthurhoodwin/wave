'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {createFixture:fixture,track,root,wav}=require('./helpers/downloads.cjs');

test('offline artwork is readable without the network and revoked after account switch',async()=>{const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(50)]),f=await fixture(async u=>new Response(u.includes('userapi.com')?png:wav()));try{await f.manager.add(root,[{...track,cover:'https://sun.userapi.com/cover.png'}]);await f.wait();const {record}=await f.manager.locate(root,track.key);assert.equal(record.artwork.ext,'png');await f.manager.artwork.start();const art=f.manager.artwork.url(root,record);assert.deepEqual(Buffer.from(await(await fetch(art)).arrayBuffer()),png);f.manager.artwork.getRoot=()=>'/audios13';assert.equal((await fetch(art)).status,404);await f.manager.remove(root,record.id);assert.deepEqual(await fs.readdir(record.folder),[]);}finally{await f.close();}});
