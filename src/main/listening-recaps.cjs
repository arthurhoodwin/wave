'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash, randomUUID} = require('node:crypto');
const {validRoot, trackData} = require('./personal-library.cjs');

const MAX_BYTES = 32 * 1024 ** 2;
const MAX_MONTHS = 1200;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const pad = n => String(n).padStart(2,'0');
const monthKey = d => d.getFullYear() + '-' + pad(d.getMonth()+1);
const dayKey = d => monthKey(d) + '-' + pad(d.getDate());
const monthStart = key => new Date(Number(key.slice(0,4)), Number(key.slice(5))-1, 1);
const previousMonth = now => monthKey(new Date(now.getFullYear(),now.getMonth()-1,1));
const text = value => typeof value==='string'?value.slice(0,240):'';

function timeSlices(start,end){
 const result=[];
 for(let from=start;from<end;){
  const date=new Date(from);
  const next=new Date(from);
  next.setHours(date.getHours()+1,0,0,0);
  const stop=Math.min(end,Math.max(from+1,next.getTime()));
  result.push({date,from,end:stop,ms:stop-from});
  from=stop;
 }
 return result;
}

function uninterrupted(last,next){
 if(!last||!last.playing||last.buffering||next.buffering||next.seeking||
    last.key!==next.key||last.root!==next.root||last.generation!==next.generation)return 0;
 const elapsed=next.at-last.at, advance=(next.position-last.position)*1000;
 if(elapsed<=0||elapsed>5000||advance<=0||Math.abs(elapsed-advance)>Math.max(280,elapsed*.4))return 0;
 return Math.round(Math.min(elapsed,advance));
}

function blank(month){
 return {schema:1,month,ms:0,tracks:{},artists:{},albums:{},lists:{},genres:{},
  days:{},hours:{},qualifiedDays:{},mixMs:0,mixTracks:{},offlineMs:0,longestMs:0};
}

function leader(rows,measure='ms',accept=()=>true){
 return Object.values(rows).filter(row=>row[measure]>0&&accept(row)).sort((a,b)=>b[measure]-a[measure]||b.ms-a.ms||a.name.localeCompare(b.name,'ru'))[0]||null;
}

function accumulate(rows,key,name,ms,extra={}){
 if(!key||!name)return;
 const row=rows[key]??={id:key,name,ms:0,...extra};
 row.ms+=ms;
 return row;
}

function streak(days){
 let best=0,length=0,previous=0;
 for(const day of Object.keys(days).sort()){
  const time=Date.parse(day+'T00:00:00Z');
  length=time-previous===86400000?length+1:1;
  best=Math.max(best,length);previous=time;
 }
 return best;
}

class ListeningRecaps {
 constructor({directory,encrypt,decrypt,firstLaunch,now=Date.now,historyAllowed=async()=>true}){
  Object.assign(this,{directory,encrypt,decrypt,firstLaunch,now,historyAllowed});
  this.cache=new Map();
  this.dirty=new Map();
  this.pending=Promise.resolve();
  this.last=null;
  this.currentSession=null;
  this.lastSave=0;
  this.accepting=true;
 }

 folder(root){
  if(!validRoot(root))throw Error('Сначала войдите в Wave');
  return path.join(this.directory,createHash('sha256').update(root).digest('hex'));
 }

 run(work){
  const task=this.pending.then(work);
  this.pending=task.catch(()=>{});
  return task;
 }

 async read(root,name,fallback){
  const file=path.join(this.folder(root),name+'.dat');
  if(this.cache.has(file))return this.cache.get(file);
  let value;
  try{
   if((await fs.stat(file)).size>MAX_BYTES)throw Error('Сводка слишком велика');
   value=JSON.parse(await this.decrypt(await fs.readFile(file)));
   if(value?.schema!==1)throw Error('Неизвестный формат статистики');
  }catch(error){if(error.code!=='ENOENT')throw error;value=fallback;}
  if(value){
   this.cache.set(file,value);
   while(this.cache.size>32){
    const key=[...this.cache.keys()].find(key=>!this.dirty.has(key));
    if(!key)break;
    this.cache.delete(key);
   }
  }
  return value;
 }

 mark(root,name,value){
  const file=path.join(this.folder(root),name+'.dat');
  this.cache.set(file,value);this.dirty.set(file,value);
 }

 async save(){
  for(const [file,value] of this.dirty){
   const body=JSON.stringify(value);
   if(Buffer.byteLength(body)>MAX_BYTES)throw Error('Сводка слишком велика');
   const temp=file+'.'+randomUUID();
   try{
    await fs.mkdir(path.dirname(file),{recursive:true});
    await fs.writeFile(temp,await this.encrypt(body),{flag:'wx',mode:0o600});
    await fs.rename(temp,file);
    this.dirty.delete(file);
   }finally{await fs.rm(temp,{force:true}).catch(()=>{});}
  }
  this.lastSave=this.now();
 }

 meta(root){return this.read(root,'settings',{schema:1,since:null,invite:null,pauses:[],pausedAt:null});}

 async observeTracking(root,enabled,at){
  const meta=await this.meta(root);
  if(enabled&&meta.since===null){meta.since=at;this.mark(root,'settings',meta);}
  if(!enabled&&meta.since!==null&&meta.pausedAt===null){meta.pausedAt=at;this.mark(root,'settings',meta);}
  if(enabled&&meta.pausedAt!==null){
   meta.pauses.push([meta.pausedAt,at]);meta.pausedAt=null;this.mark(root,'settings',meta);
  }
  return meta;
 }

 breakSequence(){return this.run(()=>{this.last=null;});}

 trackingChanged(root,enabled){
  const at=this.now();
  return this.run(async()=>{
   this.last=null;
   this.currentSession=null;
   await this.observeTracking(root,enabled,at);
   await this.save();
  });
 }

 sample(root,input,state,context={}){
  if(!this.accepting)return Promise.resolve();
  const track=trackData(input),at=this.now();
  const next={root,key:track?.key,at,position:Number(state.currentTime)||0,
   generation:context.generation,playing:state.playing===true,buffering:state.buffering===true,
   seeking:state.seeking===true,ended:state.ended===true};
  return this.run(async()=>{
   if(!validRoot(root)||!track){this.last=null;return;}
   const enabled=await this.historyAllowed(root);
   await this.observeTracking(root,enabled,at);
   const previous=this.last;
   this.last=enabled?next:null;
   if(!enabled){this.currentSession=null;return;}

   const continuousTrack=previous?.key===track.key&&previous?.root===root&&previous?.generation===next.generation;
   if(!this.currentSession||this.currentSession.root!==root||at-this.currentSession.lastAudio>300000){
    this.currentSession={root,lastAudio:at,total:0,trackMs:0,counted:false,finished:false};
   }
   const session=this.currentSession;
   if(!continuousTrack){session.trackMs=0;session.counted=false;session.finished=false;}
   const ms=uninterrupted(previous,next);
   if(!ms&&!next.ended)return;
   const artistId=context.artistId||'name:'+track.artist.toLocaleLowerCase('ru');
   if(ms){
    session.lastAudio=at;
    const threshold=Math.min(30000,track.duration*500);
    for(const slice of timeSlices(at-ms,at)){
     const month=monthKey(slice.date);
     const period=await this.read(root,month,blank(month));
     const day=dayKey(slice.date), hour=String(slice.date.getHours());
     period.ms+=slice.ms;
     period.days[day]=(period.days[day]||0)+slice.ms;
     period.hours[hour]=(period.hours[hour]||0)+slice.ms;
     const row=accumulate(period.tracks,track.key,text(track.title),slice.ms,{
      trackKey:track.key, artist:text(track.artist),artistId,albumId:text(context.albumId),plays:0,finished:0,firstAt:slice.from,lastAt:slice.end
     });
     row.lastAt=slice.end;
     accumulate(period.artists,artistId,text(track.artist),slice.ms,{firstAt:slice.from, route:track.artistRoute});
     if(context.albumId)accumulate(period.albums,context.albumId,text(track.albumTitle),slice.ms);
     if(context.listKey)accumulate(period.lists,context.listKey,text(context.listName),slice.ms);
     if(context.genre)accumulate(period.genres,'genre:'+context.genre,text(context.genre),slice.ms);
     if(context.mix){period.mixMs+=slice.ms;period.mixTracks[track.key]=true;}
     if(context.offline)period.offlineMs+=slice.ms;
     session.total+=slice.ms;
     period.longestMs=Math.max(period.longestMs,session.total);
     session.trackMs+=slice.ms;
     if(!session.counted&&session.trackMs>=threshold){
      session.counted=true;
      row.plays++;
      period.qualifiedDays[day]=(period.qualifiedDays[day]||0)+1;
     }
     this.mark(root,month,period);
    }
   }
   if(next.ended&&continuousTrack&&!session.finished&&session.trackMs>=track.duration*800){
    session.finished=true;
    const month=monthKey(new Date(at-1)), period=await this.read(root,month,null);
    const row=period?.tracks[track.key];
    if(row){row.finished++;this.mark(root,month,period);}
   }
   if(at-this.lastSave>=20000&&this.dirty.size)await this.save();
  });
 }

 coverage(meta,month,first){
  const start=monthStart(month).getTime(), date=monthStart(month);
  date.setMonth(date.getMonth()+1);
  const end=date.getTime();
  if(meta.since===null||end<=meta.since)return 'missing';
  const pauses=[...meta.pauses,...(meta.pausedAt===null?[]:[[meta.pausedAt,Infinity]])];
  if(pauses.some(([from,to])=>from<=start&&to>=end))return 'missing';
  return first||meta.since>start||pauses.some(([from,to])=>from<end&&to>start)?'partial':'complete';
 }

 async index(root,current){
  const meta=await this.meta(root);
  const filenames=await fs.readdir(this.folder(root)).catch(error=>{if(error.code==='ENOENT')return[];throw error;});
  const saved=new Set(filenames.filter(file=>MONTH.test(file.slice(0,-4))&&file.endsWith('.dat')).map(file=>file.slice(0,-4)));
  const first=monthKey(new Date(Math.min(this.firstLaunch,meta.since??this.firstLaunch)));
  const months=[];
  const date=monthStart(current);
  for(let i=0;i<MAX_MONTHS;i++){
   date.setMonth(date.getMonth()-1);
   const key=monthKey(date);
   if(key<first)break;
   const coverage=this.coverage(meta,key,key===first);
   months.push({month:key,coverage,hasData:saved.has(key)||this.dirty.has(path.join(this.folder(root),key+'.dat'))});
  }
  return {months,enabled:await this.historyAllowed(root)};
 }

 archive(root){return this.run(async()=>{
  const at=this.now();
  await this.observeTracking(root,await this.historyAllowed(root),at);
  if(this.dirty.size)await this.save();
  return this.index(root,monthKey(new Date(at)));
 });}

 invitation(root){
  return this.run(async()=>{
   const now=new Date(this.now()),current=monthKey(now),meta=await this.observeTracking(root,await this.historyAllowed(root),now.getTime());
   if(this.dirty.size)await this.save();
   if(meta.invite===current)return {month:null};
   const month=previousMonth(now);
   const period=await this.read(root,month,null);
   if(!period?.ms)return {month:null};
   meta.invite=current;
   this.mark(root,'settings',meta);
   await this.save();
   return {month};
  });
 }

 view(root,month){
  return this.run(async()=>{
   if(typeof month!=='string'||!MONTH.test(month)||month>=monthKey(new Date(this.now())))throw Error('Выберите завершённый месяц');
   const index=await this.index(root,monthKey(new Date(this.now())));
   const description=index.months.find(item=>item.month===month);
   if(!description)throw Error('Месяц вне истории Wave');
   const period=await this.read(root,month,null);
   if(!period?.ms)return {...description,report:null};
   const tracks=Object.values(period.tracks), artists=Object.values(period.artists);
   const older=index.months.slice(index.months.indexOf(description)+1).filter(m=>m.hasData);
   const previous=older[0]?.month===previousMonth(monthStart(month))?await this.read(root,older[0].month,null):null;
   const historicalArtists=new Set(), previousTracks=new Map();
   for(const item of older){
    const old=await this.read(root,item.month,null);
    if(!old)continue;
    for(const id of Object.keys(old.artists))historicalArtists.add(id);
    for(const row of Object.values(old.tracks))if(!previousTracks.has(row.id))previousTracks.set(row.id,row.lastAt);
   }
   const topArtists=artists.slice().sort((a,b)=>b.ms-a.ms).slice(0,5);
   const outside=Math.max(0,period.ms-topArtists.reduce((sum,row)=>sum+row.ms,0));
   const maxKey=values=>Object.entries(values).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
   const albumCompletion=Object.values(period.albums).map(album=>{
    const songs=tracks.filter(track=>track.albumId===album.id&&track.plays);
    return {name:album.name,total:songs.length,finished:songs.filter(track=>track.finished).length};
   }).filter(album=>album.total>=3&&album.finished).sort((a,b)=>b.finished/b.total-a.finished/a.total||b.total-a.total)[0];
   return {...description,report:{
    ms:period.ms,days:Object.keys(period.days).length,tracks:tracks.length,artists:artists.length,
    plays:tracks.reduce((sum,row)=>sum+row.plays,0),
    track:leader(period.tracks),repeat:leader(period.tracks,'plays'),artist:leader(period.artists),
    album:leader(period.albums),playlist:leader(period.lists),
    discovery:older.length?leader(period.artists,'ms',row=>!historicalArtists.has(row.id)):null,
    comeback:leader(period.tracks,'ms',row=>previousTracks.has(row.id)&&row.firstAt-previousTracks.get(row.id)>=30*86400000),
    albumCompletion,day:maxKey(period.days),streak:streak(period.qualifiedDays),
    hour:maxKey(period.hours),longestMs:period.longestMs,outside,
    mixMs:period.mixMs,mixTracks:Object.keys(period.mixTracks).length,offlineMs:period.offlineMs,
    genre:Object.values(period.genres).reduce((n,row)=>n+row.ms,0)>=period.ms*.5?leader(period.genres):null,
    comparison:previous&&description.coverage==='complete'&&older[0].coverage==='complete'
     ?{ms:period.ms-previous.ms,artists:artists.length-Object.keys(previous.artists).length}:null
   }};
  });
 }

 clear(root){return this.run(async()=>{
  await this.save();
  const folder=this.folder(root);
  const names=await fs.readdir(folder).catch(error=>{if(error.code==='ENOENT')return[];throw error;});
  for(const name of names){
   if(!name.endsWith('.dat')||!MONTH.test(name.slice(0,-4)))continue;
   const file=path.join(folder,name);
   await fs.unlink(file);this.cache.delete(file);
  }
  this.last=null;this.currentSession=null;
  const meta=await this.meta(root);
  meta.since=await this.historyAllowed(root)?this.now():null;
  meta.pausedAt=null;meta.pauses=[];
  this.mark(root,'settings',meta);
  await this.save();
 });}

 close(){this.accepting=false;return this.run(()=>this.save());}
}

module.exports={ListeningRecaps,timeSlices,uninterrupted,monthKey};
