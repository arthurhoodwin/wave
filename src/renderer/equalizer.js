'use strict';
((root,factory)=>{const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else{root.WaveEqualizer=api;const engine=api.create(root.AudioContext||root.webkitAudioContext);let settings;try{settings=api.load(root.localStorage);}catch{settings=api.normalize();}engine.set(settings);root.waveAudio=engine;}})(globalThis,()=>{
 const legacyFrequencies = [60,170,350,1000,3500,10000];
 const legacyTen = [60,100,170,350,600,1000,2000,3500,6000,10000];
 const previousBands = [31.5,63,125,250,500,1000,2000,4000,8000,16000];
 const frequencies = [63,160,400,1000,3200,10000];
 const storageKey = 'wave-equalizer-v3';
 const Q = 0.95;
 const factoryPresets={flat:[0,0,0,0,0,0,0,0,0,0],bass:[7,6,4,1,0,-1,-1,0,0,0],vocal:[-5,-4,-3,-1,1,3,4,3,1,-2],soft:[0,0,1,1,0,-1,-2,-3,-4,-6],warm:[3,4,3,1,0,-1,-2,-2,-3,-3],bright:[-2,-2,-1,0,0,1,2,3,5,5],rock:[4,3,1,-2,-1,1,3,4,3,3],pop:[-1,0,1,3,4,3,1,0,1,2],electronic:[6,5,3,0,-2,-1,1,3,4,5],acoustic:[0,1,2,2,1,0,2,3,2,1],jazz:[2,1,0,-1,0,1,2,2,3,2],classical:[0,1,0,0,-1,0,1,2,2,3],speech:[-8,-6,-4,-2,1,4,5,3,0,-4],night:[-5,-4,-2,0,2,2,0,-2,-4,-6],bassSoft:[3,3,2,1,0,0,0,0,0,0]};
 const clamp=v=>Math.max(-12,Math.min(12,Number.isFinite(v)?v:0));
 function interpolate(source,gains){const values=source.map((_,i)=>clamp(gains[i]));return frequencies.map(f=>{if(f<=source[0])return values[0];if(f>=source.at(-1))return values.at(-1);const exact=source.indexOf(f);if(exact>=0)return values[exact];const at=source.findIndex(v=>v>f),t=Math.log(f/source[at-1])/Math.log(source[at]/source[at-1]);return Math.round((values[at-1]+(values[at]-values[at-1])*t)*4)/4;});}
 const presets = Object.fromEntries(Object.entries(factoryPresets).map(([key,gains])=>[key,interpolate(previousBands,gains)]));
 function normalize(data){
  const input = Array.isArray(data?.gains) ? data.gains : [];
  return {enabled:data?.enabled===true,gains:frequencies.map((_,i)=>clamp(input[i]))};
 }
 function migrate(data,source){
  return {...normalize(data),gains:interpolate(source,data?.gains||[])};
 }
 function load(storage){
  for(const [key,source] of [[storageKey,null],['wave-equalizer-v2',previousBands],['wave-equalizer-v1',legacyTen]]){
   try{
    const raw=storage?.getItem(key);
    if(!raw)continue;
    const data=JSON.parse(raw);
    if(!Array.isArray(data?.gains))continue;
    return source ? migrate(data,data.gains.length===6?legacyFrequencies:source) : normalize(data);
   }catch{}
  }
  return normalize();
 }
 function response(value,sampleRate=48000,count=256){const s=normalize(value),rate=Number.isFinite(sampleRate)&&sampleRate>=8000?sampleRate:48000,max=Math.min(20000,rate/2-1),result=[];const coeffs=frequencies.map((f,i)=>{const w=2*Math.PI*Math.min(f,rate*.49)/rate,a=Math.sin(w)/(2*Q),A=10**((s.enabled?s.gains[i]:0)/40),b=-2*Math.cos(w);return[1+a*A,b,1-a*A,1+a/A,b,1-a/A];});for(let i=0;i<count;i++){const f=20*(max/20)**(i/(count-1)),w=2*Math.PI*f/rate,c=Math.cos(w),d=Math.cos(2*w),sin=Math.sin(w),sin2=Math.sin(2*w);let db=0;for(const b of coeffs){const numerator=Math.hypot(b[0]+b[1]*c+b[2]*d,-b[1]*sin-b[2]*sin2),denominator=Math.hypot(b[3]+b[4]*c+b[5]*d,-b[4]*sin-b[5]*sin2);db+=20*Math.log10(Math.max(1e-12,numerator/denominator));}result.push({frequency:f,db});}return result;}
 // Estimate the preset's overall level over the audible range. An isolated
 // boost should not lower the entire mix by the amount of its highest peak.
 function makeup(value,sampleRate){
  const settings=normalize(value);
  if(!settings.enabled)return 0;
  const points=response(settings,sampleRate,128).filter(p=>p.frequency>=63&&p.frequency<=12000);
  const mean=points.reduce((sum,p)=>sum+p.db,0)/points.length;
  return mean ? Math.max(-3,Math.min(3,-mean)) : 0;
 }
 const peakCurve=Float32Array.from({length:4097},(_,i)=>{
  const value=(i-2048)/2048;
  const level=Math.abs(value);
  if(level<=.82)return value;
  return Math.sign(value)*(.82+.16*Math.tanh((level-.82)/.055));
 });
 // The dry branch preserves the original signal. The wet branch uses a
 // smooth ceiling only on strong peaks, after makeup gain and both envelopes.
 function graph(context,value){
  const settings=normalize(value),input=context.createGain(),dry=context.createGain(),wet=context.createGain();
  const filters=frequencies.map((frequency,i)=>{
   const filter=context.createBiquadFilter();
   filter.type='peaking';
   filter.frequency.value=Math.min(frequency,context.sampleRate*.49);
   filter.Q.value=Q;
   filter.gain.value=settings.gains[i];
   return filter;
  });
  const output=context.createGain(),ceiling=context.createWaveShaper();
  ceiling.curve=peakCurve;
  const level=makeup(settings,context.sampleRate);
  output.gain.value=10**(level/20);
  dry.gain.value=settings.enabled?0:1;
  wet.gain.value=settings.enabled?1:0;
  input.connect(dry).connect(context.destination);
  input.connect(filters[0]);
  filters.reduce((from,to)=>{from.connect(to);return to;}).connect(output);
  output.connect(ceiling).connect(wet).connect(context.destination);
  return {input,filters,output,dry,wet,level};
 }
 function create(Context){
  let context, nodes, settings=normalize(),level=0,outputId="";
  let route=Promise.resolve();
  let onOutputFallback=()=>{};
  const sources=new Set();
  function apply(){
   level=makeup(settings,context?.sampleRate);
   if(!nodes)return;
   const now=context.currentTime;
   nodes.filters.forEach((filter,i)=>filter.gain.setTargetAtTime(settings.gains[i],now,.02));
   for(const [param,target] of [[nodes.output.gain,10**(level/20)],[nodes.dry.gain,settings.enabled?0:1],[nodes.wet.gain,settings.enabled?1:0]]){
    param.cancelAndHoldAtTime(now);
    param.setTargetAtTime(target,now,.02);
   }
  }
  function selectOutput(id){
   if(typeof id!=='string'||id.length>256)return Promise.reject(Error('Устройство вывода недоступно'));
   const task=route.then(async()=>{
    if(context){
     if(typeof context.setSinkId!=='function'&&id)throw Error('Выбор устройства недоступен');
     if(context.setSinkId&&context.sinkId!==id)await context.setSinkId(id);
    }
    outputId=id;
   });
   route=task.catch(()=>{});
   return task;
  }
  return {
   set(value){settings=normalize(value);apply();return normalize(settings);},
   get(){return normalize(settings);},
   selectOutput,
   currentOutput(){return outputId;},
   canSelectOutput(){return typeof Context?.prototype?.setSinkId==='function';},
   onOutputFallback(callback){onOutputFallback=callback;},
   async attach(audio){
    if(!Context)throw Error('Аудиообработка недоступна');
    if(!context){
     context=new Context();
     nodes=graph(context,settings);level=nodes.level;
     if(outputId){
      try{await selectOutput(outputId);}
      catch{outputId='';onOutputFallback();}
     }
    }else await route;
    const source=context.createMediaElementSource(audio),envelope=context.createGain();
    source.connect(envelope).connect(nodes.input);
    sources.add(source);
    const disconnect=()=>{source.disconnect();envelope.disconnect();sources.delete(source);};
    try{await context.resume();}catch(error){disconnect();throw error;}
    disconnect.gain=(from,to,seconds)=>{
     const now=context.currentTime;
     envelope.gain.cancelScheduledValues(now);
     envelope.gain.setValueAtTime(from,now);
     envelope.gain.linearRampToValueAtTime(to,now+Math.max(0,seconds));
    };
    return disconnect;
   },
   async resume(){if(context?.state==='suspended')await context.resume();},
   info(){return {enabled:settings.enabled,gains:settings.gains.slice(),makeupDb:settings.enabled?level:0,
    sampleRate:context?.sampleRate||48000,contextState:context?.state||'not-created',connections:sources.size};}
  };
 }
 return {frequencies,previousBands,presets,normalize,migrate,load,storageKey,response,makeup,graph,create};
});
