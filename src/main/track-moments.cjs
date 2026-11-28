'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash,randomUUID}=require('node:crypto');
const {validRoot}=require('./personal-library.cjs');

const maxFile=1024*1024,maxTrack=50,maxAccount=3000;
const validKey=key=>typeof key==='string'&&key.length<=64&&/^-?\d+_\d+$/.test(key);
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const validTime=time=>Number.isSafeInteger(time)&&time>=0&&time<=604800;
const validLabel=label=>typeof label==='string'&&label.length<=80;

class TrackMoments{
 constructor({directory,encrypt,decrypt}){Object.assign(this,{directory,encrypt,decrypt});}

 async read(file){
  try{
   const stat=await fs.lstat(file);
   if(!stat.isFile()||stat.size>maxFile)throw Error();
   const data=JSON.parse(await this.decrypt(await fs.readFile(file)));
   if(data?.version!==1||!Array.isArray(data.rows)||data.rows.length>maxAccount||
      data.rows.some(row=>!validKey(row?.key)||!validId(row.id)||!validTime(row.time)||!validLabel(row.label)))throw Error();
   return data.rows;
  }catch(error){
   if(error.code==='ENOENT')return [];
   throw Error('Не удалось открыть сохранённые моменты.');
  }
 }

 async write(file,rows){
  const payload=await this.encrypt(JSON.stringify({version:1,rows}));
  if(payload.length>maxFile)throw Error('Достигнут лимит сохранённых моментов.');
  const temporary=file+'.'+randomUUID();
  await fs.mkdir(this.directory,{recursive:true});
  try{
   await fs.writeFile(temporary,payload,{flag:'wx',mode:0o600});
   await fs.rename(temporary,file);
  }finally{await fs.rm(temporary,{force:true}).catch(()=>{});}
 }

 async request(root,key,command,checkAccount){
  if(!validRoot(root)||!validKey(key))throw Error('Откройте песню снова.');
  const file=path.join(this.directory,createHash('sha256').update(root).digest('hex')+'.dat');
  const rows=await this.read(file);
  checkAccount();
  switch(command.action){
   case 'moments':break;
   case 'moment-save':{
    if(!validTime(command.time)||!validLabel(command.label))throw Error('Некорректная позиция или подпись.');
    const label=command.label.trim();
    const existing=rows.find(row=>row.key===key&&row.time===command.time);
    if(existing)existing.label=label;
    else{
     if(rows.length>=maxAccount)throw Error('Достигнут лимит сохранённых моментов.');
     if(rows.filter(row=>row.key===key).length>=maxTrack)throw Error('У этой песни уже 50 моментов.');
     rows.push({key,id:randomUUID(),time:command.time,label});
    }
    await this.write(file,rows);
    break;
   }
   case 'moment-rename':
   case 'moment-remove':{
    if(!validId(command.momentId))throw Error('Некорректный момент.');
    const index=rows.findIndex(row=>row.key===key&&row.id===command.momentId);
    if(index===-1)throw Error('Момент уже удалён.');
    if(command.action==='moment-rename'){
     if(!validLabel(command.label))throw Error('Подпись должна быть не длиннее 80 символов.');
     rows[index].label=command.label.trim();
    }else rows.splice(index,1);
    await this.write(file,rows);
    break;
   }
   default:throw Error('Недопустимое действие с моментом.');
  }
  checkAccount();
  return {moments:rows.filter(row=>row.key===key).sort((a,b)=>a.time-b.time)
   .map(({id,time,label})=>({id,time,label}))};
 }
}

module.exports={TrackMoments};
