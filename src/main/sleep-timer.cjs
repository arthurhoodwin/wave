'use strict';
class SleepTimer{
 constructor({pause,onChange=()=>{},now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}){Object.assign(this,{pause,onChange,now,setTimer,clearTimer});this.mode='off';this.deadline=0;this.epoch=0;}
 state(){return{mode:this.mode,deadline:this.deadline};}
 async set(value){if(value!=='off'&&value!=='end'&&(!Number.isInteger(value)||value<1||value>180))throw Error('Выберите таймер от 1 до 180 минут');this.clearTimer(this.timer);this.epoch++;this.mode=typeof value==='number'?'time':value;this.deadline=this.mode==='time'?this.now()+value*60000:0;if(this.deadline){const epoch=this.epoch;this.timer=this.setTimer(()=>{if(epoch===this.epoch)this.fire();},Math.max(0,this.deadline-this.now()));this.timer?.unref?.();}this.onChange(this.state());return this.state();}
 async fire(){if(this.mode==='off')return;this.clearTimer(this.timer);this.mode='off';this.deadline=0;this.epoch++;this.onChange(this.state());await this.pause();}
 async resume(){if(this.mode==='time'&&this.deadline<=this.now())await this.fire();}
 async ended(){if(this.mode!=='end')return false;await this.fire();return true;}
 close(){this.clearTimer(this.timer);this.epoch++;}
}
module.exports={SleepTimer};
