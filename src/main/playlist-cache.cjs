'use strict';
const {randomUUID}=require('node:crypto');
const catalog=require('./catalog.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
class PlaylistCache {
 constructor(engine,absorb,onChange=()=>{}){this.source=engine;this.absorb=absorb;this.onChange=onChange;this.entries=new Map();this.byPlaylist=new Map();this.pending=[];this.running=new Map();this.closed=false;this.order=0;}
 getFresh(playlistId){const e=this.byPlaylist.get(playlistId);return e&&e.cacheState!=='error'&&(e.cacheState==='loading'||Date.now()-e.createdAt<300000)?e:null;}
 create(playlistId,title,kind='playlist'){const entry={id:randomUUID(),playlistId,title,kind,scope:kind==='library'?'[data-testid="AudioCatalog_SectionTracks"]':'[data-testid="MusicPlaylistModal"]',items:new Map(),total:null,cacheState:'loading',createdAt:Date.now(),error:null};entry.cacheId=entry.id;this.entries.set(entry.id,entry);this.byPlaylist.set(playlistId,entry);return entry;}
 snapshot(e){return{tracks:e.cacheState==='loading'&&e.items.size<30?[]:Array.from(e.items.values()),title:e.title,description:e.description||'',cover:e.cover,partial:e.cacheState!=='complete',cacheId:e.id,total:e.total,cacheState:e.cacheState,error:e.error||undefined,errorCode:e.errorCode,stale:!!e.stale,refreshing:!!e.refreshing,refreshError:!!e.refreshError,savedAt:e.savedAt};}
 read(id){const e=this.entries.get(id);if(!e)throw Error('Кэш плейлиста устарел. Откройте его снова.');return this.snapshot(e);}
 finish(entry,success){
  if(entry.removed||entry.refreshTarget?.removed){this.entries.delete(entry.id);return;}
  if(success){entry.cacheState='complete';entry.savedAt=Date.now();entry.createdAt=Date.now();entry.stale=false;}
  const target=entry.refreshTarget;
  if(target){
   if((entry.refreshRevision||0)!==(target.revision||0)){this.entries.delete(entry.id);return;}
   if(success){target.cover=entry.cover||target.cover;target.description=entry.description;target.items=entry.items;target.total=entry.total;target.route=entry.route;target.savedAt=entry.savedAt;target.createdAt=entry.createdAt;target.stale=false;target.cacheState='complete';}
   target.refreshing=false;target.refreshError=!success;this.entries.delete(entry.id);this.onChange(target);
  }else this.onChange(entry);
 }
 start(entry,route){entry.route=route;entry.priority=++this.order;if(entry.total!==null&&entry.items.size===entry.total){this.finish(entry,true);return;}this.pending.push(entry);this.pump();}
 pump(){
  if(this.closed)return;this.pending.sort((a,b)=>b.priority-a.priority);
  while(this.running.size<2&&this.pending.length){const e=this.pending.shift();if(e.cacheState!=='loading')continue;
   const job=this.fill(e).finally(()=>{this.running.delete(e.id);if(e.cacheState==='loading'&&!this.closed)this.pending.push(e);this.pump();});this.running.set(e.id,job);
  }
 }
 async initial(entry){
  if(Number.isSafeInteger(entry.total))return this.snapshot(entry);
  const deadline=Date.now()+45000;
  while(!this.closed&&Date.now()<deadline){
   if(entry.cacheState==='error')throw Error(entry.error);
   if(entry.cacheState==='complete'||entry.items.size>=30)return this.snapshot(entry);
   await sleep(100);
  }
  throw Error('Не удалось подготовить список песен. Обновите плейлист.');
 }
 async fill(e){
  if(this.closed)return;
  let engine;
  try{
   engine=await this.source.fork();e.engine=engine;if(this.closed)return;
   await engine.navigate(e.route);
   let lastGrowth=Date.now(),observed=e.items.size;
   while(!this.closed){
    if(e.cacheState!=='loading')return;
    if(this.pending.some(other=>other.priority>e.priority))return;
    const raw=await engine.evaluate(catalog.call(catalog.collect,e.scope));
    if(e.cacheState!=='loading')return;
    if(raw&&raw.total!==null&&raw.total!==undefined){
     if(e.total!==null&&e.total!==raw.total)throw Error('Плейлист изменился во время загрузки. Обновите его.');
     e.total=raw.total;
    }
    if(raw)this.absorb(raw,e);
    if(e.total!==null&&e.items.size===e.total){this.finish(e,true);return;}
    if(e.total!==null&&e.items.size>e.total)throw Error('VK вернул несогласованный список. Обновите плейлист.');
    if(e.items.size>observed){observed=e.items.size;lastGrowth=Date.now();}
    if(Date.now()-lastGrowth>20000)throw Error('Не удалось загрузить весь список. Нажмите «Обновить».');
    await engine.evaluate(catalog.call(catalog.scrollScope,e.scope,false));
    await engine.evaluate(catalog.call(catalog.waitForRows,e.scope,raw?.rows.length||0,450));
   }
   if(!this.closed)throw Error('Загрузка списка заняла слишком много времени. Нажмите «Обновить».');
  }catch(error){if(!this.closed){e.cacheState='error';e.errorCode=/изменился/.test(error.message)?'changed':/несогласованный/.test(error.message)?'inconsistent':/Обновить/.test(error.message)?'stalled':'network';e.error='Не удалось загрузить весь список. Нажмите «Обновить».';this.finish(e,false);}}
  finally{e.engine=null;await engine?.close();}
 }
 async close(){this.closed=true;this.pending=[];await Promise.allSettled(Array.from(this.entries.values()).map(e=>e.engine?.close()));}
}
module.exports={PlaylistCache};

