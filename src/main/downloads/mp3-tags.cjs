'use strict';
const fs=require('node:fs/promises'),{createReadStream}=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const MAX_TAG=3*1024**2;
function syncSafe(n){if(!Number.isSafeInteger(n)||n<0||n>0xfffffff)throw Error('Размер тегов недопустим');return Buffer.from([(n>>21)&127,(n>>14)&127,(n>>7)&127,n&127]);}
function frame(name,data){return Buffer.concat([Buffer.from(name),syncSafe(data.length),Buffer.alloc(2),data]);}
function tag(track,picture){const frames=[];for(const [id,value] of [['TIT2',track.title],['TPE1',track.artist],['TALB',track.albumTitle]])if(typeof value==='string'&&value.trim()&&!(id==='TALB'&&!track.albumTitleConfirmed&&/^(unnamed|untitled)$/i.test(value.trim())))frames.push(frame(id,Buffer.concat([Buffer.from([3]),Buffer.from(value.slice(0,4096),'utf8')])));
 if(picture&&['jpg','png'].includes(picture.ext)&&picture.data.length<=2*1024**2)frames.push(frame('APIC',Buffer.concat([Buffer.from([3]),Buffer.from(picture.ext==='jpg'?'image/jpeg\0':'image/png\0'),Buffer.from([3,0]),picture.data])));
 const payload=Buffer.concat(frames);if(payload.length>MAX_TAG)throw Error('Слишком большие теги');return Buffer.concat([Buffer.from([73,68,51,4,0,0]),syncSafe(payload.length),payload]);}
async function writeTags(file,track,{artwork,convertArtwork,signal,beforeWrite=async()=>{}}={}){
 const stat=await fs.stat(file),header=Buffer.alloc(10),read=await fs.open(file,'r');let start=0;
 try{await read.read(header,0,10,0);if(header.toString('ascii',0,3)==='ID3'){if(header.subarray(6).some(x=>x&128))throw Error('Некорректный ID3');start=10+header[6]*2097152+header[7]*16384+header[8]*128+header[9]+(header[3]===4&&(header[5]&16)?10:0);if(start>=stat.size||start>16*1024**2)throw Error('Некорректный ID3');}}finally{await read.close();}
 let picture;if(artwork){try{let data=await fs.readFile(artwork.file),ext=artwork.ext;if(ext==='webp'&&convertArtwork){data=await convertArtwork(data);ext='jpg';}if(['jpg','png'].includes(ext)&&data.length<=2*1024**2)picture={data,ext};}catch{}}
 const prefix=tag(track,picture),bytes=stat.size-start+prefix.length;await beforeWrite(bytes);signal?.throwIfAborted();
 const disk=await fs.statfs(path.dirname(file));if(disk.bavail*disk.bsize<bytes+10*1024**2)throw Object.assign(Error('Нет места'),{code:'ENOSPC'});
 const temp=file+'.tags',hash=createHash('sha256');let handle;
 try{handle=await fs.open(temp,'wx',0o600);await handle.writeFile(prefix);for await(const chunk of createReadStream(file,{start,signal})){signal?.throwIfAborted();hash.update(chunk);await handle.writeFile(chunk);}await handle.sync();await handle.close();handle=null;
  const actual=createHash('sha256');for await(const chunk of createReadStream(temp,{start:prefix.length,signal}))actual.update(chunk);if(hash.digest('hex')!==actual.digest('hex'))throw Error('Аудиоданные изменились при записи тегов');signal?.throwIfAborted();await fs.rename(temp,file);return{bytes,tags:true,embeddedArtwork:!!picture};
 }finally{await handle?.close();await fs.rm(temp,{force:true}).catch(()=>{});}
}
module.exports={writeTags,tag,syncSafe};
