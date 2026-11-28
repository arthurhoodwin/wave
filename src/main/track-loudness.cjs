'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {LocalMedia}=require('./local-media.cjs');
const {MAX_BYTES,MAX_SECONDS}=require('../renderer/loudness-meter.js');
const validHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const validRoot=root=>typeof root==='string'&&/^\/audios\d+$/.test(root);
const validLevel=value=>value&&[1,2].includes(value.channels)&&Number.isFinite(value.lufs)&&value.lufs>=-70&&value.lufs<=12&&
 Number.isFinite(value.dbtp)&&value.dbtp>=-100&&value.dbtp<=12;
function gainFor(level){
 if(!validLevel(level))return null;
 // Web Audio duplicates a mono source to both stereo speakers.
 const stereoLoudness=level.lufs+(level.channels===1?10*Math.log10(2):0);
 return Math.min(6,-16-stereoLoudness,-1.5-level.dbtp);
}

async function measureFile({file,record},signal,{BrowserWindow}){
 const media=new LocalMedia({locate:async()=>({file,record}),getRoot:()=>'/loudness-analysis'});
 let window;
 const destroy=()=>{if(window&&!window.isDestroyed())window.destroy();};
 const timer=setTimeout(destroy,30000);
 signal.addEventListener('abort',destroy,{once:true});
 try{
  signal.throwIfAborted();
  const lease=await media.open('source');
  signal.throwIfAborted();
  window=new BrowserWindow({show:false,webPreferences:{
   sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,
   partition:'wave-loudness-analysis'
  }});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  await window.loadFile(path.join(__dirname,'../renderer/loudness-analyzer.html'));
  return await window.webContents.executeJavaScript('WaveLoudnessMeter.decode('+JSON.stringify(lease.url)+')');
 }finally{
  clearTimeout(timer);
  signal.removeEventListener('abort',destroy);
  destroy();
  await media.close();
 }
}

class TrackLoudness {
 constructor({directory,library,downloads,getRoot,measure}){
  Object.assign(this,{directory,library,downloads,getRoot,measure});
  this.cache=new Map();
 }

 async load(root){
  if(!this.cache.has(root)){
   this.cache.set(root,(async()=>{
    const file=path.join(this.directory,createHash('sha256').update(root).digest('hex')+'.dat');
    const records=new Map();
    try{
     if((await fs.stat(file)).size<=1024**2){
      const snapshot=JSON.parse(await this.library.decrypt(await fs.readFile(file)));
      if(snapshot?.version===1&&Array.isArray(snapshot.rows)){
       for(const [key,value] of snapshot.rows.filter(Array.isArray).slice(-5000)){
        if(validHash(key)&&validLevel(value))records.set(key,value);
       }
      }
     }
    }catch{}
    return {file,records};
   })());
   if(this.cache.size>3)this.cache.delete(this.cache.keys().next().value);
  }
  return this.cache.get(root);
 }

 async save(file,records){
  const payload=await this.library.encrypt(JSON.stringify({version:1,rows:[...records].slice(-5000)}));
  await fs.mkdir(this.directory,{recursive:true});
  const temporary=file+'.'+randomUUID();
  try{await fs.writeFile(temporary,payload,{flag:'wx'});await fs.rename(temporary,file);}
  finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
 }

 async gain(root,record){
  if(!validRoot(root)||!validHash(record?.sha256))return null;
  const {records}=await this.load(root);
  return gainFor(records.get(record.sha256));
 }

 status(){
  const root=this.getRoot();
  return this.job&&this.job.root===root?{...this.job.state,available:true}:{available:validRoot(root),phase:'idle'};
 }

 start(){
  const root=this.getRoot();
  if(!validRoot(root))throw Error('Войдите в свой аккаунт VK');
  if(this.job?.task)return this.status();
  const job={root,controller:new AbortController(),state:{phase:'running',total:0,done:0,measured:0,cached:0,skipped:0}};
  this.job=job;
  job.task=this.run(job).catch(()=>{
   job.state.phase='error';
  }).finally(()=>{job.task=null;});
  return this.status();
 }

 async run(job){
  const {root,state,controller}=job,{signal}=controller;
  const account=await this.library.account(root);
  const downloads=account.data.downloads.slice();
  const {file,records}=await this.load(root);
  const hashes=new Set(downloads.map(record=>record.sha256));
  let pending=0,dropped=false;
  for(const hash of records.keys())if(!hashes.has(hash)){records.delete(hash);dropped=true;}
  state.total=downloads.length;
  for(const record of downloads){
   if(signal.aborted||root!==this.getRoot())break;
   if(records.has(record.sha256))state.cached++;
   else{
    let level;
    try{
     if(record.bytes<=MAX_BYTES&&record.track.duration<=MAX_SECONDS+3){
      const located=await this.downloads.locate(root,record.track.key);
      if(!signal.aborted&&root===this.getRoot()&&located?.record.sha256===record.sha256)level=await this.measure(located,signal);
     }
    }catch{}
    if(signal.aborted||root!==this.getRoot())break;
    if(validLevel(level)){
     records.set(record.sha256,level);
     state.measured++;
     pending++;
    }else state.skipped++;
   }
   state.done++;
   if(pending>=8){await this.save(file,records);pending=0;dropped=false;}
  }
  if(pending||dropped)await this.save(file,records);
  state.phase=signal.aborted||root!==this.getRoot()?'cancelled':'ready';
 }

 cancel(){
  if(this.job?.task){
   this.job.state.phase='cancelling';
   this.job.controller.abort();
  }
  return this.status();
 }

 async close(){
  this.cancel();
  await this.job?.task;
 }
}

module.exports={TrackLoudness,measureFile,gainFor};
