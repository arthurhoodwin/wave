'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {cover,trackMeta,artistRoute}=require('./navigation-meta.cjs');
const MAGIC=Buffer.from('WAVEMETA1\n');
const MAX_BYTES=25*1024*1024;
const MAX_TRACKS=100000;
const str=(s,max=4096)=>typeof s==='string'&&s.length<=max?s:null;
const integer=n=>Number.isSafeInteger(n)&&n>=0;
function route(value){
 if(typeof value!=='string'||value.length>8192)return null;
 try{
  const u=new URL(value);
  if(u.origin!=='https://vk.ru'||u.username||u.password||u.hash)return null;
  if(artistRoute(value))return value;
  if(!/^\/(?:audios\d+|audio|artist\/[\w-]+|music\/(?:playlist|album)\/[^/]+)\/?$/.test(u.pathname))return null;
  for(const [key,val] of u.searchParams){
   if(!['section','q','z','act','performer'].includes(key)||/[\r\n]/.test(val))return null;
   if(key==='performer'&&val!=='1')return null;
   if(key==='z'&&!/^audio_playlist-?\d+_\d+(?:[/_][a-zA-Z0-9_-]+)?$/.test(val))return null;
  }
  return value;
 }catch{return null;}
}
function normalizePayload(input){
 if(!input||input.version!==1||typeof input.accountRoot!=='string'||!/^\/audios\d+$/.test(input.accountRoot)||!Number.isFinite(input.savedAt)||input.savedAt<=0||!Array.isArray(input.playlists)||!Array.isArray(input.collections))return null;
 if(input.playlists.length>100000||input.collections.length>10000)return null;
 const playlists=[];
 for(const p of input.playlists){
  if(!p||str(p.id,512)===null||str(p.title)===null||str(p.owner)===null||!integer(p.index)||!route(p.route))return null;
  playlists.push({id:p.id,title:p.title,owner:p.owner,index:p.index,route:p.route,...(cover(p.cover)?{cover:cover(p.cover)}:{}),...(p.kind==='album'?{kind:'album'}:{}),...(typeof p.inLibrary==='boolean'?{inLibrary:p.inLibrary}:{}),...(/^-?\d+_\d+$/.test(p.vkId||'')?{vkId:p.vkId}:{}),...(typeof p.editable==='boolean'?{editable:p.editable}:{})});
 }
 const collections=[];
 for(const c of input.collections){
  if(!c||str(c.playlistId,512)===null||!['library','playlist'].includes(c.kind)||str(c.title)===null||!route(c.route)||!integer(c.total)||c.total>MAX_TRACKS||!Array.isArray(c.tracks))return null;
  // A partial snapshot is never advertised as a complete offline collection.
  if(c.tracks.length!==c.total)continue;
  const tracks=[];
  for(const t of c.tracks){
   if(!t||str(t.id,512)===null||str(t.key,512)===null||str(t.title)===null||str(t.artist)===null||str(t.time,32)===null||!Number.isFinite(t.duration)||t.duration<0||typeof t.available!=='boolean'||!integer(t.index)||str(t.scope,512)===null||!route(t.route))return null;
   tracks.push({id:t.id,key:t.key,title:t.title,artist:t.artist,time:t.time,duration:t.duration,available:t.available&&t.duration>0,index:t.index,scope:t.scope,route:t.route,...trackMeta(t)});
  }
  collections.push({playlistId:c.playlistId,kind:c.kind,title:c.title,route:c.route,total:c.total,tracks});
 }
 return {version:1,accountRoot:input.accountRoot,savedAt:input.savedAt,playlists,collections};
}
class MetadataStore{
 constructor({directory,encrypt,decrypt}){
  if(typeof directory!=='string'||typeof encrypt!=='function'||typeof decrypt!=='function')throw new TypeError('MetadataStore requires directory, encrypt and decrypt');
  this.directory=directory;this.file=path.join(directory,'cache.dat');this.encrypt=encrypt;this.decrypt=decrypt;this.pending=Promise.resolve();this.closed=false;
 }
 async load(){
  await this.pending;
  try{
   const stat=await fs.stat(this.file);if(stat.size>MAX_BYTES+MAGIC.length||stat.size<=MAGIC.length)return null;
   const bytes=await fs.readFile(this.file);if(!bytes.subarray(0,MAGIC.length).equals(MAGIC))return null;
   const clear=await this.decrypt(bytes.subarray(MAGIC.length));if(!Buffer.isBuffer(clear)||clear.length>MAX_BYTES)return null;
   return normalizePayload(JSON.parse(clear.toString('utf8')));
  }catch{return null;}
 }
 save(payload){
  if(this.closed)return Promise.resolve(false);
  // Snapshot now: callers may mutate the live provider while disk work is queued.
  let clear;
  try{const normalized=normalizePayload(payload);if(!normalized)return Promise.resolve(false);clear=Buffer.from(JSON.stringify(normalized));if(clear.length>MAX_BYTES)return Promise.resolve(false);}catch{return Promise.resolve(false);}
  const next=this.pending.then(async()=>{
   let temporary;
   try{
    const encrypted=await this.encrypt(clear);if(!Buffer.isBuffer(encrypted)||!encrypted.length||encrypted.length>MAX_BYTES)return false;
    await fs.mkdir(this.directory,{recursive:true});
    temporary=path.join(this.directory,`.cache-${randomUUID()}.tmp`);
    const handle=await fs.open(temporary,'wx',0o600);
    try{await handle.writeFile(Buffer.concat([MAGIC,encrypted]));await handle.sync();}finally{await handle.close();}
    await fs.rename(temporary,this.file);return true;
   }catch{return false;}finally{if(temporary)await fs.unlink(temporary).catch(()=>{});}
  });
  this.pending=next.then(()=>undefined,()=>undefined);return next;
 }
 clear(){const next=this.pending.then(()=>fs.rm(this.file,{force:true}));this.pending=next.catch(()=>{});return next;}
 async close(){this.closed=true;await this.pending;}
}
module.exports={MetadataStore,normalizePayload};
