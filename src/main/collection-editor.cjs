'use strict';
const catalog=require('./catalog.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// These functions run inside a dedicated VK page. Only metadata leaves that page.
async function openEditor(options){
 const wait=async fn=>{const end=Date.now()+14000;while(Date.now()<end){const v=fn();if(v)return v;await new Promise(r=>setTimeout(r,120));}throw Error('VK не открыл редактор плейлиста');};
 await wait(()=>window.vk?.id&&document.readyState==='complete');
 if('/audios'+window.vk.id!==options.accountRoot)throw Error('Аккаунт VK изменился. Обновите медиатеку');
 window.__waveCollectionTempBefore=new Set(typeof window.getAudioPlayer==='function'?Object.values(window.getAudioPlayer()._playlists||{}).map(p=>p.getId?.()):[]);
 if(options.direct){const [owner,id]=options.vkId?options.vkId.split('_').map(Number):[Number(window.vk.id),0];window.AudioUtils.editPlaylist(owner,id);}
 else{const button=await wait(()=>document.querySelector(options.create?'[data-testid="AudioCatalogAddPlaylistAction"]':'[data-testid="MusicPlaylistModal"] [data-testid="Action_Edit"]'));button.click();}
 await wait(()=>document.querySelector('#ape_pl_name'));
 if(!options.create)await wait(()=>document.querySelector('#ape_pl_name')?.value.trim());
 const base=options.create?null:Object.values(window.getAudioPlayer()._playlists||{}).find(p=>p.getType?.()==='playlist'&&String(p.getOwnerId?.())===options.vkId.split('_')[0]&&String(p.getPlaylistId?.())===options.vkId.split('_')[1]);
 if(options.readOnly){if(options.create)return{title:'',keys:[]};if(!base||base.hasMore())throw Error('VK не загрузил полный плейлист');window.__waveCollectionTemp=base;return{title:document.querySelector('#ape_pl_name').value,keys:base.getAudiosList().map(t=>String(t[1])+'_'+t[0])};}
 const name=document.querySelector('#ape_pl_name').value;
 const temps=Object.entries(window.getAudioPlayer()._playlists||{}).filter(([,p])=>!window.__waveCollectionTempBefore.has(p.getId?.())&&p.getType?.()==='temp'&&String(p.getOwnerId?.())===options.accountRoot.slice(7)&&p.getId?.()!=='temp_'+options.vkId&&String(p.getTitle?.()||'')===name&&(options.create?p.getAudiosCount()===0:true));
 if(temps.length!==1)throw Error('Не удалось однозначно определить редактор VK');
 window.__waveCollectionTemp=temps[0][1];
 const model=window.__waveCollectionTemp;const rows=model.getAudiosList();
 if(!Array.isArray(rows)||rows.length!==model.getAudiosCount())throw Error('VK не загрузил полный плейлист');
 if(!options.create&&(!base||base.hasMore()||base.getAudiosCount()!==rows.length))throw Error('VK не загрузил полный плейлист');
 return {title:document.querySelector('#ape_pl_name').value,keys:rows.map(t=>String(t[1])+'_'+t[0])};
}
async function modifyEditor(change){
 if('/audios'+window.vk?.id!==change.accountRoot)throw Error('Аккаунт VK изменился');
 const model=window.__waveCollectionTemp;if(!model||!document.querySelector('#ape_pl_name'))throw Error('Редактор VK закрыт');
 if(change.action==='create'||change.action==='rename'){
  const input=document.querySelector('#ape_pl_name');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,change.title);input.dispatchEvent(new Event('input',{bubbles:true}));
 }else if(change.action==='remove')model.removeAudio(change.key);
 else if(change.action==='move'){
  const from=model.indexOfAudio(change.key),to=change.beforeKey===null?model.getAudiosCount():model.indexOfAudio(change.beforeKey);
  if(from<0||to<0)throw Error('Плейлист изменился. Обновите его перед перестановкой');
  model.moveAudio(from,to);
 }else if(change.action==='add'&&model.indexOfAudio(change.key)<0){
  const player=window.getAudioPlayer();for(const source of Object.values(player._playlists||{})){const cached=source.getAudio?.(change.key);if(cached){model.pushAudio(cached,0);return {title:document.querySelector('#ape_pl_name').value,keys:model.getAudiosList().map(t=>String(t[1])+'_'+t[0])};}}
  const own=player.getPlaylist(window.AudioPlaylist.TYPE_PLAYLIST,window.vk.id,window.AudioPlaylist.DEFAULT_PLAYLIST_ID);
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('VK не загрузил песни для добавления')),12000);own.load(0,()=>{clearTimeout(timeout);resolve();});});
  const plain=v=>{const n=document.createElement('textarea');n.innerHTML=String(v||'');return n.value;};
  const choose=rows=>{const exact=rows.find(t=>String(t[1])+'_'+t[0]===change.key);if(exact)return exact;const same=rows.filter(t=>plain(t[3])===change.trackTitle&&plain(t[4])===change.artist&&Number(t[5])===change.duration);if(same.length>1)throw Error('В VK несколько версий этой песни. Выберите запись из «Мне нравится»');return same[0];};
  const saved=choose(own.getAudiosList());if(saved){model.pushAudio(saved,0);return {title:document.querySelector('#ape_pl_name').value,keys:model.getAudiosList().map(t=>String(t[1])+'_'+t[0])};}
  const search=window.getAudioPlayer().getPlaylist(window.AudioPlaylist.TYPE_SEARCH,window.vk.id,Math.floor(Math.random()*1e9));search.mergeWith({searchParams:{globalQuery:change.artist+' '+change.trackTitle},hasMore:true});
  await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Поиск песни в VK занял слишком много времени')),12000);search.load(0,()=>{clearTimeout(timeout);resolve();});});
  let track=choose(search.getAudiosList());if(!track){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('VK не загрузил песни для добавления')),12000);own.loadAll(()=>{clearTimeout(timer);resolve();});});track=choose(own.getAudiosList());}
  if(!track)throw Error('VK не нашёл выбранную запись. Добавление отменено');
  model.pushAudio(track,0);
 }
 return {title:document.querySelector('#ape_pl_name').value,keys:model.getAudiosList().map(t=>String(t[1])+'_'+t[0])};
}
function editorMetadata(){
 const model=window.__waveCollectionTemp;if(!model||!document.querySelector('#ape_pl_name'))throw Error('Редактор VK закрыт');
 const text=value=>{const t=document.createElement('textarea');t.innerHTML=String(value||'');return t.value;};
 return{title:document.querySelector('#ape_pl_name').value,rows:model.getAudiosList().map((t,index)=>({index,key:String(t[1])+'_'+t[0],title:text(t[3]),artist:text(t[4]),time:Math.floor(Number(t[5]||0)/60)+':'+String(Number(t[5]||0)%60).padStart(2,'0'),available:Number(t[5])>0}))};
}
function saveEditor(accountRoot){
 if('/audios'+window.vk?.id!==accountRoot)throw Error('Аккаунт VK изменился');
 const root=document.querySelector('#ape_pl_name')?.closest('.box_layout');const save=[...root?.querySelectorAll('button')||[]].find(b=>b.textContent.trim()==='Сохранить');
 if(!save||save.disabled)throw Error('Сохранение плейлиста недоступно');save.click();return true;
}
function dismissEditor(){const input=document.querySelector('#ape_pl_name');const root=input?.closest('.box_layout');root?.querySelector('[data-testid="box_x_button"]')?.click();return !document.querySelector('#ape_pl_name');}
function createdPlaylistIds(oldIds,title){
 const ids=new Set();const plain=v=>{const n=document.createElement('textarea');n.innerHTML=String(v||'');return n.value;};
 for(const n of document.querySelectorAll('[data-testid="MusicPlaylistItem_Cell"]'))if(title===null||n.querySelector('[data-testid="MusicPlaylistItem_Title"]')?.textContent.trim()===title)ids.add(n.getAttribute('data-id'));
 const rows=window.cur?.audioPage?.getOwnerPlaylists?.()||[];for(const p of rows)if(title===null||plain(p.title)===title)ids.add(String(p.owner_id)+'_'+p.id);
 return [...ids].filter(id=>/^\d+_\d+$/.test(id)&&!oldIds.includes(id));
}
async function refreshCreatedPlaylist(oldIds,title,root){
 if('/audios'+window.vk?.id!==root)throw Error('Аккаунт VK изменился');
 if(typeof window.AudioPage?.loadPlaylists!=='function')return null;
 const owner=Number(window.vk.id);if(window.cur?.playlistsCache)delete window.cur.playlistsCache[owner+'_0'];
 const rows=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('VK не подтвердил создание плейлиста')),14000);window.AudioPage.loadPlaylists(owner,rows=>{clearTimeout(timer);resolve(rows);});});
 const text=v=>{const n=document.createElement('textarea');n.innerHTML=String(v||'');return n.value;};
 return rows.filter(p=>text(p.title)===title).map(p=>String(p.owner_id??owner)+'_'+p.id).filter(id=>/^\d+_\d+$/.test(id)&&!oldIds.includes(id));
}
async function verifyPlaylist(vkId,accountRoot){
 if('/audios'+window.vk?.id!==accountRoot)throw Error('Аккаунт VK изменился');
 const [owner,id]=vkId.split('_').map(Number);if(owner!==Number(window.vk.id))throw Error('Плейлист не принадлежит аккаунту');
 const player=window.getAudioPlayer?.();if(!player||!window.AudioPlaylist)return null;
 const model=player.getPlaylist(window.AudioPlaylist.TYPE_PLAYLIST,owner,id);model.setForceReload(true);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('VK не подтвердил сохранённый плейлист')),14000);model.loadAll(()=>{clearTimeout(timer);resolve();});});
 if(model.hasMore())throw Error('VK не вернул полный плейлист');
 const text=v=>{const n=document.createElement('textarea');n.innerHTML=String(v||'');return n.value;};
 return{title:text(model.getTitle()),owner:text(model.getAuthorName?.()),cover:model.getCoverUrl?.(),keys:model.getAudiosList().map(t=>String(t[1])+'_'+t[0]),rows:model.getAudiosList().map((t,index)=>({index,key:String(t[1])+'_'+t[0],title:text(t[3]),artist:text(t[4]),time:Math.floor(Number(t[5]||0)/60)+':'+String(Number(t[5]||0)%60).padStart(2,'0'),available:Number(t[5])>0}))};
}

async function libraryMetadata(){
 const p=window.getAudioPlayer().getPlaylist(window.AudioPlaylist.TYPE_PLAYLIST,window.vk.id,window.AudioPlaylist.DEFAULT_PLAYLIST_ID);p.setForceReload(true);
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('VK не подтвердил состав медиатеки')),14000);p.loadAll(()=>{clearTimeout(timeout);resolve();});});
 if(p.hasMore())throw Error('VK не загрузил полную медиатеку');
 const text=value=>{const n=document.createElement('textarea');n.innerHTML=String(value||'');return n.value;};
 return p.getAudiosList().map((t,index)=>({index,key:String(t[1])+'_'+t[0],title:text(t[3]),artist:text(t[4]),time:Math.floor(Number(t[5]||0)/60)+':'+String(Number(t[5]||0)%60).padStart(2,'0'),available:Number(t[5])>0}));
}
async function owningButton(track){
 const root=document.querySelector(track.scope);if(!root)return null;
 const row=[...root.querySelectorAll('[data-testid="MusicTrackRow"]')].find(n=>n.closest('[data-audio-id]')?.getAttribute('data-audio-id')===track.key);
 if(!row)return null;const wrapper=row.closest('[data-audio-id]');row.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
 await new Promise(r=>setTimeout(r,80));
 let button=wrapper.querySelector('[data-testid="MusicAudio_ToggleOwning"]');
 if(!button){const menu=wrapper.querySelector('[data-testid="MusicAudio_MenuButton"]');if(menu){menu.click();await new Promise(r=>setTimeout(r,100));button=document.querySelector('[data-testid="MusicAudio_ToggleOwning"]');}}
 if(!button)return {found:true,canChange:false};const remove=/Удалить/.test(button.textContent);const add=/Добавить/.test(button.textContent);
 if(!remove&&!add)return {found:true,canChange:false};
 if(track.desired!==undefined&&remove!==track.desired){button.click();return{found:true,canChange:true,owned:track.desired,clicked:true};}
 return {found:true,canChange:true,owned:remove,clicked:false};
}
function validateCommand(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||!['create','rename','add','remove','move','like','unlike'].includes(input.action))throw Error('Неизвестная операция');
 const allowed=new Set(['action','title','description','playlistId','trackId','beforeTrackId']);if(Object.keys(input).some(k=>!allowed.has(k)))throw Error('Некорректные параметры операции');
 const command={action:input.action};
 for(const key of ['playlistId','trackId','beforeTrackId'])if(input[key]!==undefined){if(input[key]!==null&&(typeof input[key]!=='string'||input[key].length>512))throw Error('Некорректный идентификатор');command[key]=input[key];}
 if(['create','rename'].includes(command.action)){if(typeof input.title!=='string'||!input.title.trim()||input.title.trim().length>100||/[\u0000-\u001f\u200b-\u200d\ufeff]/.test(input.title))throw Error('Название должно содержать от 1 до 100 символов');command.title=input.title.trim();}
 if(input.description!==undefined){if(command.action!=='rename'||typeof input.description!=='string'||input.description.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.description))throw Error('Описание должно содержать до 2000 символов');command.description=input.description;}
 if(['rename','add','remove','move'].includes(command.action)&&!command.playlistId)throw Error('Выберите плейлист');
 if(['add','remove','move','like','unlike'].includes(command.action)&&!command.trackId)throw Error('Выберите песню');
 if(command.action==='move'&&!Object.hasOwn(command,'beforeTrackId'))throw Error('Укажите место песни');return command;
}
class CollectionEditor{
 constructor(source){this.source=source;this.engines=new Set();this.closed=false;this.idle=null;this.knownCreated=new Set();}
 async page(){if(this.closed)throw Error('Wave закрывается');if(this.warming)await this.warming;if(this.idle){const engine=this.idle;this.idle=null;return engine;}const engine=await this.source.fork();this.engines.add(engine);return engine;}
 async release(engine,reuse){if(reuse&&!this.closed){this.idle=engine;return;}this.engines.delete(engine);if(this.idle===engine)this.idle=null;await engine.close();}
 warm(root){if(this.warming||this.idle||this.closed||this.engines.size)return this.warming;this.warming=(async()=>{const e=await this.source.fork();this.engines.add(e);try{await this.open(e,root,null,true);await e.evaluate(catalog.call(dismissEditor));if(!this.closed)this.idle=e;else{this.engines.delete(e);await e.close();}}catch{this.engines.delete(e);await e.close();}})().catch(()=>{}).finally(()=>{this.warming=null;});return this.warming;}
 async wait(engine,expression,message){const end=Date.now()+16000;while(Date.now()<end){if(this.closed)throw Error('Wave закрывается');if(await engine.evaluate(expression))return;await sleep(140);}throw Error(message);}
 route(root,vkId){if(!/^\/audios\d+$/.test(root)||vkId&&!/^\d+_\d+$/.test(vkId))throw Error('Недопустимый плейлист');if(vkId&&vkId.split('_')[0]!==root.slice(7))throw Error('Изменять можно только собственные плейлисты');return 'https://vk.ru'+root+'?section=all'+(vkId?'&z=audio_playlist'+vkId:'');}
 async open(engine,root,vkId,readOnly=false){const target=this.route(root,vkId);const ready=await engine.evaluate(`'/audios'+window.vk?.id===${JSON.stringify(root)}&&typeof window.AudioUtils?.editPlaylist==='function'&&typeof window.getAudioPlayer==='function'`);if(ready){await engine.evaluate(catalog.call(dismissEditor));return engine.evaluate(catalog.call(openEditor,{create:!vkId,accountRoot:root,vkId,readOnly,direct:true}));}const current=await engine.evaluate('location.href');if(current!==target)await engine.navigate(target);else await engine.evaluate(catalog.call(dismissEditor));return engine.evaluate(catalog.call(openEditor,{create:!vkId,accountRoot:root,vkId,readOnly}));}
 async edit(command,context,onStage=()=>{}){
  const engine=await this.page();let submitted=false,reuse=false;
  try{
   const root=context.root;let vkId=context.playlist?.vkId;
   if(command.action!=='create'&&!vkId)throw Error('Обновите медиатеку: не получен идентификатор плейлиста VK');
   const before=await this.open(engine,root,vkId);
   if(['remove','move'].includes(command.action)&&before.keys.filter(key=>key===context.track?.key).length>1)throw Error('В плейлисте несколько одинаковых записей. Измените их порядок или состав в VK');
   const oldIds=command.action==='create'?[...new Set([...await engine.evaluate(catalog.call(createdPlaylistIds,[],null)),...this.knownCreated,...(context.knownNativeIds||[])])]:[];
   const expected=await engine.evaluate(catalog.call(modifyEditor,{...command,accountRoot:root,key:context.track?.key,beforeKey:context.before?.key??null,artist:context.track?.artist,trackTitle:context.track?.title,duration:context.track?.duration}));
   if(command.action==='create'&&expected.keys.length)throw Error('Новый плейлист должен быть пустым');
   if(command.action==='move'&&expected.keys.length!==before.keys.length)throw Error('Перестановка изменила состав плейлиста');
   onStage('syncing');submitted=true;await engine.evaluate(catalog.call(saveEditor,root));
   await this.wait(engine,`!document.querySelector('#ape_pl_name')`,'VK не подтвердил сохранение. Проверьте результат перед повтором');
   if(command.action==='create'){
    let found=await engine.evaluate(catalog.call(refreshCreatedPlaylist,oldIds,command.title,root))||[];
    if(found.length===0){await sleep(150);found=await engine.evaluate(catalog.call(createdPlaylistIds,oldIds,command.title));}
    if(found.length===0){await engine.navigate(this.route(root));await this.wait(engine,`!!document.querySelector('[data-testid="AudioCatalog_SectionPlaylists"]')`,'VK не показал новый плейлист');found=await engine.evaluate(catalog.call(createdPlaylistIds,oldIds,command.title));}
    if(found.length!==1)throw Error('Не удалось однозначно подтвердить создание плейлиста');vkId=found[0];
   }
   let actual=await engine.evaluate(catalog.call(verifyPlaylist,vkId,root));
   if(!actual){await this.open(engine,root,vkId,true);actual=await engine.evaluate(catalog.call(verifyPlaylist,vkId,root));}
   if(actual.title!==expected.title||JSON.stringify(actual.keys)!==JSON.stringify(expected.keys))throw Error('Список в VK отличается от отправленного. Обновите его');
   if(command.action==='create')this.knownCreated.add(vkId);
   const sidebar=await engine.evaluate(catalog.call(catalog.collect,'[data-testid="AudioCatalog_SectionTracks"]'));await engine.evaluate(catalog.call(dismissEditor));reuse=true;
   return{vkId,title:actual.title,owner:actual.owner,cover:actual.cover,rows:actual.rows,route:this.route(root,vkId),playlists:sidebar.playlists,changed:JSON.stringify(before)!==JSON.stringify({title:actual.title,keys:actual.keys})};
  }catch(error){error.uncertain=submitted;throw error;}finally{await this.release(engine,reuse);}
 }
 async own(command,context,onStage=()=>{}){
  const engine=await this.page();let submitted=false,reuse=false;
  try{
   const track=context.track,desired=command.action==='like';await engine.navigate(track.route);
   await this.wait(engine,`document.readyState==='complete'&&!!document.querySelector(${JSON.stringify(track.scope)})`,'VK не открыл список песни');
   if(await engine.evaluate(`'/audios'+window.vk?.id`)!==context.root)throw Error('Аккаунт VK изменился');
   let found;for(let i=0;i<Math.max(20,Math.ceil((track.index||0)/20)+3);i++){found=await engine.evaluate(catalog.call(owningButton,track));if(found?.found)break;await engine.evaluate(catalog.call(catalog.scrollScope,track.scope,false));await sleep(140);}
   if(!found?.canChange)throw Error('VK не предоставил действие для этой песни');
   if(found.owned===desired){reuse=true;return{owned:desired,changed:false};}
   onStage('syncing');submitted=true;const sent=await engine.evaluate(catalog.call(owningButton,{...track,desired}));submitted=!!sent?.clicked;if(!submitted)throw Error('Не удалось отправить изменение в VK');
   // Verify membership against the complete freshly loaded library, including removal of the source row.
   await sleep(400);await this.open(engine,context.root,null,true);const rows=await engine.evaluate(catalog.call(libraryMetadata));
   const same=rows.filter(t=>t.title===track.title&&t.artist===track.artist&&t.time===track.time);if(same.length>1&&!rows.some(t=>t.key===track.key))throw Error('В медиатеке несколько версий песни. Проверьте изменение в VK');
   if((rows.some(t=>t.key===track.key)||same.length===1)!==desired)throw Error('VK не подтвердил изменение. Обновите список перед повтором');await engine.evaluate(catalog.call(dismissEditor));reuse=true;return{owned:desired,changed:true,rows,route:this.route(context.root)};
  }catch(error){error.uncertain=submitted;throw error;}finally{await this.release(engine,reuse);}
 }
 async close(){this.closed=true;await this.warming;this.idle=null;await Promise.allSettled([...this.engines].map(e=>e.close()));}
}
module.exports={CollectionEditor,validateCommand,openEditor,modifyEditor,editorMetadata,saveEditor,owningButton,libraryMetadata,verifyPlaylist,dismissEditor};
