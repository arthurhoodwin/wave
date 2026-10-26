'use strict';
const {contextBridge}=require('electron');const listeners=new Set();let value={current:{id:'one',title:'Первая песня',artist:'Исполнитель'},playing:false,busy:false,canPrevious:true,canNext:true,canLike:true,liked:false,likeBusy:false,shuffle:false,repeat:'off',volume:.5,position:0,duration:180,sleep:{mode:'off'}};
contextBridge.exposeInMainWorld('miniFixture',{set(next){value={...value,...next};for(const fn of listeners)fn(value);}});
contextBridge.exposeInMainWorld('desktop',{status:async()=>value,onState:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},action:async()=>({ok:true}),volume:async()=>({ok:true}),fit:async()=>({ok:true})});
