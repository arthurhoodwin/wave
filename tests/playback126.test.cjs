'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path');
const {bounds,relative,shortcut,MiniIsland}=require('../src/main/mini-island.cjs');
const {shuffleScope}=require('../src/main/shuffle-scope.cjs');
const {cycle}=require('../src/renderer/shuffle-memory.js');
const {KaraokePrototype}=require('../src/main/karaoke-prototype.cjs');
const {inspectWav,instrumental}=require('../src/main/karaoke-worker.cjs');

test('shuffle persists stable keys through a playlist refresh and scopes to the account',()=>{
 const provider={root:'/audios1',playlists:new Map([['old',{vkId:'-9_14'}],['new',{vkId:'-9_14'}]]),
  tracks:new Map([['a',{key:'7_1'}],['b',{key:'7_2'}],['alias',{key:'7_1'}],['c',{key:'7_3'}]])};
 const get=(id,ids,type='playlist')=>shuffleScope(provider,{type,id,filter:'',sort:'original',ids});
 const first=get('old',['a','a','b']),updated=get('new',['alias','b','c','a']);
 assert.equal(first.scope,updated.scope);
 assert.deepEqual(first.keys,[updated.keys[0],updated.keys[3],updated.keys[1]]);
 assert.notEqual(first.keys[0],first.keys[1]);
 assert.equal(get('old',['a'],'mix'),null);
 provider.root='/audios2';assert.notEqual(get('new',['a']).scope,first.scope);
});

test('shuffle keeps played songs behind a manual selection and merges additions',()=>{
 const tracks=[1,2,3,4,5].map(n=>({id:n,shuffleToken:String(n).repeat(32)}));
 const [a,b,c,d,e]=tracks, prior={order:[a,b,e,c].map(t=>t.shuffleToken),played:[a,b].map(t=>t.shuffleToken)};
 const result=cycle([a,b,c,d],c,prior,list=>list.slice().reverse());
 assert.deepEqual(result.loop.map(t=>t.id),[1,2,3,4]);
 assert.deepEqual(result.entry.played,[a.shuffleToken,b.shuffleToken]);
 const wrapped=cycle([a,b,c],c,prior,list=>list.slice().reverse());
 assert.deepEqual(wrapped.loop.map(t=>t.id),[3,2,1]);assert.deepEqual(wrapped.entry.played,[]);
});

test('island clamps to work area and preserves the registered shortcut on conflict',async()=>{
 const area={x:-800,y:80,width:800,height:600};
 const compact=bounds(area,{x:1,y:1},false),expanded=bounds(area,{x:1,y:1},true);
 assert.equal(compact.height,36);assert.deepEqual(relative(area,compact),{x:1,y:1});
 assert.equal(compact.y+compact.height,expanded.y+expanded.height);
 assert(expanded.x>=-800&&expanded.x+expanded.width<=0);
 assert.equal(shortcut(' Alt + Ctrl + f8 '),'Ctrl+Alt+F8');assert.equal(shortcut('F8'),null);
 const registered=new Set(),monitor={id:23,workArea:area};
 const island=new MiniIsland({prefs:{islandDisplay:'31'},electron:{
  globalShortcut:{register:key=>key==='Ctrl+F2'?false:(registered.add(key),true),unregister:key=>registered.delete(key)},
  screen:{getAllDisplays:()=>[monitor],getPrimaryDisplay:()=>monitor},
 }});
 assert.equal(island.display(),monitor);
 assert(island.register('Ctrl+F1'));await assert.rejects(island.configure({shortcut:'Ctrl+F2'}),/уже используется/);
 assert.deepEqual([...registered],['Ctrl+F1']);
});

function sample(){
 const samples=8000,rate=8000,wav=Buffer.alloc(44+samples*4);
 wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
 wav.writeUInt16LE(1,20);wav.writeUInt16LE(2,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*4,28);
 wav.writeUInt16LE(4,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*4,40);
 for(let i=0;i<samples;i++){
  const vocal=Math.round(7000*Math.sin(2*Math.PI*750*i/rate));
  const side=Math.round(2000*Math.sin(2*Math.PI*250*i/rate));
  wav.writeInt16LE(vocal+side,44+i*4);wav.writeInt16LE(vocal-side,46+i*4);
 }
 return wav;
}

test('WAV prototype attenuates the center and preserves stereo differences',()=>{
 const src=sample(),progress=[],out=instrumental(src,p=>progress.push(p));
 assert.deepEqual(inspectWav(out),inspectWav(src));assert.equal(progress.at(-1),100);
 let energy=0,original=0;
 for(let i=44+2048;i<src.length;i+=4){
  const left=out.readInt16LE(i),right=out.readInt16LE(i+2),oldL=src.readInt16LE(i),oldR=src.readInt16LE(i+2);
  assert(Math.abs((left-right)-(oldL-oldR))<=1);
  energy+=(left+right)**2;original+=(oldL+oldR)**2;
 }
 assert(energy/original<.16);
 assert.throws(()=>inspectWav(src.subarray(0,-4)),/WAV/);
});

test('karaoke worker can be cancelled, previewed and exported without changing the source',async t=>{
 const scratch=path.resolve('work');await fs.mkdir(scratch,{recursive:true});
 const dir=await fs.mkdtemp(path.join(scratch,'karaoke-test-')),source=path.join(dir,'song.wav'),output=path.join(dir,'backing.wav');
 let target=source;
 const job=new KaraokePrototype({main:null,dialog:{showOpenDialog:async()=>({filePaths:[source]}),
  showSaveDialog:async()=>({filePath:target})}});
 t.after(async()=>{await job.close();await fs.unlink(source).catch(()=>{});await fs.unlink(output).catch(()=>{});await fs.rmdir(dir);});
 const input=sample();await fs.writeFile(source,input);
 assert.equal((await job.start()).phase,'running');assert.equal((await job.cancel()).phase,'cancelled');
 assert.equal((await job.start()).phase,'running');
 const deadline=Date.now()+5000;
 while(job.status().phase==='running'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,15));
 assert.equal(job.status().phase,'ready');assert.equal(job.status().progress,100);
 assert(job.preview().bytes.equals(instrumental(input)));
 await assert.rejects(job.save(),/отдельным файлом/);target=output;
 assert.deepEqual(await job.save(),{saved:true});
 assert((await fs.readFile(output)).equals(job.preview().bytes));assert((await fs.readFile(source)).equals(input));
});
