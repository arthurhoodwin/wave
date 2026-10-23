'use strict';
class CdpEngine {
  constructor(options={}){this.targetId=options.targetId||'0D8D6ADF38B09DCB04892B831F678B96';this.owned=!!options.owned;}
  async init() {
    const targets = await (await fetch('http://127.0.0.1:9336/json/list')).json();
    const target = targets.find(t => t.id === this.targetId && /^https:\/\/(?:vk|id\.vk)\.ru\//.test(t.url));
    if (!target) throw Error('Исследовательская вкладка VK недоступна. Запустите обычный режим и войдите через VK.');
    this.socket = new WebSocket(target.webSocketDebuggerUrl); this.pending = new Map(); this.seq = 0;
    await new Promise((r,j) => { this.socket.addEventListener('open',r,{once:true});this.socket.addEventListener('error',j,{once:true}); });
    this.socket.addEventListener('message',e=>{const m=JSON.parse(e.data);const p=this.pending.get(m.id);if(p){this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}});
    this.socket.addEventListener('close',()=>{for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('Соединение с VK закрыто'));}this.pending.clear();});
  }
  call(method,params={}) {return new Promise((resolve,reject)=>{const id=++this.seq;const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('VK не ответил вовремя'));},20000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}));});}
  async evaluate(expression) {const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error('Не удалось прочитать музыкальную страницу VK');return r.result.value;}
  async navigate(url) {
    checkUrl(url);await this.show();const before=await this.evaluate('performance.timeOrigin');
    await this.call('Page.navigate',{url});const end=Date.now()+20000;
    while(Date.now()<end){try{const ready=await this.evaluate(`performance.timeOrigin!==${before}&&document.readyState==='complete'`);if(ready)return;}catch{}await new Promise(r=>setTimeout(r,150));}
    throw Error('Загрузка страницы VK заняла слишком много времени');
  }
  show() {return this.call('Page.bringToFront');}
  cancelNavigation(){this.call('Page.stopLoading').catch(()=>{});}
  async fork(){const t=await(await fetch('http://127.0.0.1:9336/json/new?https://vk.ru/audio',{method:'PUT'})).json();const e=new CdpEngine({targetId:t.id,owned:true});await e.init();return e;}
  async close(){this.socket?.close();if(this.owned)await fetch(`http://127.0.0.1:9336/json/close/${this.targetId}`).catch(()=>{});}
}
function checkUrl(url){const u=new URL(url);if(u.origin!=='https://vk.ru')throw Error('Недопустимый адрес музыкальной страницы');}
class ElectronEngine {
  constructor(window,createWindow){this.window=window;this.createWindow=createWindow;}
  async init(){await this.window.loadURL('https://vk.ru/audio');}
  async evaluate(expression){if(this.window.isDestroyed())throw Error('Окно VK закрыто');const current=this.window.webContents.getURL();if(!current)return null;const u=new URL(current);if(u.origin!=='https://vk.ru')return null;return this.window.webContents.executeJavaScript(expression,true);}
  async navigate(url){checkUrl(url);await this.window.loadURL(url);}
  show(){this.window.show();this.window.focus();}
  hide(){this.window.hide();}
  cancelNavigation(){if(!this.window.isDestroyed())this.window.webContents.stop();}
  async fork(){return new ElectronEngine(this.createWindow(),this.createWindow);}
  close(){if(!this.window.isDestroyed())this.window.destroy();}
}
module.exports={CdpEngine,ElectronEngine};
