'use strict';
const electron=require('electron');const {app,BrowserWindow,ipcMain,safeStorage,dialog}=electron;
const path=require('node:path');
const {CdpEngine,ElectronEngine}=require('./engines.cjs');
const {VkProvider}=require('./provider.cjs');
const {MetadataStore}=require('./metadata-store.cjs');
const {VkHttpClient}=require('./vk-http.cjs');
const {MediaProxy}=require('./media-proxy.cjs');
const {NativePlayer}=require('./native-player.cjs');
const {UpdateManager}=require('./update-manager.cjs');
app.setPath('userData',path.join(app.getPath('appData'),'wave-vk-research-client'));
app.setAppUserModelId('app.wave.vk');
let engine,playEngine,provider,main,vkWindow,windows;
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
  main=new BrowserWindow({width:1440,height:950,minWidth:1100,minHeight:720,title:'Wave',titleBarStyle:'hidden',titleBarOverlay:{color:'#080a09',symbolColor:'#f5f6f5',height:32},icon:path.join(__dirname,'../../assets/icons/wave.ico'),backgroundColor:'#080a09',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'../preload/preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  main.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  main.webContents.on('will-navigate',e=>e.preventDefault());
  if(process.argv.includes('--research-session')){engine=new CdpEngine();}
  else{
    vkWindow=createVkWindow();engine=new ElectronEngine(vkWindow,createVkWindow);
  }
  let network,player;
  if(vkWindow){const request=(url,options)=>vkWindow.webContents.session.fetch(url,options);network=new VkHttpClient({fetch:request,onState:state=>provider?.transportState(state)});const proxy=new MediaProxy({fetch:request});player=new NativePlayer({api:network,proxy,send:command=>{if(!main||main.isDestroyed())return false;main.webContents.send('music:playback-command',command);return true;},onState:state=>{if(state.error)diagnostics.record({kind:player?.streamFailure||'media'});if(main&&!main.isDestroyed())main.webContents.send('music:player-state',state);}});playEngine=engine;}else playEngine=await engine.fork();
  const store=new MetadataStore({directory:path.join(app.getPath('userData'),'metadata-v1'),encrypt:bytes=>{if(!safeStorage.isEncryptionAvailable())throw Error('Encryption unavailable');return safeStorage.encryptString(bytes.toString('utf8'));},decrypt:bytes=>Buffer.from(safeStorage.decryptString(bytes),'utf8')});
  provider=new VkProvider(engine,playEngine,{store,network,player,onOperations:operations=>{if(main&&!main.isDestroyed())main.webContents.send('music:operations',operations);},onSession:state=>{if(state.accountChanged)windows?.clear().catch(()=>{});if(main&&!main.isDestroyed())main.webContents.send('music:session',state);}});
  provider.clearSession=async()=>{if(!vkWindow)throw Error('Выход недоступен в исследовательском режиме');vkWindow.hide();await vkWindow.loadURL('about:blank');await vkWindow.webContents.session.clearStorageData();await vkWindow.webContents.session.clearCache();};
  const fs=require('node:fs/promises'),logoutMarker=path.join(app.getPath('userData'),'signed-out');
  provider.beforeLogout=async()=>{await fs.mkdir(app.getPath('userData'),{recursive:true});await fs.writeFile(logoutMarker,'signed-out\n');await windows?.clear();};
  provider.afterLogin=()=>fs.rm(logoutMarker,{force:true});
  const signedOut=!!vkWindow&&await fs.stat(logoutMarker).then(()=>true,()=>false);
  if(signedOut){await network.suspend();provider.setSession({state:'signedOut',cached:false,verifying:false,nativePlayback:true});}else await provider.restore();
  const allowed=['status','lyrics','account','login','logout','switchAccount','library','playlist','playlistCache','artist','mutate','operations','more','search','play','pause','resume','seek','player','volume'];
  for(const method of allowed)ipcMain.handle(`music:${method}`,async(e,...args)=>{
    if(e.sender!==main.webContents||e.senderFrame!==main.webContents.mainFrame)throw Error('Недопустимый источник команды');
    try{if(!provider)throw Error('VK ещё не готов');if(method==='playlist'){if(args.length>2||(args.length===2&&typeof args[1]!=='boolean'))throw Error('Некорректная команда');}else if(!['login','status'].includes(method)&&args.length>1)throw Error('Некорректная команда');return await provider[method](...args);}catch(err){diagnostics.record(err);const message=String(err?.message||'Ошибка VK');return{ok:false,error:{...(Number.isSafeInteger(err.code)?{code:err.code}:{}),kind:require('./diagnostics.cjs').errorKind(err),...(err.kind==='unavailable'?{unavailableIds:err.unavailableIds}:{}),message:/token|cookie|https?:\/\//i.test(message)?'Ошибка подключения к VK. Повторите действие.':message}};}
  });
  if(player)ipcMain.on('music:media-event',(event,data)=>{if(!main||main.isDestroyed()||event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame)return;player.accept(data);});
  ipcMain.handle('diagnostics:export',async(event,data)=>{if(event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||!data||typeof data.enabled!=='boolean'||Object.keys(data).some(k=>k!=='enabled'))throw Error('Недопустимая команда');try{const choice=await dialog.showSaveDialog(main,{title:'Сохранить диагностику Wave',defaultPath:'Wave-diagnostics.json',filters:[{name:'JSON',extensions:['json']}]});if(choice.canceled||!choice.filePath)return{canceled:true};const report=diagnostics.report({version:app.getVersion(),electron:process.versions.electron,stats:network?.stats,player,equalizer:data});await require('node:fs/promises').writeFile(choice.filePath,JSON.stringify(report,null,2)+'\n','utf8');return{saved:true};}catch{return{ok:false,error:{message:'Не удалось сохранить диагностику. Выберите другую папку и повторите.'}};}});
  const updates=new UpdateManager({directory:path.join(app.getPath('userData'),'updates-v1'),version:app.getVersion(),installed:app.isPackaged,publicKey:require('node:fs').readFileSync(path.join(__dirname,'../../build/update-public.pem'),'utf8'),currentInstaller:path.join(process.env.LOCALAPPDATA||app.getPath('appData'),'Wave','installers',app.getVersion()+'.exe'),encrypt:text=>safeStorage.encryptString(text),decrypt:bytes=>safeStorage.decryptString(bytes),launch:async({file,sha512})=>{
   await require('./installer-launch.cjs').launchInstaller({file,sha512,installDirectory:path.dirname(app.getPath('exe')),helper:app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','build','windows','apply-update.ps1'):path.join(__dirname,'../../build/windows/apply-update.ps1')});setTimeout(()=>app.quit(),300);
  }});
  const updateReady=updates.rememberCurrent();
  for(const method of ['status','choose','install','rollback'])ipcMain.handle('updates:'+method,async(event,...args)=>{if(event.sender!==main.webContents||event.senderFrame!==main.webContents.mainFrame||args.length)throw Error('Недопустимая команда');try{await updateReady;if(method==='status'){await updates.readOutcome();return updates.status();}if(method==='choose'){const picked=await dialog.showOpenDialog(main,{title:'Выберите обновление Wave',properties:['openFile'],filters:[{name:'Обновление Wave',extensions:['waveupdate']}]});return picked.canceled?updates.status():await updates.stage(picked.filePaths[0]);}const answer=await dialog.showMessageBox(main,{type:'question',buttons:['Отмена',method==='rollback'?'Откатить':'Установить'],defaultId:0,cancelId:0,title:'Wave',message:method==='rollback'?'Установить предыдущую сохранённую версию Wave?':'Установить проверенное обновление Wave?',detail:'Приложение закроется. Вход и коллекция сохранятся.'});return answer.response===1?await updates.install(method==='rollback'):updates.status();}catch(error){return{ok:false,error:{message:String(error.message||'Не удалось установить обновление')}};}});
  windows=new (require('./windows-integration.cjs').WindowsIntegration)({electron,main,provider,player,directory:path.join(app.getPath('userData'),'desktop-v1')});await windows.init();
  const mainSender=event=>event.sender===main.webContents&&event.senderFrame===main.webContents.mainFrame;
  const desktopSender=event=>mainSender(event)||(windows.mini&&!windows.mini.isDestroyed()&&event.sender===windows.mini.webContents&&event.senderFrame===windows.mini.webContents.mainFrame);
  ipcMain.on('desktop:state',(event,data)=>{if(mainSender(event))windows.update(data);});
  ipcMain.handle('desktop:request',async(event,method,data)=>{if(!desktopSender(event))throw Error('Недопустимый источник команды');try{if(method==='status')return windows.public();if(method==='action'){if(!data||typeof data.type!=='string')throw Error('Некорректная команда');await windows.action(data.type,{time:data.time});return windows.public();}if(!mainSender(event))throw Error('Недопустимая команда мини-плеера');if(method==='configure')return windows.configure(data);if(method==='sleep'){if(data==='end'&&!windows.view.current)throw Error('Сначала выберите песню');await windows.sleep.set(data);return windows.public();}if(method==='ended'){await windows.sleep.ended();return windows.public();}if(method==='restore')return windows.restore();throw Error('Недопустимая команда');}catch(error){return{ok:false,error:{message:String(error.message||'Ошибка Windows')}};}});
  await main.loadFile(path.join(__dirname,'../renderer/index.html'));main.show();
  if(!signedOut)provider.startSession(network?network.connect():engine.init());
  main.on('closed',()=>app.quit());
});
app.on('window-all-closed',()=>app.quit());
let cleanedUp=false;
app.on('before-quit',event=>{
 if(cleanedUp)return;
 event.preventDefault();if(app.isQuitting)return;app.isQuitting=true;
 (async()=>{try{if(provider?.active)await provider.pause();}catch{}await windows?.close();await provider?.close();await Promise.allSettled([engine?.close(),playEngine?.close()]);cleanedUp=true;app.quit();})();
});

