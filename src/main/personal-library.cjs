'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {trackMeta,cover}=require('./navigation-meta.cjs');
const validRoot=root=>typeof root==='string'&&/^\/audios\d+$/.test(root);
function trackData(t){if(!t||typeof t.key!=='string'||!(/^-?\d+_\d+$/.test(t.key))||!Number.isFinite(t.duration)||t.duration<=0||t.duration>604800)return null;const text=value=>typeof value==='string'?value.slice(0,4096):'';return{key:t.key,title:text(t.title)||'Без названия',artist:text(t.artist)||'Неизвестный исполнитель',duration:t.duration,available:t.available!==false,...trackMeta(t)};}
function playlistData(p){if(!p||!['playlist','album'].includes(p.kind)||typeof p.vkId!=='string'||!(/^-?\d+_\d+$/.test(p.vkId)))return null;return{vkId:p.vkId,kind:p.kind,title:String(p.title||'Плейлист').slice(0,4096),owner:String(p.owner||'').slice(0,4096),cover:cover(p.cover)};}
const empty=()=>({schema:1,historyEnabled:true,history:[],visits:[],pins:[],downloads:[],limitBytes:5*1024**3,directory:null});
function normalize(input){const value=empty();if(!input||input.schema!==1)return value;value.historyEnabled=input.historyEnabled!==false;
 value.history=(Array.isArray(input.history)?input.history:[]).slice(0,500).flatMap(item=>{const track=trackData(item?.track);return track&&Number.isFinite(item.at)?[{track,at:item.at}]:[];});
 for(const field of ['visits','pins'])value[field]=(Array.isArray(input[field])?input[field]:[]).slice(0,field==='pins'?100:30).flatMap(item=>{const p=playlistData(item);return p?[{...p,at:Number(item.at)||0}]:[];});
 value.directory=typeof input.directory==='string'&&path.isAbsolute(input.directory)?input.directory:null;
 if(Number.isSafeInteger(input.limitBytes)&&input.limitBytes>=100*1024**2&&input.limitBytes<=100*1024**3)value.limitBytes=input.limitBytes;
 value.downloads=(Array.isArray(input.downloads)?input.downloads:[]).slice(0,5000).flatMap(d=>{const track=trackData(d?.track);if(!track||!(/^[a-f0-9-]{36}$/.test(d.id))||!['mp3','m4a','wav'].includes(d.ext)||!Number.isSafeInteger(d.bytes)||d.bytes<44||!(/^[a-f0-9]{64}$/.test(d.sha256))||typeof d.folder!=='string'||!path.isAbsolute(d.folder))return[];return[{id:d.id,track,ext:d.ext,bytes:d.bytes,sha256:d.sha256,folder:d.folder,at:Number(d.at)||0}];});return value;
}
class PersonalLibrary{
 constructor({directory,encrypt,decrypt,now=Date.now,onChange=()=>{}}){Object.assign(this,{directory,encrypt,decrypt,now,onChange});this.accounts=new Map();this.serial=Promise.resolve();this.sample=null;this.revision=0;}
 async account(root){if(!validRoot(root))throw Error('Войдите в свой аккаунт VK');if(!this.accounts.has(root)){const promise=(async()=>{const file=path.join(this.directory,createHash('sha256').update(root).digest('hex')+'.dat');let data;try{if((await fs.stat(file)).size>12*1024**2)throw Error();data=JSON.parse(await this.decrypt(await fs.readFile(file)));}catch{}return{root,file,data:normalize(data)};})();this.accounts.set(root,promise);}return this.accounts.get(root);}
 save(account){const clear=JSON.stringify(account.data);if(Buffer.byteLength(clear)>10*1024**2)return Promise.reject(Error('Личная медиатека превышает лимит хранилища Alpha. Удалите старые записи.'));const task=this.serial.then(async()=>{await fs.mkdir(this.directory,{recursive:true});const tmp=account.file+'.'+randomUUID();try{await fs.writeFile(tmp,await this.encrypt(clear),{mode:0o600,flag:'wx'});await fs.rename(tmp,account.file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}});this.serial=task.catch(()=>{});return task;}
 changed(root){this.revision++;this.onChange(root);}
 async record(root,track){const clean=trackData(track);if(!clean)return;const account=await this.account(root);if(!account.data.historyEnabled)return;account.data.history=[{track:clean,at:this.now()},...account.data.history.filter(item=>item.track.key!==clean.key)].slice(0,500);await this.save(account);this.changed(root);}
 async samplePlayback(root,track,state){if(!validRoot(root)||!trackData(track)){this.sample=null;return;}const now=this.now(),id=root+':'+track.key;let sample=this.sample;if(!sample||sample.id!==id)this.sample=sample={id,lastTime:now,lastPosition:state.currentTime||0,played:0,recorded:false,playing:false};const wall=Math.max(0,(now-sample.lastTime)/1000),delta=(state.currentTime||0)-sample.lastPosition;
  if(sample.playing&&state.playing&&wall<=5&&delta>=0&&delta<=wall+1)sample.played+=Math.min(delta,wall);sample.lastTime=now;sample.lastPosition=state.currentTime||0;sample.playing=state.playing&&!state.buffering;
  if(!sample.recorded&&sample.played>=.5){sample.recorded=true;await this.record(root,track);}
 }
 async visit(root,playlist){const item=playlistData(playlist);if(!item)return;const account=await this.account(root);account.data.visits=[{...item,at:this.now()},...account.data.visits.filter(p=>p.vkId!==item.vkId)].slice(0,30);await this.save(account);this.changed(root);}
 async pin(root,playlist){const item=playlistData(playlist);if(!item)throw Error('Откройте плейлист или альбом снова');const account=await this.account(root),found=account.data.pins.some(p=>p.vkId===item.vkId);account.data.pins=account.data.pins.filter(p=>p.vkId!==item.vkId);if(!found){if(account.data.pins.length>=100)throw Error('Можно закрепить до 100 списков');account.data.pins.push({...item,at:this.now()});}await this.save(account);this.changed(root);return!found;}
 async history(root,command){const account=await this.account(root);if(command.action==='history-enabled'){if(typeof command.enabled!=='boolean')throw Error('Некорректная настройка истории');account.data.historyEnabled=command.enabled;this.sample=null;}else if(command.action==='history-clear'){account.data.history=[];this.sample=null;}else throw Error('Некорректная команда');await this.save(account);this.changed(root);}
 async close(){await this.serial;}
}
module.exports={PersonalLibrary,trackData,playlistData,validRoot,normalize};
