'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
const {dominant} = require('./cover-palette.cjs');

const hash = value => createHash('sha256').update(value).digest('hex');
const pngHeader = Buffer.from([137,80,78,71,13,10,26,10]);
const side = 384;
const maxPng = 650000;
const maxJpeg = 350000;

class PlaylistCovers {
 constructor({directory,provider,nativeImage}){
  Object.assign(this,{directory,provider,nativeImage});
 }

 key(root,id){
  const {provider}=this, item=provider.playlists.get(id);
  if(provider.root!==root||provider.authTransition||!item?.editable||item.kind==='album'||item.generated)throw Error('Обложка доступна для своего плейлиста');
  const match=/^(\d+)_(\d+)$/.exec(item.vkId||'');
  if(!match||'/audios'+match[1]!==root)throw Error('Обложка доступна для своего плейлиста');
  return path.join(this.directory,hash(root),match[2]+'.jpg');
 }

 async read(root,id){
  const file=this.key(root,id);
  let bytes;
  try{
   const stat=await fs.lstat(file);
   if(!stat.isFile()||stat.size>maxJpeg)throw Error('Обложка недоступна');
   bytes=await fs.readFile(file);
  }catch(error){
   if(error.code==='ENOENT')return {image:null};
   throw error;
  }
  this.key(root,id);
  const image=this.nativeImage.createFromBuffer(bytes);
  if(image.isEmpty())return {image:null};
  const tint=dominant(image.resize({width:32,height:32,quality:'good'}).toBitmap());
  return {image:'data:image/jpeg;base64,'+bytes.toString('base64'),tint};
 }

 async save(root,id,data){
  const file=this.key(root,id);
  if(data===null){
   await fs.rm(file,{force:true});
   return {image:null};
  }
  const prefix='data:image/png;base64,';
  if(typeof data!=='string'||!data.startsWith(prefix)||data.length>Math.ceil(maxPng*4/3)+prefix.length+4)throw Error('Выберите изображение меньшего размера');
  const png=Buffer.from(data.slice(prefix.length),'base64');
  if(png.length<33||png.length>maxPng||!png.subarray(0,8).equals(pngHeader)||png.toString('ascii',12,16)!=='IHDR'||png.readUInt32BE(16)!==side||png.readUInt32BE(20)!==side)throw Error('Обложка должна быть квадратной');
  const image=this.nativeImage.createFromBuffer(png);
  if(image.isEmpty()||image.getSize().width!==side||image.getSize().height!==side)throw Error('Не удалось открыть изображение');
  const bytes=image.toJPEG(90);
  if(bytes.length>maxJpeg)throw Error('Обложка занимает слишком много места');
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temporary=file+'.'+randomUUID()+'.tmp';
  try{
   await fs.writeFile(temporary,bytes,{flag:'wx'});
   this.key(root,id);
   await fs.rename(temporary,file);
  }finally{
   await fs.rm(temporary,{force:true}).catch(()=>{});
  }
  return this.read(root,id);
 }
}

module.exports={PlaylistCovers};
