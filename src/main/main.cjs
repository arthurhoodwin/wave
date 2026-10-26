'use strict';
require('./stdio-guard.cjs').installStdioGuard();
const releaseVersion=require('../../package.json').releaseVersion||require('../../package.json').version;
const electron=require('electron');const {app,BrowserWindow,ipcMain,safeStorage,dialog}=electron;
const path=require('node:path');
const {CdpEngine,ElectronEngine}=require('./engines.cjs');
const {VkProvider}=require('./provider.cjs');
const {MetadataStore}=require('./metadata-store.cjs');
const {VkHttpClient}=require('./vk-http.cjs');
const {HybridProxy}=require('./local-media.cjs');
const {NativePlayer}=require('./native-player.cjs');
const {UpdateManager}=require('./updates/update-manager.cjs');
app.setPath('userData',path.join(app.getPath('appData'),'wave-vk-research-client'));
app.setAppUserModelId('app.wave.vk');
let engine,playEngine,provider,main,vkWindow,windows,updater,health,personal,downloads,personalService;
const diagnostics=new (require('./diagnostics.cjs').Diagnostics)();
if(!app.requestSingleInstanceLock())app.exit(0);
app.on('second-instance',()=>{if(main&&!main.isDestroyed()){if(main.isMinimized())main.restore();main.show();main.focus();}});
function createVkWindow(){
 const w=new BrowserWindow({width:1100,height:850,show:false,title:'Вход в VK — Wave',autoHideMenuBar:true,webPreferences:{partition:'persist:wave-vk',contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 w.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 w.webContents.on('will-navigate',(e,url)=>{try{const host=new URL(url).hostname;if(!/^(?:vk\.ru|vk\.com|(?:id|login)\.vk\.(?:ru|com))$/.test(host))e.preventDefault();}catch{e.preventDefault();}});
 w.on('close',e=>{if(!app.isQuitting){e.preventDefault();provider?.cancelLogin();w.hide();}});
 return w;
}
app.whenReady().then(async()=>{
  main=new BrowserWindow({width:1440,height:950,minWidth:1100,minHeight:720,title:'Wave',titleBarStyle:'hidden',titleBarOverlay:{color:'#0b0c0d',symbolColor:'#f5f6f5',height:32},icon:path.join(__dirname,'../../assets/icons/wave.ico'),backgroundColor:'#0b0c0d',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'../preload/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  require('./mouse-navigation.cjs').attachMouseNavigation(main);
  main.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  main.webContents.on('will-navigate',e=>e.preventDefault());
  if(process.argv.includes('--research-session')){engine=new CdpEngine();}
  else{
    vkWindow=createVkWindow();engine=new ElectronEngine(vkWindow,createVkWindow);
  }
  let network,player;
  if(vkWindow){const request=(url,options)=>vkWindow.webContents.session.fetch(url,options);network=new VkHttpClient({fetch:request,onState:state=>provider?.transportState(state)});const proxy=new HybridProxy({fetch:request,locate:(root,key)=>downloads.locate(root,key),getRoot:()=>provider?.root});player=new NativePlayer({api:network,proxy,proxyFactory:()=>new HybridProxy({fetch:request,locate:(root,key)=>downloads.locate(root,key),getRoot:()=>provider?.root}),send:command=>{if(!main||main.isDestroyed())return false;main.webContents.send('music:playback-command',command);return true;},onState:state=>{if(provider?.root&&player?.current)personal?.samplePlayback(provider.root,player.current,state).catch(()=>{});if(state.error)diagnostics.record({kind:player?.streamFailure||'media'});if(main&&!main.isDestroyed())main.webContents.send('music:player-state',state);}});playEngine=engine;}else playEngine=await engine.fork();
  const store=new MetadataStore({directory:path.join(app.getPath('userData'),'metadata-v1'),encrypt:bytes=>{if(!safeStorage.isEncryptionAvailable())throw Error('Encryption unavailable');return safeStorage.encryptString(bytes.toString('utf8'));},decrypt:bytes=>Buffer.from(safeStorage.decryptString(bytes),'utf8')});
  provider=new VkProvider(engine,playEngine,{store,network,player,onOperations:operations=>{if(main&&!main.isDestroyed())main.webContents.send('music:operations',operations);},onSession:state=>{if(state.accountChanged||state.state==='signedOut'){downloads?.switchAccount();if(personal)personal.sample=null;}if(state.accountChanged)windows?.clear().catch(()=>{});if(main&&!main.isDestroyed())main.webContents.send('music:session',state);}});
  provider.clearSession=async()=>{if(!vkWindow)throw Error('Выход недоступен в исследовательском режиме');vkWindow.hide();await vkWindow.loadURL('about:blank');await vkWindow.webContents.session.clearStorageData();await vkWindow.webContents.session.clearCache();};
  const fs=require('node:fs/promises'),logoutMarker=path.join(app.getPath('userData'),'signed-out');
  provider.beforeLogout=async()=>{downloads?.switchAccount();if(personal)personal.sample=null;await fs.mkdir(app.getPath('userData'),{recursive:true});await fs.writeFile(logoutMarker,'signed-out\n');await windows?.clear();};
  provider.afterLogin=()=>fs.rm(logoutMarker,{force:true});
  const signedOut=!!vkWindow&&await fs.stat(logoutMarker).then(()=>true,()=>false);
  if(signedOut){await network.suspend();provider.setSession({state:'signedOut',cached:false,verifying:false,nativePlayback:true});}else await provider.restore();
  const announce=root=>{if(root===provider.root&&!main.isDestroyed())main.webContents.send('personal:changed',{});};
  personal=new (require('./personal-library.cjs').PersonalLibrary)({directory:path.join(app.getPath('userData'),'personal-v1'),encrypt:text=>{if(!safeStorage.isEncryptionAvailable())throw Error('Хранилище Windows недоступно');return safeStorage.encryptString(text);},decrypt:bytes=>safeStorage.decryptString(bytes),onChange:announce});
  provider.onAlbumMetadata=change=>personal.updateAlbum(change.root,change.keys,change.album);
  if(network){downloads=new (require('./downloads/download-manager.cjs').DownloadManager)({library:personal,convertArtwork:bytes=>electron.nativeImage.createFromBuffer(bytes).toJPEG(90),resolve:(key,options)=>network.resolveAudio(key,options),fetch:(url,options)=>vkWindow.webContents.session.fetch(url,options),getRoot:()=>provider.root,defaultDirectory:path.join(app.getPath('music'),'Wave'),validate:input=>require('./downloads/download-validator.cjs').validateDownload(input,electron),onChange:announce});
   player.api={resolveAudio:async(key,options)=>{const root=provider.root,local=await downloads.locate(root,key);if(root!==provider.root)throw Error('Аккаунт изменился');if(local)return{format:'audio',url:'wave-local:'+key};return network.resolveAudio(key,options);}};
   require('./downloads/download-preferences.cjs').attachDownloadPreferences({provider,library:personal,downloads,notice:text=>main.webContents.send('personal:download-notice',text)});
   provider.hasLocal=async key=>(await downloads.locate(provider.root,key))?.record;
   personalService=new (require('./personal-service.cjs').PersonalService)({library:personal,downloads,provider,chooseFolder:async()=>{const picked=await dialog.showOpenDialog(main,{title:'Папка для новых загрузок Wave',properties:['openDirectory','createDirectory']});return picked.canceled?null:picked.filePaths[0];}});
   ipcMain.handle('personal:request',async(event,command)=>{if(event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame)throw Error('Недопустимый источник');try{return await personalService.handle(command);}catch(error){return{ok:false,error:{message:/token|cookie|https?:/i.test(error.message)?'Не удалось обновить личную медиатеку. Повторите действие.':String(error.message)}};}});
  }
  ipcMain.handle('links:request',(event,command)=>{
   if(event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||!command||typeof command!=='object'||Array.isArray(command))throw Error('Недопустимая команда ссылки');
   const links=require('./music-links.cjs');
   try{if(command.action==='resolve'&&Object.keys(command).every(k=>['action','url'].includes(k)))return links.resolveMusicLink(provider,command.url);
    if(command.action==='copy'&&Object.keys(command).every(k=>['action','kind','id'].includes(k)))return links.copyMusicLink(provider,command,text=>electron.clipboard.writeText(text));
    throw Error('Некорректная команда ссылки');
   }catch{return{ok:false,error:{message:command.action==='copy'?'Не удалось скопировать ссылку. Откройте музыку снова.':'Не удалось открыть музыкальную ссылку. Проверьте адрес и подключение к VK.'}};}
  });
  const allowed=['collectionDetails','playlistDetails','musicLink','prepareTrack','transitionTrack','discardPrepared','trackAlbum','batchPreview','batchExecute','batchCancel','cancelLyrics','searchPage','cancelSearch','status','lyrics','account','login','logout','switchAccount','library','playlist','playlistCache','artist','mutate','operations','more','search','play','pause','resume','seek','player','volume'];
  for(const method of allowed)ipcMain.handle(`music:${method}`,async(e,...args)=>{
    if(e.sender!==main.webContents||e.senderFrame!==main.webContents.mainFrame)throw Error('Недопустимый источник команды');
    try{if(!provider)throw Error('VK ещё не готов');if(method==='playlist'){if(args.length>2||(args.length===2&&typeof args[1]!=='boolean'))throw Error('Некорректная команда');}else if(!['login','status'].includes(method)&&args.length>1)throw Error('Некорректная команда');return await provider[method](...args);}catch(err){diagnostics.record(err);const message=String(err?.message||'Ошибка VK');return{ok:false,error:{...(Number.isSafeInteger(err.code)?{code:err.code}:{}),kind:require('./diagnostics.cjs').errorKind(err),...(err.kind==='unavailable'?{unavailableIds:err.unavailableIds}:{}),message:/token|cookie|https?:\/\//i.test(message)?'Ошибка подключения к VK. Повторите действие.':message}};}
  });
  if(player)ipcMain.on('music:media-event',(event,data)=>{if(!main||main.isDestroyed()||event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame)return;player.accept(data);});
  ipcMain.handle('lyrics:open',async(event,url)=>{if(event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame)throw Error('Недопустимый источник');let u;try{u=new URL(url);}catch{throw Error('Некорректная ссылка');}if(u.protocol!=='https:'||u.username||u.password||!(['genius.com','lrclib.net','api.lyrics.ovh'].includes(u.hostname)))throw Error('Недопустимый источник текста');await electron.shell.openExternal(u.href);return true;});
  ipcMain.handle('diagnostics:export',async(event,data)=>{if(event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||!data||typeof data.enabled!=='boolean'||Object.keys(data).some(k=>k!=='enabled'))throw Error('Недопустимая команда');try{const choice=await dialog.showSaveDialog(main,{title:'Сохранить диагностику Wave',defaultPath:'Wave-diagnostics.json',filters:[{name:'JSON',extensions:['json']}]});if(choice.canceled||!choice.filePath)return{canceled:true};const report=diagnostics.report({version:releaseVersion,electron:process.versions.electron,stats:network?.stats,player,equalizer:data});await require('node:fs/promises').writeFile(choice.filePath,JSON.stringify(report,null,2)+'\n','utf8');return{saved:true};}catch{return{ok:false,error:{message:'Не удалось сохранить диагностику. Выберите другую папку и повторите.'}};}});
  const updates=new UpdateManager({directory:path.join(app.getPath('userData'),'updates-v1'),version:releaseVersion,installed:app.isPackaged,installDirectory:path.dirname(app.getPath('exe')),publicKey:require('node:fs').readFileSync(path.join(__dirname,'../../build/update-public.pem'),'utf8'),currentInstaller:path.join(process.env.LOCALAPPDATA||app.getPath('appData'),'Wave','installers',app.getVersion()+'.exe'),encrypt:text=>safeStorage.encryptString(text),decrypt:bytes=>safeStorage.decryptString(bytes),launch:async({file,sha512,kind})=>{
   await require('./updates/installer-launch.cjs').launchInstaller({file,sha512,kind,outcome:path.join(app.getPath('userData'),'updates-v1','last-install.json'),installDirectory:path.dirname(app.getPath('exe')),helper:app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','build','windows','apply-update.ps1'):path.join(__dirname,'../../build/windows/apply-update.ps1')});setTimeout(()=>app.quit(),300);
  }});
  health=new (require('./updates/startup-health.cjs').StartupHealth)(path.join(app.getPath('userData'),'updates-v1'),releaseVersion);const unclean=await health.start().catch(()=>false);updater=new (require('./updates/github-updater.cjs').GithubUpdater)({manager:updates,onChange:value=>{if(!main.isDestroyed())main.webContents.send('updates:progress',value);}});
  const updateReady=updates.rememberCurrent();
  for(const method of ['status','choose','install','rollback','check','download','cancel'])ipcMain.handle('updates:'+method,async(event,...args)=>{if(event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||args.length)throw Error('Недопустимая команда');try{await updateReady;if(method==='status'){await updates.readOutcome();return{...updates.status(),online:updater.public(),unclean};}if(method==='check'){await updater.check();return{...updates.status(),online:updater.public(),unclean};}if(method==='download'){await updater.download();return{...updates.status(),online:updater.public(),unclean};}if(method==='cancel'){updater.cancel();return{...updates.status(),online:updater.public(),unclean};}if(method==='choose'){const picked=await dialog.showOpenDialog(main,{title:'Выберите обновление Wave',properties:['openFile'],filters:[{name:'Обновление Wave',extensions:['waveupdate']}]});return picked.canceled?updates.status():await updates.stage(picked.filePaths[0]);}const answer=await dialog.showMessageBox(main,{type:'question',buttons:['Отмена',method==='rollback'?'Откатить':'Установить'],defaultId:0,cancelId:0,title:'Wave',message:method==='rollback'?'Установить предыдущую сохранённую версию Wave?':'Установить проверенное обновление Wave?',detail:'Приложение закроется. Вход и коллекция сохранятся.'});return answer.response===1?await updates.install(method==='rollback'):updates.status();}catch(error){return{ok:false,error:{message:String(error.message||'Не удалось установить обновление')}};}});
  windows=new (require('./windows-integration.cjs').WindowsIntegration)({electron,main,provider,player,directory:path.join(app.getPath('userData'),'desktop-v1')});await windows.init();
  let folderSerial=Promise.resolve();provider.onPlaylistRemoved=async(root,keys)=>{const task=folderSerial.then(async()=>{await personalService?.serial;return require('./collection-management.cjs').cleanupReferences({personal,store:windows.store,provider},root,keys);});folderSerial=task.catch(()=>{});return task;};ipcMain.handle('folders:request',(event,command)=>{if(event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame)throw Error('Недопустимый источник');const job=folderSerial.then(()=>require('./library-folders.cjs').folderRequest(windows.store,provider,command));folderSerial=job.catch(()=>{});return job.catch(e=>({ok:false,error:{message:/token|cookie|https?:/i.test(String(e.message))?'Не удалось изменить папки. Повторите действие.':String(e.message)}}));});
  let historySerial=Promise.resolve();ipcMain.handle('history:request',(event,command)=>{if(event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame)throw Error('Недопустимый источник');const job=historySerial.then(()=>require('./search-history.cjs').historyRequest(windows.store,provider,command));historySerial=job.catch(()=>{});return job.catch(()=>({ok:false,error:{message:'Не удалось обновить историю. Повторите попытку.'}}));});
  const mainSender=event=>event.sender===main.webContents&&event.senderFrame===main.webContents.mainFrame;
  const desktopSender=event=>mainSender(event)||(windows.mini&&!windows.mini.isDestroyed()&&event.sender===windows.mini.webContents&&event.senderFrame===windows.mini.webContents.mainFrame);
  ipcMain.on('desktop:state',(event,data)=>{if(mainSender(event))windows.update(data);});
  ipcMain.handle('desktop:request',async(event,method,data)=>{if(!desktopSender(event))throw Error('Недопустимый источник команды');try{if(method==='status')return windows.public();if(method==='fullscreen'){if(!mainSender(event)||typeof data!=='boolean')throw Error('Некорректная команда экрана');main.setFullScreen(data);return windows.public();}if(method==='volume')return windows.volume(data);if(method==='fitMini'){if(!windows.mini||event.sender!==windows.mini.webContents)throw Error('Недопустимый источник');windows.fitMini(data);return true;}if(method==='action'){if(!data||typeof data.type!=='string')throw Error('Некорректная команда');await windows.action(data.type,{time:data.time});return windows.public();}if(method==='sleep'){if(data==='end'&&!windows.view.current)throw Error('Сначала выберите песню');await windows.sleep.set(data);return windows.public();}if(!mainSender(event))throw Error('Недопустимая команда мини-плеера');if(method==='configure')return windows.configure(data);if(method==='ended'){await windows.sleep.ended();return windows.public();}if(method==='restore')return windows.restore();throw Error('Недопустимая команда');}catch(error){return{ok:false,error:{message:String(error.message||'Ошибка Windows')}};}});
  await main.loadFile(path.join(__dirname,'../renderer/index.html'));main.show();
  if(!signedOut)provider.startSession(network?network.connect():engine.init());
  main.on('closed',()=>app.quit());
});
app.on('window-all-closed',()=>app.quit());
let cleanedUp=false;
app.on('before-quit',event=>{
 if(cleanedUp)return;
 event.preventDefault();if(app.isQuitting)return;app.isQuitting=true;
 (async()=>{try{if(provider?.active)await provider.pause();}catch{}updater?.cancel();provider?.preferenceController?.abort();await provider?.aliasRepairTask;await personalService?.serial;await provider?.autoLikeTask;await provider?.likedOrderTask;await downloads?.close();await provider?.albumMetadataTask;await provider?.mutationSerial;await personal?.close();await windows?.close();await provider?.close();await health?.clean().catch(()=>{});await Promise.allSettled([engine?.close(),playEngine?.close()]);cleanedUp=true;app.quit();})();
});

