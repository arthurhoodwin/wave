'use strict';

const DEFAULT_SHORTCUT = 'Ctrl+Shift+F9';
const COLLAPSED_HEIGHT = 36;
const COLLAPSED_WIDTH = 248;
const EXPANDED_WIDTH = 390;
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

function bounds(area, location, expanded, height = 220) {
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

function relative(area, box) {
  const margin = Math.min(6, Math.floor(Math.min(area.width,area.height)/10));
  return position({
    x:(box.x-area.x-margin)/Math.max(1,area.width-margin*2-box.width),
    y:(box.y-area.y-margin)/Math.max(1,area.height-margin*2-box.height)
  });
}

class MiniIsland {
  constructor(owner) {
    this.owner = owner;
    this.expanded = false;
    this.height = 220;
    this.onScreen = () => {this.place();owner.publish();};
  }

  get prefs() { return this.owner.prefs; }
  get mini() { return this.owner.mini; }

  start() {
    const {screen} = this.owner.electron;
    if (!screen) return;
    for (const event of ['display-added','display-removed','display-metrics-changed']) screen.on?.(event,this.onScreen);
    this.register(this.prefs.islandShortcut);
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
      expanded:this.expanded,
      shortcut:this.prefs.islandShortcut,
      shortcutActive:!!this.registered,
      displays:screen?.getAllDisplays?.().map((display,index)=>({
        id:String(display.id),label:display.label||'Экран '+(index+1),
        primary:display.id===screen.getPrimaryDisplay().id
      })) || []
    };
  }

  place() {
    if (!this.mini || this.mini.isDestroyed()) return;
    this.placed=bounds(this.display().workArea,this.prefs.islandPosition,this.expanded,this.height);
    this.mini.setBounds(this.placed,false);
  }

  fit(height) {
    if (!Number.isFinite(height) || height < 36 || height > 720) throw Error('Некорректная высота мини-плеера');
    if (!this.expanded || !this.mini) return;
    const next=Math.ceil(height*(this.mini.webContents.getZoomFactor?.()||1));
    if(next===this.height)return;
    this.height=next;
    this.place();
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
    if (input.enabled === true) await this.show();
    if (input.enabled === false) this.mini?.hide();
    this.place();
    this.owner.publish();
    return this.owner.public();
  }

  async show() {
    const mini=await this.create();
    this.place();
    mini.showInactive();
    this.owner.publish();
  }

  async toggle() {
    const mini=await this.create();
    if (!this.prefs.islandEnabled) {
      this.owner.prefs={...this.prefs,islandEnabled:true};
      await this.owner.store.save('preferences',this.prefs);
    }
    this.expanded=!this.expanded;
    this.place();
    mini.showInactive();
    this.owner.publish();
  }

  collapse() {
    this.expanded=false;
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
      skipTaskbar:true,alwaysOnTop:true,backgroundColor:'#141617',title:'Wave · Мини-плеер',
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
      if(this.expanded||mini.isDestroyed())return;
      const box=mini.getBounds();
      if(box.x===this.placed?.x&&box.y===this.placed?.y)return;
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
    const {screen,globalShortcut}=this.owner.electron;
    for (const event of ['display-added','display-removed','display-metrics-changed']) screen?.removeListener?.(event,this.onScreen);
    if (this.registered) globalShortcut?.unregister(this.registered);
    if (this.moveTimer) {
      clearTimeout(this.moveTimer);
      await this.owner.store.save('preferences',this.prefs).catch(()=>{});
    }
  }
}

module.exports={MiniIsland,DEFAULT_SHORTCUT,shortcut,position,bounds,relative};
