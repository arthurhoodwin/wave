'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {writeTags}=require('../src/main/downloads/mp3-tags.cjs'),{frameDuration}=require('../src/main/downloads/audio-duration.cjs');
const size=b=>b[0]*2097152+b[1]*16384+b[2]*128+b[3];
test('ID3v2.4 writes Cyrillic text and artwork while preserving every MPEG frame and exact duration',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'wave-tags-'));try{const file=path.join(folder,'fixture.mp3'),frame=Buffer.alloc(417);frame.set([255,251,144,0]);const audio=Buffer.concat(Array.from({length:100},()=>frame));await fs.writeFile(file,audio);const before=await frameDuration(file,'mp3'),picture=path.join(folder,'cover.jpg');await fs.writeFile(picture,Buffer.from([255,216,255,1,2,3]));
 const track={title:'Ночной город',artist:'Пример',albumTitle:'Альбом'};await writeTags(file,track,{artwork:{ext:'jpg',file:picture}});const first=await fs.readFile(file),offset=10+size(first.subarray(6,10));assert(first.subarray(offset).equals(audio));assert(first.includes(Buffer.from(track.title)));assert(first.includes(Buffer.from('APIC')));assert.equal(await frameDuration(file,'mp3'),before);
 await writeTags(file,{...track,title:'Другая песня'});const second=await fs.readFile(file);assert(second.subarray(10+size(second.subarray(6,10))).equals(audio));assert(!second.includes(Buffer.from(track.title)));
 }finally{assert.equal(path.dirname(folder),os.tmpdir());await fs.rm(folder,{recursive:true,force:true});}
});
test('failed quota reservation leaves the original MP3 untouched',async()=>{const folder=await fs.mkdtemp(path.join(os.tmpdir(),'wave-tags-'));try{const file=path.join(folder,'fixture.mp3'),bytes=Buffer.alloc(417);bytes.set([255,251,144,0]);await fs.writeFile(file,bytes);await assert.rejects(writeTags(file,{title:'Name'},{beforeWrite:()=>{throw Error('quota');}}),/quota/);assert((await fs.readFile(file)).equals(bytes));assert.equal((await fs.readdir(folder)).length,1);}finally{await fs.rm(folder,{recursive:true,force:true});}});
