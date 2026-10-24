'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {VolumeWriter}=require('../src/renderer/volume-writer.js'),{NativePlayer}=require('../src/main/native-player.cjs');


test('dragging volume applies before release, collapses intermediate values and always sends the last one',async()=>{const sent=[],updates=[];let release;const writer=new VolumeWriter({interval:0,send:v=>{sent.push(v);return new Promise(r=>{release=()=>r({volume:v});});},onUpdate:(v,p)=>updates.push({v,p})});writer.set(.1);await new Promise(r=>setImmediate(r));assert.deepEqual(sent,[.1]);writer.set(.3);writer.set(.7);writer.set(.92);assert.equal(updates.at(-1).v,.92);release();await new Promise(r=>setImmediate(r));assert.deepEqual(sent,[.1,.92]);release();await writer.idle();assert.deepEqual(updates.at(-1),{v:.92,p:false});});

test('a stale media volume event cannot revert the latest user volume',async()=>{let player;player=new NativePlayer({api:{},proxy:{reset(){},close:async()=>{}},send:c=>{setImmediate(()=>player.accept({type:'state',generation:c.generation,requestId:c.id,playing:false,volume:c.volume,volumeRevision:c.volumeRevision}));return true;}});try{await player.volume(.8);player.accept({type:'state',generation:player.generation,playing:false,volume:.1,volumeRevision:0});assert.equal(player.state().volume,.8);await player.volume(.23);assert.equal(player.state().volume,.23);}finally{await player.close();}});
