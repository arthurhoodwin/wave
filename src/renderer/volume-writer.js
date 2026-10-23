'use strict';
class VolumeWriter{
 constructor({send,onUpdate=()=>{},onError=()=>{},interval=32}){Object.assign(this,{send,onUpdate,onError,interval});this.pending=false;this.version=0;this.target=.5;this.lastSent=0;this.waiters=[];}
 set(value){if(!Number.isFinite(value))return;this.target=Math.max(0,Math.min(1,value));this.version++;this.onUpdate(this.target,true);this.pump();}
 pump(){if(this.pending)return;const delay=Math.max(0,this.interval-(Date.now()-this.lastSent));if(delay){if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.pump();},delay);return;}clearTimeout(this.timer);this.timer=null;const version=this.version,value=this.target;this.pending=true;this.lastSent=Date.now();Promise.resolve().then(()=>this.send(value)).then(result=>{if(!Number.isFinite(result?.volume))throw Error('Плеер не подтвердил громкость. Повторите изменение.');}).catch(error=>{if(version===this.version&&!/Выбран другой трек/.test(error.message))this.onError(error);}).finally(()=>{this.pending=false;if(version!==this.version){this.pump();return;}this.onUpdate(this.target,false);for(const done of this.waiters.splice(0))done();});}
 idle(){if(!this.pending&&!this.timer)return Promise.resolve();return new Promise(r=>this.waiters.push(r));}
}
if(typeof module==='object'&&module.exports)module.exports={VolumeWriter};else window.VolumeWriter=VolumeWriter;
