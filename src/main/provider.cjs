'use strict';
const {randomUUID}=require('node:crypto');
const catalog=require('./catalog.cjs');
const {PlaylistCache}=require('./playlist-cache.cjs');
const {cover,artistRoute,trackMeta}=require('./navigation-meta.cjs');
const {CollectionEditor,validateCommand}=require('./collection-editor.cjs');
const networkProvider=require('./network-provider.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const expression=fn=>`(${fn.toString()})()`;
// VK's current web build exports this singleton from module 324344.
// This is a version-dependent browser compatibility adapter, not a public VK SDK.
function playerLookup(){
 if(typeof window.getAudioPlayer==='function')return window.getAudioPlayer();
 if(typeof window.__waveGetAudioPlayer==='function')return window.__waveGetAudioPlayer();
 for(const name of ['webpackChunkvkweb','webpackChunkvkweb_legacy']){
  const chunks=window[name];if(!Array.isArray(chunks))continue;
  try{chunks.push([['wave_adapter_'+Date.now()+'_'+Math.random()],{},require=>{try{const m=require(324344);if(typeof m.getAudioPlayer==='function')window.__waveGetAudioPlayer=m.getAudioPlayer;}catch{}}]);}catch{}
  if(window.__waveGetAudioPlayer)return window.__waveGetAudioPlayer();
 }
 return null;
}
const playerScript=body=>`(()=>{const p=(${playerLookup.toString()})();if(!p)return null;${body}})()`;
class VkProvider {
  constructor(engine,playEngine=engine,options={}){this.clearSession=options.clearSession;this.network=options.network;this.nativePlayer=options.player;this.engine=engine;this.playEngine=playEngine;this.tracks=new Map();this.handles=new Map();this.playlists=new Map();this.playlistHandles=new Map();this.collection=null;this.active=null;this.root=null;this.serial=Promise.resolve();this.playSerial=Promise.resolve();this.playRequest=0;this.playPending=false;this.playNavigating=false;this.warmRequest=0;this.savedPlaylists=[];this.store=options.store;this.onSession=options.onSession||(()=>{});this.onOperations=options.onOperations||(()=>{});this.session=null;this.online=false;this.saveTimer=null;this.cache=new PlaylistCache(engine,(raw,context)=>this.absorbRows(raw,context),entry=>this.cacheChanged(entry));}
  exclusive(fn){const next=this.serial.then(fn,fn);this.serial=next.catch(()=>{});return next;}
  operations(full=true){return(this.operationLog||[]).map(operation=>{if(full)return{...operation};const {results,...summary}=operation;return{...summary,detailsAvailable:!!results};});}
  operationChanged(){this.onOperations?.(this.operations(false));}
  absorbPlaylists(rows,route,{revision=this.sidebarRevision||0}={}){
    const previous=this.savedPlaylists.slice(),incoming=[];
    for(const row of rows||[]){const signature=JSON.stringify(row.vkId?['vk',row.vkId]:[row.index,row.title,row.owner]);let id=this.playlistHandles.get(signature);
      if(!id){const matches=[...this.playlists].filter(([,p])=>row.vkId&&p.vkId===row.vkId||!p.vkId&&p.title===row.title&&p.owner===row.owner);if(matches.length===1)id=matches[0][0];}
      if(!id)id=randomUUID();this.playlistHandles.set(signature,id);const current=this.playlists.get(id);const newer=(current?.confirmedRevision||0)>revision;
      const item=newer?current:{...current,...row,kind:row.kind||current?.kind,cover:cover(row.cover)||current?.cover,owner:row.owner||current?.owner||(row.editable?'Ваш плейлист':'Плейлист VK'),route};this.playlists.set(id,item);incoming.push(this.publicPlaylist(id,item));
    }
    const seen=new Set(incoming.map(p=>p.id));const missing=previous.filter(p=>!seen.has(p.id));
    // The VK carousel is a partial viewport, never proof that a saved playlist was deleted.
    this.savedPlaylists=[...missing.filter(p=>(this.playlists.get(p.id)?.confirmedRevision||0)>revision),...incoming,...missing.filter(p=>(this.playlists.get(p.id)?.confirmedRevision||0)<=revision)];return this.savedPlaylists;
  }
  publicPlaylist(id,item){return{id,title:item.title,owner:item.owner,cover:item.cover,kind:item.kind,editable:item.editable===true};}
  playbackKey(route){try{const u=new URL(route);const z=u.searchParams.get('z')?.match(/^audio_playlist(-?\d+_\d+)/);if(z)return'playlist:'+z[1];const path=u.pathname.match(/^\/music\/(?:playlist|album)\/(-?\d+_\d+)/);if(path)return'playlist:'+path[1];return u.origin+u.pathname+u.search;}catch{return route;}}
  invalidatePlayback(route){this.playbackRevisions??=new Map();const key=this.playbackKey(route);this.playbackRevisions.set(key,(this.playbackRevisions.get(key)||0)+1);}

  applyCollectionMutation(command,result,context){
    let playlistId=command.playlistId;
    this.sidebarRevision=(this.sidebarRevision||0)+1;
    if(result.playlists)this.absorbPlaylists(result.playlists,'https://vk.ru'+this.root+'?section=all',{revision:0});
    if(command.action==='create')playlistId=[...this.playlists].find(([,p])=>p.vkId===result.vkId)?.[0];
    if(['like','unlike'].includes(command.action))playlistId='library:'+this.root;
    if(!playlistId&&result.vkId){playlistId=randomUUID();this.playlists.set(playlistId,{vkId:result.vkId,title:result.title,owner:result.owner||this.savedPlaylists.find(p=>p.editable)?.owner||'',cover:cover(result.cover),index:0,editable:true,route:'https://vk.ru'+this.root+'?section=all'});}
    if(result.vkId&&playlistId){this.playlistHandles.set(JSON.stringify(['vk',result.vkId]),playlistId);const item=this.playlists.get(playlistId);item.confirmedRevision=this.sidebarRevision;item.route=result.route||item.route;if(result.owner)item.owner=result.owner;if(cover(result.cover))item.cover=cover(result.cover);if(!this.savedPlaylists.some(p=>p.id===playlistId))this.savedPlaylists.unshift(this.publicPlaylist(playlistId,item));}
    if(result.title&&this.playlists.has(playlistId)){this.playlists.get(playlistId).title=result.title;const p=this.savedPlaylists.find(p=>p.id===playlistId);if(p)p.title=result.title;}
    if(playlistId&&this.playlists.has(playlistId))this.savedPlaylists=this.savedPlaylists.map(p=>p.id===playlistId?this.publicPlaylist(playlistId,this.playlists.get(playlistId)):p);
    let snapshot;
    if(result.acknowledged){this.ownershipRevision=(this.ownershipRevision||0)+1;if(this.ownedAccount===this.root){if(result.owned){this.ownedKeys?.add(result.sourceKey);this.ownedKeys?.add(result.libraryKey);}else{this.ownedKeys?.delete(result.sourceKey);this.ownedKeys?.delete(result.libraryKey);}}
      if(this.ownershipAliases?.root!==this.root)this.ownershipAliases={root:this.root,keys:new Map()};
      if(result.owned)this.ownershipAliases.keys.set(result.sourceKey,result.libraryKey);else for(const [key,value] of this.ownershipAliases.keys)if(key===result.sourceKey||value===result.libraryKey)this.ownershipAliases.keys.delete(key);
      const entry=this.cache.byPlaylist.get('library:'+this.root);if(entry?.cacheState==='complete'){entry.revision=(entry.revision||0)+1;entry.refreshing=false;entry.stale=true;if(result.owned){this.absorbRows({rows:[result.likedRow],route:result.route},entry);const added=[...entry.items].find(([id])=>this.tracks.get(id)?.key===result.libraryKey);if(added)entry.items=new Map([added,...[...entry.items].filter(([id])=>id!==added[0])]);}else for(const [id] of entry.items)if(this.tracks.get(id)?.key===result.libraryKey)entry.items.delete(id);entry.total=entry.items.size;snapshot=this.cache.snapshot(entry);}
      clearTimeout(this.ownershipRefreshTimer);const root=this.root;if(!result.verifiedFromLibrary)this.ownershipRefreshTimer=setTimeout(()=>{if(this.root===root&&!this.closing){const target=this.cache.byPlaylist.get('library:'+root);if(target)this.refreshCollection(target);}},250);this.ownershipRefreshTimer?.unref?.();
    }
    if(result.rows){
      const library=playlistId==='library:'+this.root;let entry=this.cache.byPlaylist.get(playlistId);
      if(!entry)entry=this.cache.create(playlistId,library?'Моя музыка':result.title,library?'library':'playlist');
      // Stop any stale refresh before publishing the verified server list.
      entry.revision=(entry.revision||0)+1;
      entry.items=new Map();entry.title=library?'Моя музыка':result.title;entry.total=result.rows.length;entry.route=result.route;entry.refreshing=false;entry.refreshError=false;entry.stale=false;entry.cacheState='complete';entry.createdAt=entry.savedAt=Date.now();
      const known=new Map([...this.tracks.values()].map(t=>[t.key,t]));const rows=result.rows.map(row=>({...row,...trackMeta(known.get(row.key)||{}),owned:library?true:known.get(row.key)?.owned}));
      this.absorbRows({rows,route:result.route,total:rows.length},entry);snapshot=this.cache.snapshot(entry);
    }
    if(['like','unlike'].includes(command.action)){for(const t of this.tracks.values())if(t.key===context.track.key)t.owned=result.owned;for(const entry of this.cache.entries.values())for(const t of entry.items.values())if(this.tracks.get(t.id)?.key===context.track.key)t.owned=result.owned;}
    if(result.route)this.invalidatePlayback(result.route);
    const ownership=['like','unlike'].includes(command.action)?require('./collection-batch.cjs').ownership(this,new Map([[context.track.key,result.owned],...(result.libraryKey?[[result.libraryKey,result.owned]]:[])])):undefined;this.scheduleSave();return{playlistId,collection:snapshot,playlists:this.savedPlaylists,playlistsRevision:this.sidebarRevision||0,owned:result.owned,ownership,changed:result.changed};
  }
  batchPreview(input){return require('./collection-batch.cjs').preview(this,input);}
  batchExecute(input){return require('./collection-batch.cjs').execute(this,input);}
  batchCancel(id){return require('./collection-batch.cjs').cancel(this,id);}
  mutate(input){
    const command=validateCommand(input);this.operationLog??=[];this.mutationSerial??=Promise.resolve();this.editor??=this.network||new CollectionEditor(this.engine);
    const playlist=this.playlists.get(command.playlistId),track=this.tracks.get(command.trackId),before=this.tracks.get(command.beforeTrackId);
    const operation={id:randomUUID(),action:command.action,title:command.title||playlist?.title||track?.title||'Коллекция',trackTitle:track?.title,state:'pending',createdAt:Date.now()};this.operationLog.push(operation);if(this.operationLog.length>50)this.operationLog.shift();this.operationChanged();
    const accountRoot=this.root;
    const job=this.mutationSerial.then(async()=>{
      const context={root:accountRoot,knownNativeIds:[...this.playlists.values()].map(p=>p.vkId).filter(Boolean),playlist:this.playlists.get(command.playlistId),track:this.tracks.get(command.trackId),before:this.tracks.get(command.beforeTrackId)};
      try{
        if(!this.online||!accountRoot||this.root!==accountRoot)throw Error('Подключитесь к своему аккаунту VK перед изменением коллекции');
        if(['rename','add','remove','move'].includes(command.action)&&(!context.playlist||context.playlist.kind==='album'||context.playlist.editable!==true))throw Error('Изменять можно только собственные плейлисты. Обновите медиатеку');
        if(['add','remove','move','like','unlike'].includes(command.action)&&!context.track)throw Error('Песня больше не найдена. Обновите список');
        if(command.action==='move'&&command.beforeTrackId!==null&&!context.before)throw Error('Место песни изменилось. Обновите плейлист');
        operation.state='running';this.operationChanged();
        if(this.network&&['like','unlike'].includes(command.action)){context.quickOwnership=true;const ownEntry=this.cache.byPlaylist.get('library:'+accountRoot);context.membershipRows=ownEntry?.cacheState==='complete'?[...ownEntry.items.keys()].map(id=>this.tracks.get(id)).filter(Boolean):[];context.membershipAlias=this.ownershipAliases?.root===accountRoot?this.ownershipAliases.keys.get(context.track.key):undefined;const library=this.cache.byPlaylist.get('library:'+accountRoot);if(library?.cacheState==='complete'&&!library.stale&&!library.refreshing&&Date.now()-library.createdAt<30000){const rows=[...library.items.keys()].map(id=>this.tracks.get(id)).filter(Boolean);if(rows.length===library.total)context.cachedLibrary={root:accountRoot,verifiedAt:library.createdAt,title:library.title,route:library.route,total:library.total,rows};}}
        const stage=state=>{operation.state=state;this.operationChanged();};
        const result=await (['like','unlike'].includes(command.action)?this.editor.own(command,context,stage):this.editor.edit(command,context,stage));
        if(this.root!==accountRoot)throw Object.assign(Error('Аккаунт изменился. Проверьте результат операции в VK'),{uncertain:true});
        const response=this.applyCollectionMutation(command,result,context);operation.state='success';operation.finishedAt=Date.now();operation.durationMs=operation.finishedAt-operation.createdAt;this.operationChanged();return{ok:true,operation:{...operation},...response};
      }catch(error){operation.state=error.uncertain?'uncertain':'error';operation.message=/https?:|token|cookie/i.test(error.message)?'Ошибка соединения с VK. Проверьте результат перед повтором':error.message;operation.finishedAt=Date.now();operation.durationMs=operation.finishedAt-operation.createdAt;this.operationChanged();return{ok:true,operation:{...operation}};}
    });this.mutationSerial=job.catch(()=>{});return job;
  }
  transportState(state){if(this.network&&!this.authTransition)networkProvider.transportState(this,state);}
  logout(){return require('./account-provider.cjs').logout(this);}
  async switchAccount(){const result=await this.logout();if(result.cleanupFailed)throw Error(result.message);return this.login();}
  cancelLogin(){this.loginAttempt=(this.loginAttempt||0)+1;}
  preparePlayback(route){
    if(this.nativePlayer)return;
    // Only prepare an idle player. Browsing must never replace or resume the
    // current song, including a paused song.
    if(this.active||this.playPending||this.playEngine===this.engine)return;
    const warm=++this.warmRequest;
    const task=this.playSerial.then(async()=>{
      if(warm!==this.warmRequest||this.active||this.playPending)return;
      await this.route(route,this.playEngine);
      if(warm!==this.warmRequest||this.active||this.playPending)return;
      await this.playEngine.evaluate(playerScript('if(!p.isPlaying())p._impl?.wake?.();return {ready:true,playing:!!p.isPlaying()};'));
    });
    this.playSerial=task.catch(()=>{});
  }
  setSession(next){const changed=JSON.stringify(this.session)!==JSON.stringify(next);this.session=next;this.online=next.state==='ready';if(changed)this.onSession(next);return next;}
  async restore(){
    const payload=await this.store?.load();
    if(payload){
      this.root=payload.accountRoot;
      for(const item of payload.playlists){this.playlists.set(item.id,item);this.playlistHandles.set(JSON.stringify(item.kind==='album'?['album',item.route,item.title,item.owner]:item.vkId?['vk',item.vkId]:[item.index,item.title,item.owner]),item.id);if(item.inLibrary===true||item.kind!=='album')this.savedPlaylists.push({id:item.id,title:item.title,owner:item.owner,cover:item.cover,kind:item.kind,editable:item.editable===true});}
      for(const item of payload.collections){
        const e=this.cache.create(item.playlistId,item.title,item.kind);e.route=item.route;e.total=item.total;e.cacheState='complete';e.stale=true;e.cover=cover(this.playlists.get(item.playlistId)?.cover);e.savedAt=payload.savedAt;e.createdAt=0;
        const occurrences=new Map();
        for(const track of item.tracks){e.items.set(track.id,{id:track.id,title:track.title,artist:track.artist,duration:track.duration,available:track.available,...trackMeta(track)});this.tracks.set(track.id,track);const key=JSON.stringify([track.key,track.title,track.artist,track.time]);const occurrence=occurrences.get(key)||0;occurrences.set(key,occurrence+1);this.handles.set(JSON.stringify([e.playlistId,e.scope,track.key,track.title,track.artist,track.time,occurrence]),track.id);}
      }
    }
    this.setSession({state:payload?'cached':'pending',cached:!!payload,verifying:true});return !!payload;
  }
  async startSession(initialization){
    try{await initialization;return await this.checkSession();}
    catch(error){if(this.network){this.transportState({kind:['network','protocol'].includes(error.kind)?'offline':'auth'});return this.session;}return this.setSession({state:this.root?'cached':'error',cached:!!this.root,verifying:false,message:this.root?'Показана сохранённая медиатека. Не удалось подключиться к VK.':'Не удалось подключиться к VK. Повторите вход.'});}
  }
  async checkSession(){
    const s=this.network?{ready:!!this.network.accountId,root:this.network.accountId?'/audios'+this.network.accountId:null}:await this.engine.evaluate(expression(()=>({ready:!!window.vk?.id,root:Number.isSafeInteger(Number(window.vk?.id))&&Number(window.vk?.id)>0?'/audios'+window.vk.id:null})));
    if(s?.ready&&/^\/audios\d+$/.test(s.root||'')){
      if(this.root&&this.root!==s.root){this.lyricsSources?.clear();this.batchPlans?.clear();this.ownedKeys?.clear();this.ownedAccount=null;if(this.runningBatch)this.runningBatch.cancelled=true;
        ++this.playRequest;++this.warmRequest;try{if(this.active)await this.pause();}catch{}
        if(this.editor!==this.network)await this.editor?.close();if(this.network){this.network.audioRefs.clear();this.network.playlistRefs.clear();await this.nativePlayer?.stop();}this.editor=null;this.operationLog=[];this.operationChanged();await this.cache.close();this.cache=new PlaylistCache(this.engine,(raw,context)=>this.absorbRows(raw,context),entry=>this.cacheChanged(entry));this.tracks.clear();this.musicLinkRefs?.clear();this.searchArtists?.clear();this.searchEntries?.clear();this.artistController?.abort();this.searchController?.abort();this.handles.clear();this.playlists.clear();this.playlistHandles.clear();this.savedPlaylists=[];this.collection=null;this.active=null;this.setSession({state:'signedOut',accountChanged:true});
      }
      this.root=s.root;if(!this.network&&typeof this.engine.fork==='function'){this.editor??=this.network||new CollectionEditor(this.engine);this.editor.warm(this.root); }const next=this.setSession({state:'ready',cached:false,verifying:false,...(this.nativePlayer?{nativePlayback:true,volume:this.nativePlayer.state().volume}:{})});const library=this.cache.byPlaylist.get('library:'+this.root);if(library?.stale)this.refreshCollection(library);return next;
    }
    return this.setSession({state:this.root?'cached':'signedOut',cached:!!this.root,verifying:false,message:this.root?'Войдите в VK для воспроизведения. Сохранённые списки доступны.':'Войдите в отдельном окне VK.'});
  }
  prepareTrack(input){if(!input||Object.keys(input).some(k=>!['id','fromId'].includes(k))||typeof input.id!=='string'||typeof input.fromId!=='string')throw Error('Некорректная подготовка');const track=this.tracks.get(input.id);if(!this.online||!this.nativePlayer||!track||!track.available)return{prepared:false};return this.nativePlayer.prepare(track,input.fromId);}
  discardPrepared(){this.nativePlayer?.dropPrepared();return true;}
  async transitionTrack(input){if(!input||Object.keys(input).some(k=>!['id','fromId','seconds'].includes(k))||typeof input.id!=='string'||typeof input.fromId!=='string'||!Number.isFinite(input.seconds)||input.seconds<0||input.seconds>12)throw Error('Некорректный переход');const track=this.tracks.get(input.id);if(!this.online||!this.nativePlayer||!track||!track.available)throw Error('Выберите доступную песню');const result=await this.nativePlayer.transition(track,input.fromId,input.seconds);if(!result.prepared)return{prepared:false};this.active={...track};return result;}
  trackAlbum(id){return require('./track-album.cjs').trackAlbum(this,id);}
  cancelLyrics(){this.lyricsSources?.cancel();return true;}
  reconcileOwnership(rows){this.ownedAccount=this.root;this.ownedKeys=new Set(rows.map(t=>t.key));if(this.ownershipAliases?.root===this.root)for(const [source,key] of this.ownershipAliases.keys)if(this.ownedKeys.has(key))this.ownedKeys.add(source);return require('./collection-batch.cjs').ownership(this,new Map([...this.tracks.values()].map(t=>[t.key,this.ownedKeys.has(t.key)])));}
  async lyrics(id){if(typeof id!=='string'||id.length>200)throw Error('Некорректная песня');const track=this.tracks.get(id);if(!track)throw Error('Откройте список песни снова.');this.lyricsSources??=new (require('./lyrics/lyrics-sources.cjs').LyricsSources)();const root=this.root;const cached=this.lyricsSources.peek(track,root);if(cached){if(this.lyricsSources.job?.key!==this.lyricsSources.key(track))this.lyricsSources.cancel();return{...cached,cached:true};}if(!this.network||!this.online)throw Error('Подключитесь к VK и повторите загрузку текста.');const result=await this.lyricsSources.get(track,root,()=>this.network.lyrics(track.key));if(this.root!==root||this.authTransition)throw Error('Аккаунт изменился');return result;}
  async account(){if(!this.network||!this.online)throw Error('Подключитесь к VK, чтобы получить профиль');return this.network.profile();}
  async status(){return this.session||this.checkSession();}
  async login(){
    if(this.network){if(this.logoutFailed)throw Error("Повторите выход для завершения очистки сеанса");if(this.loginJob)return this.loginJob;const attempt=this.loginAttempt=(this.loginAttempt||0)+1;this.loginJob=(async()=>{this.network.enable();await this.engine.show();await this.engine.init();const deadline=Date.now()+180000;while(Date.now()<deadline){if(attempt!==this.loginAttempt)throw Error('Вход отменён');try{await this.network.connect({force:true,acceptAccountChange:true});if(attempt!==this.loginAttempt)throw Error('Вход отменён');const result=await this.checkSession();await this.afterLogin?.();this.engine.hide?.();return result;}catch(e){if(!['auth','network','account-changed'].includes(e.kind))throw e;}await sleep(1500);}throw Error('Вход не завершён. Повторите вход через VK.');})();try{return await this.loginJob;}finally{this.loginJob=null;}}
    await this.engine.show();let url;try{url=await this.engine.evaluate('location.href');}catch{}if(!url)await this.engine.init();
    const deadline=Date.now()+180000;while(Date.now()<deadline){try{if((await this.checkSession()).state==='ready')return{state:'ready'};}catch{}await sleep(700);}throw Error('Вход не завершён. Нажмите «Войти через VK» снова.');
  }
  exportMetadata(){
    const visible=new Set(this.savedPlaylists.map(p=>p.id));return{version:1,accountRoot:this.root,savedAt:Date.now(),playlists:Array.from(this.playlists).filter(([id,p])=>visible.has(id)||p.kind==='album').map(([id,p])=>({id,title:p.title,owner:p.owner||'',index:p.index,route:p.route,cover:cover(p.cover),kind:p.kind,inLibrary:visible.has(id),vkId:p.vkId,editable:p.editable})),collections:Array.from(this.cache.byPlaylist.values()).filter(e=>(e.kind==='library'||visible.has(e.playlistId)||this.playlists.get(e.playlistId)?.kind==='album')&&e.cacheState==='complete'&&e.total===e.items.size).map(e=>({playlistId:e.playlistId,kind:e.kind,title:e.title,route:e.route,total:e.total,tracks:Array.from(e.items.keys()).map(id=>this.tracks.get(id)).filter(Boolean).map(t=>({id:t.id,key:t.key,title:t.title,artist:t.artist||'',time:t.time||'0:00',duration:t.duration,available:t.available,index:Number.isSafeInteger(t.index)?t.index:0,scope:t.scope,route:t.route,...trackMeta(t)}))}))};
  }
  scheduleSave(){if(!this.store||!this.root)return;clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>{this.saveTimer=null;this.store.save(this.exportMetadata()).catch(()=>{});},250);}
  cacheChanged(){this.scheduleSave();}
  refreshCollection(target){
    if(!this.online||target.refreshing)return;
    target.refreshing=true;target.stale=true;target.refreshError=false;
    this.exclusive(()=>target.kind==='library'?this.loadLibrary(true,target):this.loadPlaylist(target.playlistId,true,target)).catch(()=>{target.refreshing=false;target.refreshError=true;});
  }
  async readyRows(engine=this.engine,scope=null,cancelled=null){const end=Date.now()+12000;const script=`(()=>{const root=${scope?'document.querySelector('+JSON.stringify(scope)+')':'document'};return{loaded:document.readyState==='complete',rows:root?.querySelectorAll('[data-testid="MusicTrackRow"]').length||0,empty:!!root&&/ничего не найдено|нет аудиозаписей|плейлист пока пуст/i.test(root.body?.innerText||root.innerText||'')};})()`;
    while(Date.now()<end){if(cancelled?.())throw Error('Выбран другой трек');let r;try{r=await engine.evaluate(script);}catch{await sleep(100);continue;}if(r?.loaded&&(r.rows||r.empty))return;await sleep(100);}throw Error('VK не показал список треков. Обновите выбранный плейлист и повторите.');}

  async route(url,engine=this.engine,force=false){const current=await engine.evaluate('location.href');const key=this.playbackKey(url),revision=this.playbackRevisions?.get(key)||0;
    const stale=engine===this.playEngine&&revision>0&&(!this.playbackDocument||this.playbackDocument.key!==key||this.playbackDocument.revision<revision);
    if(force||current!==url||stale){if(engine===this.playEngine)this.playNavigating=true;try{await engine.navigate(url);await this.readyRows(engine);}finally{if(engine===this.playEngine)this.playNavigating=false;}}
    if(engine===this.playEngine)this.playbackDocument={key,revision};
  }

  async readRows(){
    const context=this.collection||{scope:'body',items:new Map(),kind:'search'};
    const raw=await this.engine.evaluate(catalog.call(catalog.collect,context.scope));
    if(!raw)throw Error('Требуется вход в VK');
    this.absorbRows(raw,context);
    const playlists=context.kind==='library'?this.absorbPlaylists(raw.playlists,raw.route,{revision:context.sidebarRevision??this.sidebarRevision??0}):[];
    return{tracks:Array.from(context.items.values()),playlists,playlistsRevision:this.sidebarRevision||0,partial:true,title:context.title};
  }
  absorbRows(raw,context){this.metadataRevision=(this.metadataRevision||0)+1;
    if(cover(raw.cover))context.cover=cover(raw.cover);
    const occurrences=new Map();
    for(const row of raw.rows){
      if(!row.key||!row.title)continue;
      const occurrenceKey=JSON.stringify([row.key,row.title,row.artist,row.time]);const occurrence=occurrences.get(occurrenceKey)||0;occurrences.set(occurrenceKey,occurrence+1);
      const signature=JSON.stringify([context.playlistId||context.cacheId||raw.route,context.scope,row.key,row.title,row.artist,row.time,context.cacheId?occurrence:0]);
      let id=this.handles.get(signature);if(!id){id=randomUUID();this.handles.set(signature,id);}
      const duration=(row.time||'').split(':').map(Number).reduce((a,b)=>a*60+b,0)||0;
      const track={id,title:row.title,artist:row.artist||'Неизвестный исполнитель',duration,available:row.available!==false&&duration>0,...trackMeta(row),owned:context.kind==='library'?true:typeof row.owned==='boolean'?row.owned:this.ownedAccount===this.root?this.ownedKeys?.has(row.key):undefined};
      this.tracks.set(id,{...row,...track,route:raw.route,scope:context.scope});context.items.set(id,track);
    }
    if(context.cacheId&&raw.total!==null&&raw.total!==undefined)context.total=raw.total;
  }
  async playlistDetails(id){const root=this.root,item=this.playlists.get(id);if(!this.network||!this.online||this.authTransition||!item||item.kind==='album'||item.editable!==true)throw Error('Изменять можно только собственный плейлист');const ref=this.network.parseIdentity(item.vkId);if(ref.owner!==this.network.accountId)throw Error('Недоступный плейлист');const epoch=this.network.accountEpoch;const result=await this.network.call('audio.getPlaylistById',{owner_id:ref.owner,playlist_id:ref.id});if(this.root!==root||this.authTransition||epoch!==this.network.accountEpoch)throw Error('Аккаунт изменился');if(result.permissions?.edit!==true)throw Error('VK не разрешил редактирование');if(typeof result.description==='string'&&result.description.length>2000)throw Error('Описание VK длиннее допустимого для редактора; оно не будет обрезано');return{title:String(result.title||'').slice(0,100),description:String(result.description||'').slice(0,2000)};}
  musicLink(id){return require('./music-links.cjs').linkedTrack(this,id);}
  library(refresh=false){
    const saved=this.cache.byPlaylist.get('library:'+this.root);
    if(saved?.cacheState==='complete'){this.collection=saved;if(this.online&&(refresh||saved.stale||Date.now()-saved.createdAt>300000))this.refreshCollection(saved);return Promise.resolve({...this.cache.snapshot(saved),version:this.cacheVersion(saved),playlists:this.savedPlaylists,playlistsRevision:this.sidebarRevision||0});}
    return this.network?this.loadLibrary(refresh):this.exclusive(()=>this.loadLibrary(refresh));
  }
  async loadLibrary(refresh=false,target=null){
    if(this.network)return networkProvider.loadLibrary(this,refresh,target);
    if((await this.status()).state!=='ready')throw Error('Войдите через VK');if(!this.root)throw Error('Не найдена музыкальная страница VK');
    const cached=!refresh&&this.cache.getFresh('library:'+this.root);if(cached){this.collection=cached;return{...this.cache.snapshot(cached),playlists:this.savedPlaylists,playlistsRevision:this.sidebarRevision||0};}
    const sidebarRevision=this.sidebarRevision||0;await this.route(`https://vk.ru${this.root}?section=all`,this.engine,refresh);await this.readyRows();
    const entry=this.cache.create('library:'+this.root,'Моя музыка','library');entry.sidebarRevision=sidebarRevision;if(target){entry.refreshTarget=target;entry.refreshRevision=target.revision||0;this.cache.byPlaylist.set(entry.playlistId,target);}this.collection=entry;
    await this.engine.evaluate(catalog.call(catalog.scrollScope,this.collection.scope,true));const first=await this.readRows();this.savedPlaylists=first.playlists;
    const route=await this.engine.evaluate('location.href');this.cache.start(entry,route);this.scheduleSave();return{...await this.cache.initial(entry),playlists:first.playlists,playlistsRevision:first.playlistsRevision};
  }
  playlist(id,refresh=false){
    const saved=this.cache.byPlaylist.get(id);
    if(saved?.cacheState==='complete'){this.collection=saved;if(this.online){this.preparePlayback(saved.route);if(refresh||saved.stale||Date.now()-saved.createdAt>300000)this.refreshCollection(saved);}return Promise.resolve(this.stampSnapshot(this.cache.snapshot(saved)));}
    return this.network?this.loadPlaylist(id,refresh):this.exclusive(()=>this.loadPlaylist(id,refresh));
  }
  async loadPlaylist(id,refresh=false,target=null){
    if(this.network)return networkProvider.loadPlaylist(this,id,refresh,target);
    if(this.session&&!this.online)throw Error('Войдите в VK для загрузки плейлиста');
    const cached=!refresh&&this.cache.getFresh(id);if(cached){this.collection=cached;this.preparePlayback(cached.route);return this.cache.initial(cached);}
    const item=this.playlists.get(id);if(!item)throw Error('Обновите медиатеку: плейлист больше не найден');
    if(item.vkId&&/^\d+_\d+$/.test(item.vkId)){
      const target='https://vk.ru'+this.root+'?section=all&z=audio_playlist'+item.vkId;await this.route(target,this.engine,refresh);const deadline=Date.now()+12000;
      while(Date.now()<deadline){if(await this.engine.evaluate(`!!document.querySelector('[data-testid="MusicPlaylistModal_Tracks"]')`))break;await sleep(100);}
      if(!await this.engine.evaluate(`!!document.querySelector('[data-testid="MusicPlaylistModal_Tracks"]')`))throw Error('VK не открыл выбранный плейлист');
    }else{
    const cellSelector=item.kind==='album'?'[data-testid="MusicPlaylistItem_Cell"]':'[data-testid="AudioCatalog_SectionPlaylists"] [data-testid="MusicPlaylistItem_Cell"]';
    const catalogPresent=item.kind!=='album'&&await this.engine.evaluate(`!!document.querySelector('[data-testid="AudioCatalog_SectionPlaylists"] [data-testid="MusicPlaylistItem_Cell"]')`);
    if(!catalogPresent)await this.route(item.route);
    else await this.engine.evaluate(`document.querySelector('[data-testid="MusicPlaylistModal_Close"]')?.click();true`);
    const clicked=await this.engine.evaluate(`(()=>{const item=${JSON.stringify(item)};const cells=Array.from(document.querySelectorAll(${JSON.stringify(cellSelector)}));let cell=cells[item.index];const matches=x=>x?.querySelector('[data-testid="MusicPlaylistItem_Title"]')?.textContent?.trim()===item.title&&(x.querySelector('[data-testid="MusicPlaylistItem_AuthorLink"]')?.textContent?.trim()||'')===item.owner;if(!matches(cell))cell=cells.find(matches);const title=cell?.querySelector('[data-testid="MusicPlaylistItem_Title"]');if(!title)return false;title.click();return true;})()`);
    if(!clicked)throw Error('Плейлист не найден на странице VK');
    const end=Date.now()+12000;let loaded=false;
    while(Date.now()<end){loaded=await this.engine.evaluate(`(()=>{const m=document.querySelector('[data-testid="MusicPlaylistModal"]');return m?.querySelector('[data-testid="MusicPlaylistModal_Title"]')?.textContent?.trim()===${JSON.stringify(item.title)}&&!!m.querySelector('[data-testid="MusicPlaylistModal_Tracks"]');})()`);if(loaded)break;await sleep(200);}
    if(!loaded)throw Error('VK не открыл выбранный плейлист');
    }
    const entry=this.cache.create(id,item.title);if(target){entry.refreshTarget=target;entry.refreshRevision=target.revision||0;this.cache.byPlaylist.set(id,target);}this.collection=entry;await this.readRows();
    // Expand the initial five-row preview in the already loaded page. Do not
    // wait behind a background library job and a duplicate page navigation.
    if(entry.items.size<Math.min(30,entry.total??30)){
      await this.engine.evaluate(catalog.call(catalog.scrollScope,entry.scope,false));
      await this.engine.evaluate(catalog.call(catalog.waitForRows,entry.scope,entry.items.size,200));
      const firstDeadline=Date.now()+2500;
      while(Date.now()<firstDeadline){await this.readRows();if(entry.items.size>=Math.min(30,entry.total??30))break;await this.engine.evaluate(catalog.call(catalog.scrollScope,entry.scope,false));await this.engine.evaluate(catalog.call(catalog.waitForRows,entry.scope,entry.items.size,200));}
    }
    const route=await this.engine.evaluate('location.href');this.preparePlayback(route);this.cache.start(entry,route);return this.cache.initial(entry);
  }
  cacheVersion(e){return JSON.stringify([this.metadataRevision||0,this.sidebarRevision||0,e.items.size,e.total,e.cacheState,e.revision||0,e.savedAt,e.refreshing,e.refreshError,e.stale]);}
  stampSnapshot(result){const entry=this.cache.entries.get(result?.cacheId);return entry?{...result,version:this.cacheVersion(entry)}:result;}
  playlistCache(input){const id=typeof input==='string'?input:input?.id;if(typeof id!=='string'||typeof input==='object'&&(Object.keys(input).some(k=>!['id','version','activate'].includes(k))||input.version!==undefined&&typeof input.version!=='string'||input.activate!==undefined&&typeof input.activate!=='boolean'))throw Error('Некорректная команда кэша');const e=this.cache.entries.get(id);if(!e)throw Error('Кэш устарел. Откройте список снова.');if(input?.activate===true)this.collection=e;if(this.online&&e.cacheState==='complete'&&!e.refreshing&&(e.stale||Date.now()-e.createdAt>300000))this.refreshCollection(e);const version=this.cacheVersion(e);if(typeof input==='object'&&input.version===version)return{unchanged:true,version};const result={...this.cache.snapshot(e),version};const item=this.playlists.get(e.playlistId);return e.kind==='library'?{...result,playlists:this.savedPlaylists,playlistsRevision:this.sidebarRevision||0}:{...result,kind:item?.kind,generated:item?.generated===true,...(item?.kind==='album'?{albumMetadata:{id:e.playlistId,title:item.title,confirmed:item.albumTitleConfirmed===true}}:{})};}

  artist(id){if(this.network){if(!this.online)return Promise.reject(Error('Подключитесь к VK'));return networkProvider.artist(this,id);}return this.exclusive(async()=>{
    if(this.network){if(!this.online)throw Error('Подключитесь к VK');return networkProvider.artist(this,id);}
    if(this.session&&!this.online)throw Error('Подключитесь к VK для открытия исполнителя');
    const request=typeof id==='string'?{trackId:id,artistIndex:0}:id;if(!request||typeof request.trackId!=='string'||!Number.isInteger(request.artistIndex)||request.artistIndex<0)throw Error('Некорректный исполнитель');const track=this.tracks.get(request.trackId);if(!track)throw Error('Список устарел. Откройте его снова.');const artist=track.artists?.[request.artistIndex]||(request.artistIndex===0?{name:track.artist,route:track.artistRoute}:null);if(!artist)throw Error('Исполнитель не найден');
    let route=artistRoute(artist.route)||'https://vk.ru/audio?performer=1&q='+encodeURIComponent(artist.name);
    await this.route(route);await this.readyRows();
    this.collection={kind:'artist',scope:'body',items:new Map()};let result=await this.readRows();
    if(!route.includes('/artist/')){const match=result.tracks.map(t=>this.tracks.get(t.id)).flatMap(t=>t?.artists||[{name:t?.artist,route:t?.artistRoute}]).find(a=>a.name===artist.name&&artistRoute(a.route)?.includes('/artist/'));if(match){route=artistRoute(match.route);await this.route(route);await this.readyRows();this.collection={kind:'artist',scope:'body',items:new Map()};result=await this.readRows();}}
    const info=await this.engine.evaluate(catalog.call(catalog.artistInfo));
    const albums=[],contributions=[];for(const row of info?.albums||[]){if(!row.title)continue;const signature=JSON.stringify(['album',route,row.title,row.owner]);let key=this.playlistHandles.get(signature);if(!key){key=randomUUID();this.playlistHandles.set(signature,key);}this.playlists.set(key,{...row,kind:'album',route,cover:cover(row.cover)});(row.section==='contribution'?contributions:albums).push({id:key,title:row.title,owner:row.owner,cover:cover(row.cover)});}
    this.preparePlayback(route);this.scheduleSave();return {...result,title:artist.name,albums,contributions,cover:cover(track.cover)};
  });}
  async close(){clearTimeout(this.ownershipRefreshTimer);this.closing=true;this.lyricsSources?.clear();for(const c of this.searchPageControllers||[])c.abort();this.artistController?.abort();this.searchController?.abort();clearTimeout(this.reconnectTimer);if(this.editor!==this.network)await this.editor?.close();await this.mutationSerial;await this.albumMetadataTask;await this.nativePlayer?.close();this.network?.close();clearTimeout(this.saveTimer);await this.cache.close();if(this.store&&this.root)await this.store.save(this.exportMetadata());await this.store?.close();}
  more(){return this.exclusive(async()=>{
    if(this.network)return networkProvider.more(this);
    if(!this.collection)throw Error('Сначала откройте медиатеку, поиск или плейлист');
    if(this.collection.cacheId)return this.cache.snapshot(this.collection);
    for(let i=0;i<3;i++){await this.readRows();await this.engine.evaluate(catalog.call(catalog.scrollScope,this.collection.scope,false));await sleep(400);}
    return this.readRows();
  });}
  searchPage(id){if(typeof id!=='string'||id.length>200||!this.online)return Promise.reject(Error('Подключитесь к VK и откройте поиск снова.'));return networkProvider.searchPage(this,id);}
  cancelSearch(){this.artistController?.abort();this.searchController?.abort();if(this.collection?.pageController&&!this.collection.items.has(this.active?.id))this.collection.pageController.abort();return{canceled:true};}
  search(input){const query=typeof input==='string'?input:input?.query;if(input&&typeof input==='object'&&(Object.keys(input).some(k=>!['query','type','refresh'].includes(k))||!['tracks','artists','albums','playlists'].includes(input.type||'tracks')||input.refresh!==undefined&&typeof input.refresh!=='boolean'))return Promise.reject(Error('Неизвестный раздел поиска'));if(this.network){if(typeof query!=='string'||!query.trim()||query.length>200)return Promise.reject(Error('Введите запрос длиной до 200 символов'));if(!this.online)return Promise.reject(Error('Подключитесь к VK'));return networkProvider.search(this,typeof input==='object'?{query:query.trim(),type:input.type||'tracks',refresh:input.refresh===true}:query.trim());}return this.exclusive(async()=>{
    if(typeof query!=='string'||!query.trim()||query.length>200)throw Error('Введите запрос длиной до 200 символов');if((await this.status()).state!=='ready')throw Error('Войдите через VK');
    if(this.network)return networkProvider.search(this,typeof input==='object'?{query:query.trim(),type:input.type||'tracks',refresh:input.refresh===true}:query.trim());
    await this.route(`https://vk.ru/audio?q=${encodeURIComponent(query.trim())}`);await this.readyRows();this.collection={kind:'search',scope:'body',items:new Map()};const result=await this.readRows();this.preparePlayback(await this.engine.evaluate('location.href'));return result;
  });}
  async play(id){
    let position=0;if(id&&typeof id==='object'){if(Object.keys(id).some(k=>!['id','position'].includes(k))||typeof id.id!=='string'||!Number.isFinite(id.position)||id.position<0||id.position>604800)return Promise.reject(Error('Некорректная позиция песни'));position=id.position;id=id.id;}
    let track=this.tracks.get(id);
    if(!track)return Promise.reject(Error('Список устарел. Обновите его.'));
    const local=await this.hasLocal?.(track.key);if(local){track={...track,available:true,local:true,duration:track.duration>0?track.duration:local.track?.duration||0};this.tracks.set(track.id,track);}
    if(track.available===false||!(track.duration>0))return Promise.reject(Error('Запись недоступна в VK'));
    if(this.session&&!this.online&&!local)throw Error('Подключитесь к VK для воспроизведения или выберите скачанную песню');
    if(this.nativePlayer){return this.nativePlayer.play(track,{position}).then(result=>{this.active={...track};return{playing:result.playing};}).catch(error=>{if(error.kind==='unavailable'){this.metadataRevision=(this.metadataRevision||0)+1;error.unavailableIds=[];for(const [trackId,t] of this.tracks)if(t.key===track.key){t.available=false;error.unavailableIds.push(trackId);for(const entry of this.cache.entries.values())if(entry.items.has(trackId))entry.items.get(trackId).available=false;}this.scheduleSave();}if(!this.nativePlayer.current||this.nativePlayer.current.id===track.id)this.active=null;throw error;});}
    if(this.playPending&&this.playNavigating)this.playEngine.cancelNavigation?.();
    const request=++this.playRequest;++this.warmRequest;this.playPending=true;
    const cancelled=()=>request!==this.playRequest;
    const assertCurrent=()=>{if(cancelled())throw Error('Выбран другой трек');};
    const task=this.playSerial.then(async()=>{
    assertCurrent();
    await this.route(track.route,this.playEngine);assertCurrent();await this.readyRows(this.playEngine,track.scope,cancelled);assertCurrent();
    const before=await this.rawPlayer();let clicked=before?.key===track.key&&before.title===track.title;
    if(clicked)await this.playEngine.evaluate(playerScript('try{p.seekToTime(0);}catch{}p.playByButton();return true;'));
    else{
      await this.playEngine.evaluate(catalog.call(catalog.scrollScope,track.scope,true));
      for(let i=0;i<Math.max(16,Math.ceil((track.index||0)/20)+3);i++){assertCurrent();clicked=await this.playEngine.evaluate(catalog.call(catalog.findAndPlay,track));if(clicked)break;await this.playEngine.evaluate(catalog.call(catalog.scrollScope,track.scope,false));await sleep(100);}
    }
    if(!clicked)throw Error('Трек больше не найден в контексте VK');
    const end=Date.now()+8000;while(Date.now()<end){assertCurrent();const state=await this.rawPlayer();if(state?.playing&&state.key===track.key){this.active={...track,actualKey:state.key,actualTitle:state.title,actualArtist:state.artist,lastTime:0,lastDuration:state.duration||track.duration};return{playing:true};}await sleep(100);}throw Error('Не удалось подтвердить запуск в VK. Повторите запуск или обновите плейлист.');
    });const result=task.finally(()=>{if(request===this.playRequest)this.playPending=false;});this.playSerial=result.catch(()=>{});return result;
  }
  async rawPlayer(){if(this.nativePlayer)return this.nativePlayer.state();return this.playEngine.evaluate(playerScript(`const a=p.getCurrentAudioData?.();const author=a?.author;const artist=Array.isArray(author)?author.map(x=>typeof x==='string'?x:x.name||x.title||'').filter(Boolean).join(', '):typeof author==='string'?author:author?.name||author?.title||'';const button=document.querySelector('[data-testid="TopAudioPlayer_TogglePlayAction"]');const label=button?((button.getAttribute('aria-label')||'')+' '+button.textContent):'';const playing=/Приостановить|Пауза|Поставить на.?паузу/i.test(label)?true:/Воспроизвести|Слушать/i.test(label)?false:!!p.isPlaying();return{key:a?String(a.ownerId)+'_'+String(a.id):'',playing,title:a?.title||'',artist,currentTime:Math.max(0,Number(p.getCurrentProgressTime())||0)/1000,duration:Number(p.getCurrentDuration())||Number(a?.duration)||0,volume:Number(p.getVolume())};`));}
  async player(){
    if(this.nativePlayer){const state=this.nativePlayer.state();return{playing:state.playing,ended:state.ended,currentTime:state.currentTime,duration:state.duration,volume:state.volume,title:state.title,artist:state.artist,buffering:state.buffering};}
    const p=await this.rawPlayer();if(!p)return{playing:false,currentTime:0,duration:0};
    const a=this.active;
    if(a){
      const switched=!!p.key&&p.key!==a.actualKey;
      const duration=switched?(a.lastDuration||a.duration):(p.duration||a.lastDuration||a.duration);
      const stoppedAtEnd=!p.playing&&duration>0&&p.currentTime>=duration-.8;
      const resetAfterEnd=!p.playing&&p.currentTime<1&&(a.lastTime||0)>=duration-2&&duration>2;
      if(a.ended||switched||stoppedAtEnd||resetAfterEnd){
        a.ended=true;if(switched)await this.pause();
        return{playing:false,ended:true,title:a.title,artist:a.artist,currentTime:duration,duration,volume:p.volume};
      }
      a.lastTime=p.currentTime;a.lastDuration=duration;
    }
    return{...p,title:a?.title||p.title,artist:a?.artist||p.artist};
  }
  async volume(value){if(this.nativePlayer){if(!Number.isFinite(value)||value<0||value>1)throw Error('Некорректная громкость');return this.nativePlayer.volume(value);}if(!Number.isFinite(value)||value<0||value>1)throw Error('Некорректная громкость');await this.playEngine.evaluate(playerScript(`p.setVolume(${value});return true;`));const p=await this.rawPlayer();if(!p||Math.abs(p.volume-value)>.03)throw Error('VK не подтвердил громкость');return{volume:p.volume};}
  async pause(){
    if(this.nativePlayer)return this.nativePlayer.pause();
    // Use the page's active control when present: VK may install its React
    // transport after the legacy singleton was prepared.
    const clicked=await this.playEngine.evaluate(`(()=>{const buttons=[...document.querySelectorAll('[data-testid="audio-player-controls-state-button"]'),...document.querySelectorAll('[data-testid="TopAudioPlayer_TogglePlayAction"]')];const button=buttons.find(b=>/Приостановить|Пауза|Поставить на.?паузу/i.test((b.getAttribute('aria-label')||'')+' '+b.textContent));if(!button)return false;button.click();return true;})()`);
    if(!clicked)await this.playEngine.evaluate(playerScript('p.pause();return true;'));
    const end=Date.now()+3000;while(Date.now()<end){const p=await this.rawPlayer();if(p&&!p.playing)return{playing:false};await sleep(100);}throw Error('VK не подтвердил паузу');
  }
  async resume(){if(this.nativePlayer)return this.nativePlayer.resume();if(!this.active)throw Error('Сначала выберите трек');const clicked=await this.playEngine.evaluate(`(()=>{const buttons=[...document.querySelectorAll('[data-testid="audio-player-controls-state-button"]'),...document.querySelectorAll('[data-testid="TopAudioPlayer_TogglePlayAction"]')];const b=buttons.find(x=>/Слушать|Воспроизвести/i.test((x.getAttribute('aria-label')||'')+' '+x.textContent));if(!b)return false;b.click();return true;})()`);if(!clicked)await this.playEngine.evaluate(playerScript('p.playByButton();return true;'));const end=Date.now()+5000;while(Date.now()<end){const p=await this.rawPlayer();if(p?.playing)return{playing:true};await sleep(200);}throw Error('VK не подтвердил продолжение');}
  async seek(seconds){if(this.nativePlayer){if(!Number.isFinite(seconds)||seconds<0)throw Error('Некорректная позиция');return this.nativePlayer.seek(seconds);}if(!this.active||!Number.isFinite(seconds)||seconds<0)throw Error('Некорректная позиция');const p=await this.rawPlayer();if(!p?.duration||seconds>p.duration)throw Error('Позиция вне записи');await this.playEngine.evaluate(playerScript(`try{p.seekToTime(${seconds});}catch{}return true;`));await sleep(350);const after=await this.rawPlayer();if(Math.abs(after.currentTime-seconds)>4)throw Error('VK не подтвердил перемотку');return{currentTime:after.currentTime};}
}
module.exports={VkProvider};


