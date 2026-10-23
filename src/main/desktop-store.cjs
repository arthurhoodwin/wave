'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');const {normalizePayload}=require('./metadata-store.cjs');const {historyData}=require('./search-history.cjs');const {folderData}=require('./library-folders.cjs');
function playback(data){
 if(!data||data.version!==1||!/^\/audios\d+$/.test(data.accountRoot)||!Array.isArray(data.tracks)||data.tracks.length>100000||!Array.isArray(data.order)||data.order.length>100000||typeof data.selectedId!=='string'||!Number.isFinite(data.position)||data.position<0||data.position>604800)return null;
 const route='https://vk.ru'+data.accountRoot+'?section=all';const normalized=normalizePayload({version:1,accountRoot:data.accountRoot,savedAt:Date.now(),playlists:[],collections:[{playlistId:'restore',title:'Воспроизведение',kind:'library',route,total:data.tracks.length,tracks:data.tracks}]});if(!normalized)return null;
 const tracks=normalized.collections[0]?.tracks||[],ids=new Set(tracks.map(t=>t.id));if(!ids.has(data.selectedId)||data.order.some(t=>!t||!ids.has(t.id)||!Number.isSafeInteger(t.contextOrder)||t.contextOrder<0))return null;
 return{version:1,accountRoot:data.accountRoot,selectedId:data.selectedId,tracks,order:data.order.map(t=>({id:t.id,contextOrder:t.contextOrder})),position:data.position,volume:Math.max(0,Math.min(1,Number(data.volume)||0)),shuffle:data.shuffle===true,repeat:['off','all','one'].includes(data.repeat)?data.repeat:'off'};
}
function preferences(data){return{closeToTray:data?.closeToTray===true,miniAlwaysOnTop:data?.miniAlwaysOnTop!==false,showSync:data?.showSync===true,showConnectionStatus:data?.showConnectionStatus===true};}
class DesktopStore{
 constructor({directory,encrypt,decrypt}){Object.assign(this,{directory,encrypt,decrypt});this.pending=Promise.resolve();}
 file(kind){if(!['playback','preferences','search','folders'].includes(kind))throw Error('Неверное хранилище');return path.join(this.directory,kind+'.dat');}
 async load(kind){await this.pending;try{const file=this.file(kind),stat=await fs.stat(file);if(stat.size>32*1024*1024)return null;const value=JSON.parse(await this.decrypt(await fs.readFile(file)));return kind==='playback'?playback(value):kind==='search'?historyData(value):kind==='folders'?folderData(value):preferences(value);}catch{return null;}}
 save(kind,data){const value=kind==='playback'?playback(data):kind==='search'?historyData(data):kind==='folders'?folderData(data):preferences(data);if(!value)return Promise.resolve(false);const clear=JSON.stringify(value);if(Buffer.byteLength(clear)>30*1024*1024)return Promise.resolve(false);const task=this.pending.then(async()=>{await fs.mkdir(this.directory,{recursive:true});const file=this.file(kind),tmp=file+'.'+randomUUID();try{await fs.writeFile(tmp,await this.encrypt(clear),{mode:0o600});await fs.rename(tmp,file);return true;}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}});this.pending=task.catch(()=>{});return task;}
 clear(){const task=this.pending.then(()=>Promise.all(['playback','search','folders'].map(kind=>fs.rm(this.file(kind),{force:true}))));this.pending=task.catch(()=>{});return task;}
}
module.exports={DesktopStore,playback,preferences};
