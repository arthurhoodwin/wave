'use strict';
const mixConfig=require('./mix-config.cjs');
const {randomUUID}=require('node:crypto');
const cancelled=()=>Object.assign(Error('Микс уже изменился'),{kind:'cancelled'});
const MAX_TRACKS=60,MAX_SEEN=1000;
class MixSession {
 constructor(provider){this.provider=provider;this.entry=null;this.epoch=0;this.ids=new Set();this.openRevision=0;}
 stop(){this.epoch++;this.openRevision++;const entry=this.entry;entry?.controller?.abort();if(entry){entry.partial=false;entry.stopped=true;}return entry?this.snapshot(entry):{tracks:[],partial:false,stopped:true};}
 forget(id){const p=this.provider;if(p.active?.id===id||p.nativePlayer?.current?.id===id)return;const key=p.tracks.get(id)?.key;p.tracks.delete(id);this.ids.delete(id);if(key&&![...p.tracks.values()].some(t=>t.key===key))p.network?.audioRefs?.delete(key);}
 clear(){this.stop();const p=this.provider,entry=this.entry;for(const id of this.ids)this.forget(id);if(entry)for(const [key] of p.handles)if(key.includes(entry.id))p.handles.delete(key);this.entry=null;}

 snapshot(entry=this.entry){return{mixId:entry.id,title:entry.source?.title||'VK Микс',tracks:[...entry.items.values()],partial:entry.partial,stopped:!!entry.stopped,source:entry.source?.title||'VK Микс',seedType:entry.source?.type||'common',cacheState:entry.partial?'loading':'complete',exhausted:!!entry.exhausted};}
 async command(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['action','id','currentId','restart','seed','options'].includes(k))||!['open','more','stop','settings'].includes(input.action)||input.id!==undefined&&(typeof input.id!=='string'||input.id.length>80)||input.currentId!==undefined&&(typeof input.currentId!=='string'||input.currentId.length>200)||input.restart!==undefined&&typeof input.restart!=='boolean')throw Error('Некорректная команда Микса');
  const p=this.provider;if(input.action==='stop'&&this.entry?.root===p.root&&!p.authTransition&&(!input.id||input.id===this.entry.id))return this.stop();if(!p.root||!p.online||!p.network||p.authTransition)throw Error('Подключитесь к VK, чтобы слушать Микс');
  if(input.action==='settings')return this.settings();
  if(input.action==='open'){if(this.entry?.root===p.root&&!input.restart&&input.seed===undefined&&input.options===undefined&&!this.entry.stopped)return this.snapshot();const source=mixConfig.seed(p,input.seed),root=p.root,revision=++this.openRevision;let selected;if(input.options!==undefined){const configuration=await this.settings();selected=mixConfig.options(input.options,configuration);}if(p.root!==root||revision!==this.openRevision||p.authTransition||!p.online)throw cancelled();this.clear();this.entry={source,options:mixConfig.serialize(selected),id:randomUUID(),root:p.root,kind:'mix',scope:'body',items:new Map(),seen:new Set(),excluded:new Set(),partial:true,repeats:0};this.entry.playlistId='mix:'+this.entry.id;const entry=this.entry;let result;for(let n=0;n<3;n++){result=await this.more(entry,input.currentId);if(result.tracks.length||!result.partial)break;}return result;}
  if(input.action==='stop'&&!input.id)return this.stop();
  if(!this.entry||input.id!==this.entry.id||this.entry.root!==p.root)throw cancelled();
  return input.action==='stop'?this.stop():this.more(this.entry,input.currentId);
 }
 exclude(key,value){const entry=this.entry;if(!entry)return;if(value)entry.excluded.add(key);else entry.excluded.delete(key);while(entry.excluded.size>MAX_SEEN)entry.excluded.delete(entry.excluded.values().next().value);}
 async settings(){const p=this.provider,root=p.root;if(this.configuration?.root===root&&Date.now()-this.configuration.at<300000)return this.configuration.data;const raw=await p.network.mixSettings();if(p.root!==root||p.authTransition)throw cancelled();const data=mixConfig.config(raw);this.configuration={root,at:Date.now(),data};return data;}
 async more(entry,currentId){if(!entry.partial)return this.snapshot(entry);if(entry.job)return entry.job;const p=this.provider,epoch=this.epoch,controller=new AbortController();entry.controller=controller;const check=()=>{if(controller.signal.aborted||epoch!==this.epoch||entry!==this.entry||p.root!==entry.root||p.authTransition)throw cancelled();};
  const job=(async()=>{check();const result=await p.network.mixAudios({signal:controller.signal,type:entry.source.type,entityId:entry.source.id,options:entry.options});check();const rows=[];for(const row of result.rows){if(!row.available||row.disliked===true||entry.excluded.has(row.key)||entry.seen.has(row.key))continue;entry.seen.add(row.key);rows.push(row);while(entry.seen.size>MAX_SEEN)entry.seen.delete(entry.seen.values().next().value);}
   if(!rows.length)entry.repeats++;else entry.repeats=0;if(!result.rows.length||entry.repeats>=3){entry.partial=false;entry.exhausted=true;}
   p.absorbRows({rows,route:'https://vk.ru/audio'},entry);for(const id of entry.items.keys())this.ids.add(id);for(const id of this.ids)if(!entry.items.has(id))this.forget(id);
   const ids=[...entry.items.keys()],current=ids.indexOf(currentId),remove=Math.min(Math.max(0,ids.length-MAX_TRACKS),current<0?ids.length:Math.max(0,current-10));
   for(const id of ids.slice(0,remove)){entry.items.delete(id);this.forget(id);}
   // A caller that keeps an old current song cannot grow the buffer indefinitely.
   while(entry.items.size>MAX_TRACKS){const id=[...entry.items.keys()].reverse().find(id=>id!==currentId&&id!==p.active?.id&&id!==p.nativePlayer?.current?.id);if(!id)break;entry.items.delete(id);this.forget(id);}
   for(const row of result.rows)if(![...p.tracks.values()].some(t=>t.key===row.key))p.network.audioRefs?.delete(row.key);
   const retained=new Set(entry.items.keys());for(const [key,id] of p.handles)if(key.includes(entry.id)&&!retained.has(id))p.handles.delete(key);
   return this.snapshot(entry);
  })();entry.job=job;try{return await job;}finally{if(entry.job===job)entry.job=null;if(entry.controller===controller)entry.controller=null;}
 }
}
module.exports={MixSession,MAX_TRACKS,MAX_SEEN};
