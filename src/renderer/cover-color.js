'use strict';
((root,factory)=>{
 const dominant=factory();
 if(typeof module==='object'&&module.exports)module.exports={dominant};
 else root.WaveCoverColor={dominant};
})(globalThis,()=>function dominant(pixels,bgra=false){
 const bins=new Map();
 for(let index=0;index+3<pixels.length;index+=4){
  if(pixels[index+3]<128)continue;
  const r=pixels[index+(bgra?2:0)],g=pixels[index+1],b=pixels[index+(bgra?0:2)];
  if(Math.max(r,g,b)<20||Math.min(r,g,b)>235)continue;
  const key=(r>>5)*64+(g>>5)*8+(b>>5);
  const bin=bins.get(key)||{count:0,r:0,g:0,b:0};
  bin.count++;bin.r+=r;bin.g+=g;bin.b+=b;
  bins.set(key,bin);
 }
 let winner;
 for(const bin of bins.values())if(!winner||bin.count>winner.count)winner=bin;
 return winner?[winner.r,winner.g,winner.b].map(sum=>Math.round(sum/winner.count)):null;
});
