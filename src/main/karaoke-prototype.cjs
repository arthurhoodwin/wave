'use strict';

const {Worker}=require('node:worker_threads');
const path=require('node:path');
const fs=require('node:fs/promises');

class KaraokePrototype {
 constructor({dialog,main}){
  Object.assign(this,{dialog,main});
  this.state={phase:'idle',progress:0};
 }

 status(){return {...this.state};}

 async start(){
  if(this.job||this.state.phase==='choosing')return this.status();
  this.state={phase:'choosing',progress:0};
  let picked;
  try{
   picked=await this.dialog.showOpenDialog(this.main,{title:'Выберите стерео WAV',properties:['openFile'],filters:[{name:'WAV',extensions:['wav']}]});
  }catch(error){this.state={phase:'idle',progress:0};throw error;}
  if(picked.canceled){this.state={phase:'idle',progress:0};return this.status();}
  const source=picked.filePaths[0];
  if(typeof source!=='string'||!path.isAbsolute(source)||path.extname(source).toLowerCase()!=='.wav'){
   this.state={phase:'idle',progress:0};throw Error('Выберите файл WAV');
  }
  this.bytes=null;this.source=source;
  const name=path.basename(source,path.extname(source)).slice(0,180);
  this.state={phase:'running',progress:0,name};
  let worker;
  try{
   const script=path.join(__dirname,'karaoke-worker.cjs').replace(/app\.asar(?=[\\/])/,'app.asar.unpacked');
   worker=new Worker(script,{workerData:{source},resourceLimits:{maxOldGenerationSizeMb:80}});
  }catch{this.state={phase:'error',name,error:'Не удалось запустить подготовку'};return this.status();}
  this.job=worker;
  const failed=error=>{
   if(this.job!==worker)return;
   this.job=null;this.state={phase:'error',name,error};
  };
  worker.on('message',value=>{
   if(this.job!==worker)return;
   if(Number.isFinite(value.progress))this.state={...this.state,progress:value.progress};
   else if(value.bytes){
    this.bytes=Buffer.from(value.bytes);
    this.job=null;
    this.state={phase:'ready',progress:100,name};
   }else failed(value.error||'Не удалось подготовить запись');
  });
  worker.on('error',()=>failed('Не удалось подготовить запись'));
  worker.on('exit',()=>failed('Подготовка не завершилась'));
  return this.status();
 }

 async cancel(){
  const worker=this.job;
  if(!worker)return this.status();
  this.job=null;this.bytes=null;
  this.state={phase:'cancelled',progress:0};
  await worker.terminate();
  return this.status();
 }

 preview(){
  if(this.state.phase!=='ready'||!this.bytes)throw Error('Сначала подготовьте инструментал');
  return {bytes:this.bytes};
 }

 async save(){
  if(this.state.phase!=='ready'||!this.bytes)throw Error('Сначала подготовьте инструментал');
  const bytes=this.bytes,selectedSource=this.source;
  const target=await this.dialog.showSaveDialog(this.main,{title:'Сохранить инструментал',defaultPath:this.state.name+' (инструментал).wav',filters:[{name:'WAV',extensions:['wav']}]});
  if(target.canceled)return {canceled:true};
  const selected=target.filePath;
  if(path.extname(selected).toLowerCase()!=='.wav')throw Error('Укажите имя с расширением WAV');
  const existing=await fs.realpath(selected).catch(error=>{if(error.code!=='ENOENT')throw error;return null;});
  const source=await fs.realpath(selectedSource).catch(()=>selectedSource);
  if(existing?.toLowerCase()===source.toLowerCase())throw Error('Сохраните инструментал отдельным файлом');
  const temporary=selected+'.'+require('node:crypto').randomUUID()+'.tmp';
  try{await fs.writeFile(temporary,bytes,{flag:'wx'});await fs.rename(temporary,selected);}
  finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
  return {saved:true};
 }

 async close(){await this.cancel();this.bytes=null;}
}

module.exports={KaraokePrototype};
