'use strict';

const {observeOutsideClick}=require('./island-outside-click.cjs');

const DEFAULT_SHORTCUT = 'Ctrl+Shift+F9';
const COLLAPSED_HEIGHT = 36;
const COLLAPSED_WIDTH = 248;
const EXPANDED_WIDTH = 342;
const EXPANDED_HEIGHT = 198;
const SETTLE_TIMEOUT = 600;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

function shortcut(value) {
  if (typeof value !== 'string') return null;
  const parts = value.trim().split('+').map(part => part.trim().toUpperCase());
  const key = parts.pop();
  const accepted = new Set(parts);
  if (!/^(?:[A-Z0-9]|F(?:[1-9]|1[0-2]))$/.test(key || '') ||
      accepted.size !== parts.length || !parts.every(part => ['CTRL','ALT','SHIFT'].includes(part)) ||
      !(accepted.has('CTRL') || accepted.has('ALT'))) return null;
  return ['Ctrl','Alt','Shift'].filter(part => accepted.has(part.toUpperCase())).concat(key).join('+');
}

function position(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return {x:clamp(value.x,0,1), y:clamp(value.y,0,1)};
}

function bounds(area, location, expanded, height = EXPANDED_HEIGHT) {
  const margin = Math.min(6, Math.floor(Math.min(area.width,area.height)/10));
  const left = area.x + margin, top = area.y + margin;
  const workWidth = Math.max(1,area.width - margin*2), workHeight = Math.max(1,area.height - margin*2);
  const narrow = Math.min(workWidth,COLLAPSED_WIDTH), short = Math.min(workHeight,COLLAPSED_HEIGHT);
  const {x,y} = location || {x:.5,y:0};
  const baseX = left + x * (workWidth - narrow), baseY = top + y * (workHeight - short);
  const width = expanded ? Math.min(workWidth,EXPANDED_WIDTH) : narrow;
  const h = expanded ? Math.min(workHeight, height) : short;
  const targetY = baseY + h > top + workHeight ? baseY + short - h : baseY;
  return {
    x:Math.round(clamp(baseX - (width-narrow)/2,left,left+workWidth-width)),
    y:Math.round(clamp(targetY,top,top+workHeight-h)),
    width,
    height:h
  };
}

function fold(compact, canvas) {
  return {
    top:clamp((compact.y-canvas.y)/canvas.height,0,1),
    right:clamp((canvas.x+canvas.width-compact.x-compact.width)/canvas.width,0,1),
    bottom:clamp((canvas.y+canvas.height-compact.y-compact.height)/canvas.height,0,1),
    left:clamp((compact.x-canvas.x)/canvas.width,0,1)
  };
}

function relative(area, box) {
  const margin = Math.min(6, Math.floor(Math.min(area.width,area.height)/10));
  return position({
    x:(box.x-area.x-margin)/Math.max(1,area.width-margin*2-box.width),
    y:(box.y-area.y-margin)/Math.max(1,area.height-margin*2-box.height)
  });
}

class MiniIsland {
  constructor(owner,{watchOutside=observeOutsideClick}={}) {
    this.owner = owner;
    this.watchOutside=watchOutside;
    this.expanded = false;
    this.wide = false;
    this.motionId = 0;
    this.height = EXPANDED_HEIGHT;
    this.onScreen = () => {this.place();owner.publish();};
    this.onFocus = () => this.hide();
    this.onBlur = () => this.syncVisibility();
    this.onBackground = () => {
      if(this.expanded||this.wide)this.hide();
      this.syncVisibility();
    };
  }

  get prefs() { return this.owner.prefs; }
  get mini() { const mini=this.owner.mini;return mini&&!mini.isDestroyed()?mini:null; }

  start() {
    const {screen} = this.owner.electron;
    if (!screen) return;
    for (const event of ['display-added','display-removed','display-metrics-changed']) screen.on?.(event,this.onScreen);
    this.register(this.prefs.islandShortcut);
    this.owner.main?.on?.('focus',this.onFocus);
    this.owner.main?.on?.('blur',this.onBlur);
    this.owner.main?.on?.('restore',this.onBlur);
    this.owner.main?.on?.('show',this.onBlur);
    this.owner.main?.on?.('minimize',this.onBackground);
    this.owner.main?.on?.('hide',this.onBackground);
    this.syncVisibility();
  }

  register(candidate) {
    const driver = this.owner.electron.globalShortcut;
    if (!driver) return false;
    if (candidate === this.registered) return true;
    try {
      if (!driver.register(candidate,() => this.toggle().catch(() => {}))) return false;
    } catch { return false; }
    if (this.registered) driver.unregister(this.registered);
    this.registered = candidate;
    return true;
  }

  display() {
    const {screen} = this.owner.electron;
    return screen.getAllDisplays().find(item => String(item.id) === this.prefs.islandDisplay) || screen.getPrimaryDisplay();
  }

  state() {
    const {screen} = this.owner.electron;
    return {
      expanded:this.expanded&&this.wide,
      visible:!!this.mini?.isVisible?.(),
      settling:this.closing?this.motionId:null,
      fold:this.fold||null,
      shortcut:this.prefs.islandShortcut,
      shortcutActive:!!this.registered,
      displays:screen?.getAllDisplays?.().map((display,index)=>({
        id:String(display.id),label:display.label||'Экран '+(index+1),
        primary:display.id===screen.getPrimaryDisplay().id
      })) || []
    };
  }

  layout() {
    const area=this.display().workArea;
    const compact=bounds(area,this.prefs.islandPosition,false);
    const expanded=bounds(area,this.prefs.islandPosition,true,this.height);
    return {compact,expanded};
  }

  place() {
    if (!this.mini || this.mini.isDestroyed()) return;
    const {compact,expanded}=this.layout();
    const next=this.wide?expanded:compact;
    this.fold=this.wide?fold(compact,expanded):null;
    if(this.placed&&Object.keys(next).every(key=>next[key]===this.placed[key]))return;
    this.placed=next;
    this.mini.setBounds(next,false);
  }

  mainFocused() {
    const main=this.owner.main;
    return !!main?.isFocused?.()&&main.isVisible?.()!==false&&!main.isMinimized?.();
  }

  shouldShow() {
    return !this.closed&&!this.owner.electron.app?.isQuitting&&!!this.prefs.islandEnabled&&!this.mainFocused();
  }

  syncVisibility() {
    if(this.shouldShow())this.show().catch(()=>{});
    else this.hide();
  }

  hide() {
    this.stopOutside();
    this.motionId++;
    clearTimeout(this.closing);
    this.closing=null;
    this.expanded=false;
    this.wide=false;
    if(this.mini&&!this.mini.isDestroyed()){
      this.mini.hide();
      this.place();
    }
    this.owner.publish();
  }

  fit(height) {
    if (!Number.isFinite(height) || height < 36 || height > 720) throw Error('Некорректная высота мини-плеера');
    if (!this.expanded || !this.mini || !this.wide) return;
    const next=Math.ceil(height*(this.mini.webContents.getZoomFactor?.()||1));
    if(next===this.height)return;
    this.height=next;
    this.place();
    this.owner.publish();
  }

  async configure(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
        Object.keys(input).some(key=>!['shortcut','display','reset','enabled'].includes(key))) throw Error('Некорректная настройка мини-плеера');
    const settings = {...this.prefs};
    if (input.shortcut !== undefined) {
      const value=shortcut(input.shortcut);
      if(!value)throw Error('Введите сочетание Ctrl или Alt с буквой, цифрой или клавишей F1–F12');
      settings.islandShortcut=value;
    }
    if (input.display !== undefined) {
      if (typeof input.display!=='string'||(input.display&&!this.state().displays.some(item=>item.id===input.display))) throw Error('Экран недоступен');
      settings.islandDisplay=input.display;
    }
    if (input.reset === true) settings.islandPosition=null;
    if (input.enabled !== undefined) {
      if (typeof input.enabled!=='boolean') throw Error('Некорректное состояние мини-плеера');
      settings.islandEnabled=input.enabled;
    }
    const previous=this.prefs;
    if (input.shortcut !== undefined && !this.register(settings.islandShortcut)) throw Error('Это сочетание уже используется. Выберите другое.');
    this.owner.prefs=settings;
    try { await this.owner.store.save('preferences',settings); }
    catch (error) {this.owner.prefs=previous;if(input.shortcut!==undefined)this.register(previous.islandShortcut);throw error;}
    if(input.enabled!==undefined){
      if(this.shouldShow())await this.show();
      else this.hide();
    }
    this.place();
    this.owner.publish();
    return this.owner.public();
  }

  async show() {
    if(!this.shouldShow()||this.expanded||this.mini?.isVisible?.())return;
    const mini=await this.create();
    if(!this.shouldShow()||this.expanded||mini.isVisible())return;
    const motion=this.motionId;
    await mini.webContents.executeJavaScript('window.WaveIslandMotion.reset()');
    if(!this.shouldShow()||this.expanded||motion!==this.motionId)return;
    this.place();
    mini.showInactive();
    this.owner.publish();
  }

  async toggle() {
    if(this.closed||this.owner.electron.app?.isQuitting||this.mainFocused())return;
    if (!this.prefs.islandEnabled) {
      this.owner.prefs={...this.prefs,islandEnabled:true};
      await this.owner.store.save('preferences',this.prefs);
    }
    if(!this.shouldShow())return;
    if(this.expanded){this.collapse();return;}
    const motion=++this.motionId;
    clearTimeout(this.closing);
    this.closing=null;
    this.expanded=true;
    try{
      const mini=await this.create();
      if(!this.shouldShow()||motion!==this.motionId)return;
      if(!this.wide){
        const {compact,expanded}=this.layout();
        await mini.webContents.executeJavaScript('window.WaveIslandMotion.prepare('+JSON.stringify(fold(compact,expanded))+')');
        if(!this.shouldShow()||motion!==this.motionId)return;
        this.wide=true;
        this.place();
      }
      if(!mini.isVisible())mini.showInactive();
      this.stopWatchingOutside=this.watchOutside(this.owner.electron.app,mini,()=>{
        if(motion===this.motionId&&this.expanded)this.collapse();
      });
      this.owner.publish();
    }catch(error){
      if(motion===this.motionId){this.hide();this.syncVisibility();}
      throw error;
    }
  }

  stopOutside() {
    this.stopWatchingOutside?.();
    this.stopWatchingOutside=null;
  }

  collapse() {
    if(!this.expanded)return;
    this.stopOutside();
    const motion=++this.motionId;
    this.expanded=false;
    if(this.wide)this.closing=setTimeout(()=>this.settle(motion),SETTLE_TIMEOUT);
    else this.syncVisibility();
    this.owner.publish();
  }

  settle(motion) {
    if(!this.closing||motion!==this.motionId||this.expanded)return;
    clearTimeout(this.closing);
    this.closing=null;
    this.wide=false;
    this.place();
    this.owner.publish();
  }

  create() {
    if (this.creating) return this.creating;
    if (this.mini && !this.mini.isDestroyed()) return Promise.resolve(this.mini);
    const task = this.openWindow();
    this.creating=task;
    return task.finally(()=>{if(this.creating===task)this.creating=null;});
  }

  async openWindow() {
    const {BrowserWindow,app,screen}=this.owner.electron;
    const mini=this.owner.mini=new BrowserWindow({
      ...bounds(this.display().workArea,this.prefs.islandPosition,false),
      show:false,frame:false,resizable:false,maximizable:false,minimizable:false,fullscreenable:false,
      skipTaskbar:true,alwaysOnTop:true,transparent:true,hasShadow:false,backgroundColor:'#00000000',title:'Wave · Мини-плеер',
      webPreferences:{preload:require('node:path').join(__dirname,'../preload/mini-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}
    });
    mini.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    mini.webContents.on('will-navigate',event=>event.preventDefault());
    mini.on('close',event=>{
      if(app.isQuitting)return;
      event.preventDefault();
      this.configure({enabled:false}).catch(()=>{mini.hide();this.owner.publish();});
    });
    mini.on('move',()=>{
      if(this.expanded||this.wide||mini.isDestroyed()||!mini.isVisible())return;
      const box=mini.getBounds();
      if(Math.abs(box.x-this.placed?.x)<=2&&Math.abs(box.y-this.placed?.y)<=2)return;
      this.placed=box;
      const display=screen.getDisplayMatching(box);
      this.owner.prefs={...this.prefs,islandDisplay:String(display.id),islandPosition:relative(display.workArea,box)};
      clearTimeout(this.moveTimer);
      this.moveTimer=setTimeout(()=>this.owner.store.save('preferences',this.prefs).catch(()=>{}),180);
    });
    try{await mini.loadFile(require('node:path').join(__dirname,'../renderer/mini.html'));}
    catch(error){mini.destroy();throw error;}
    return mini;
  }

  async close() {
    this.stopOutside();
    this.closed=true;
    this.motionId++;
    clearTimeout(this.closing);
    this.owner.main?.removeListener?.('focus',this.onFocus);
    for(const event of ['blur','restore','show'])this.owner.main?.removeListener?.(event,this.onBlur);
    for(const event of ['minimize','hide'])this.owner.main?.removeListener?.(event,this.onBackground);
    const {screen,globalShortcut}=this.owner.electron;
    for (const event of ['display-added','display-removed','display-metrics-changed']) screen?.removeListener?.(event,this.onScreen);
    if (this.registered) globalShortcut?.unregister(this.registered);
    if (this.moveTimer) {
      clearTimeout(this.moveTimer);
      await this.owner.store.save('preferences',this.prefs).catch(()=>{});
    }
  }
}

module.exports={MiniIsland,DEFAULT_SHORTCUT,shortcut,position,bounds,relative,fold};
