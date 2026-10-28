'use strict';
class VolumeWriter{
 constructor({send,onUpdate=()=>{},onError=()=>{},interval=32}){Object.assign(this,{send,onUpdate,onError,interval});this.pending=false;this.version=0;this.target=.5;this.lastSent=0;this.waiters=[];}
 set(value){if(!Number.isFinite(value))return;this.target=Math.max(0,Math.min(1,value));this.version++;this.onUpdate(this.target,true);this.pump();}
 pump(){if(this.pending)return;const delay=Math.max(0,this.interval-(Date.now()-this.lastSent));if(delay){if(!this.timer)this.timer=setTimeout(()=>{this.timer=null;this.pump();},delay);return;}clearTimeout(this.timer);this.timer=null;const version=this.version,value=this.target;this.pending=true;this.lastSent=Date.now();Promise.resolve().then(()=>this.send(value)).then(result=>{if(!Number.isFinite(result?.volume))throw Error('Плеер не подтвердил громкость. Повторите изменение.');}).catch(error=>{if(version===this.version&&!/Выбран другой трек/.test(error.message))this.onError(error);}).finally(()=>{this.pending=false;if(version!==this.version){this.pump();return;}this.onUpdate(this.target,false);for(const done of this.waiters.splice(0))done();});}
 idle(){if(!this.pending&&!this.timer)return Promise.resolve();return new Promise(r=>this.waiters.push(r));}
}
if(typeof module==='object'&&module.exports)module.exports={VolumeWriter};else window.VolumeWriter=VolumeWriter;

if(typeof window!=='undefined')(()=>{
 for(const [inputId,outputId] of [['volume','volume-value'],['song-volume','song-volume-value']]){
  const input=document.getElementById(inputId),output=document.getElementById(outputId);if(!input||!output)continue;
  const track=document.createElement('span');track.className='volume-track';input.before(track);track.append(input,output);input.style.width='100%';input.style.minWidth='0';input.style.flex='1 1 auto';output.classList.add('volume-bubble','hidden');output.setAttribute('aria-hidden','true');let dragging=false,timer;
  const hide=()=>{clearTimeout(timer);output.classList.add('hidden');};
  const position=()=>{const min=Number(input.min)||0,max=Number(input.max)||1,part=Math.max(0,Math.min(1,(Number(input.value)-min)/(max-min||1))),width=input.clientWidth;output.textContent=Math.round(part*100)+'%';output.style.left=(7+Math.max(0,width-14)*part)+'px';};
  const show=()=>{clearTimeout(timer);position();output.classList.remove('hidden');};
  input.addEventListener('pointerdown',()=>{dragging=true;show();});input.addEventListener('input',()=>{show();if(!dragging)timer=setTimeout(hide,700);});
  const finish=()=>{if(dragging){dragging=false;hide();}};window.addEventListener('pointerup',finish);window.addEventListener('pointercancel',finish);input.addEventListener('blur',()=>{dragging=false;hide();});window.addEventListener('resize',()=>{if(!output.classList.contains('hidden'))position();});
 }
})();
