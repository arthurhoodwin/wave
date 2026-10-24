'use strict';
const kinds=new Set(['network','auth','access','unavailable','expired','unsupported-host','media','timeout','cancelled','unknown']);
const errorKind=e=>kinds.has(e?.kind)?e.kind:'unknown';
class Diagnostics{
 constructor(){this.started=Date.now();this.events=[];}
 record(error){if(errorKind(error)==='cancelled')return;this.events.push({elapsedSeconds:Math.floor((Date.now()-this.started)/1000),kind:errorKind(error)});if(this.events.length>30)this.events.shift();}
 report({version,electron,stats,player,equalizer}={}){const count=x=>Number.isSafeInteger(x)&&x>=0?Math.min(x,10000000):0;return{schema:1,version:/^\d+\.\d+\.\d+(?:\.\d+){0,2}$/.test(version)?version:'unknown',electron:/^\d+\.\d+\.\d+$/.test(electron)?electron:'unknown',platform:process.platform,arch:process.arch,uptimeSeconds:Math.floor((Date.now()-this.started)/1000),network:{requests:count(stats?.requests),refreshes:count(stats?.refreshes),retries:count(stats?.retries)},playback:{playing:player?.last?.playing===true,loading:player?.loading===true,failed:player?.failed===true},equalizer:{enabled:equalizer?.enabled===true},events:this.events.map(e=>({...e}))};}
}
module.exports={Diagnostics,errorKind};
