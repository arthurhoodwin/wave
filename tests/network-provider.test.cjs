'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {VkProvider}=require('../src/main/provider.cjs');
const row=i=>({key:'123_'+i,title:'Song '+i,artist:'Artist',time:'1:00',duration:60,available:true,index:i-1});
function setup(network){const noBrowser=new Proxy({}, {get:()=>()=>{throw Error('Browser must not be used');}});const p=new VkProvider(noBrowser,noBrowser,{network});p.root='/audios123';p.setSession({state:'ready'});return p;}
test('network collections expose the first page and exact count while the full list continues without a browser',async()=>{
 let release;const rest=new Promise(r=>{release=r;});const rows=Array.from({length:1205},(_,i)=>row(i+1));const p=setup({accountId:123,playlists:async()=>[],library:async({onPage})=>{onPage(rows.slice(0,1000),1205);await rest;onPage(rows.slice(1000),1205);return{rows,total:1205,route:'https://vk.ru/audios123?section=all'};}});
 try{const first=await p.library();assert.equal(first.total,1205);assert.equal(first.tracks.length,1000);assert.equal(first.partial,true);const entry=p.cache.entries.get(first.cacheId);release();await entry.networkJob;const full=p.cache.read(first.cacheId);assert.equal(full.tracks.length,1205);assert.equal(full.cacheState,'complete');assert.equal(new Set(full.tracks.map(t=>t.id)).size,1205);}finally{release();await p.cache.close();}
});
test('a slow old search never replaces the active search context',async()=>{
 let release;const delay=new Promise(r=>{release=r;});const p=setup({search:async q=>{if(q==='old')await delay;return{rows:[row(q==='old'?1:2)],total:1,partial:false};}});
 const old=p.search('old');await p.search('new');release();await old;assert.equal(p.collection.query,'new');assert.equal([...p.collection.items.values()][0].title,'Song 2');await p.cache.close();
});
test('a complete server playlist list prunes deleted playlists',async()=>{
 const p=setup({accountId:123,playlists:async()=>[{vkId:'123_1',title:'Keep',editable:true,index:0}],library:async({onPage})=>{onPage([],0);return{rows:[],total:0,route:'https://vk.ru/audios123?section=all'};}});
 p.absorbPlaylists([{vkId:'123_1',title:'Keep'},{vkId:'123_2',title:'Deleted'}],'https://vk.ru/audios123');await p.library(true);assert.deepEqual(p.savedPlaylists.map(p=>p.title),['Keep']);await p.cache.close();
});
test('offline reconnect restores the verified session automatically without browser interaction',async()=>{
 let calls=0;const network={accountId:123,connect:async()=>{calls++;return{userId:123};}};const p=setup(network);
 try{p.transportState({kind:'offline'});assert.equal(p.online,false);assert.equal((await p.status()).reason,'offline');await new Promise(r=>setTimeout(r,3100));assert.equal(calls,1);assert.equal(p.online,true);assert.equal((await p.status()).state,'ready');}finally{p.closing=true;clearTimeout(p.reconnectTimer);await p.cache.close();}
});
test('expired authorization stops playback and waits for explicit login instead of reconnecting endlessly',async()=>{
 const p=setup({accountId:123});let stopped=0;p.nativePlayer={stop:async()=>{stopped++;}};p.transportState({kind:'auth'});assert.equal(stopped,1);assert.equal(p.online,false);assert.equal((await p.status()).reason,'auth');assert.equal(p.reconnectTimer,undefined);await p.cache.close();
});
