'use strict';
((root,factory)=>{
 const meter=factory();
 if(typeof module==='object'&&module.exports)module.exports=meter;
 else root.WaveLoudnessMeter=meter;
})(globalThis,()=>{
 const RATE=48000,STEP=RATE/10,MAX_SECONDS=600,MAX_BYTES=32*1024**2;
 // ITU-R BS.1770-5, Annexes 1 and 2, at 48 kHz. The interpolator uses four polyphase FIR branches.
 const SHELF=[1.53512485958697,-2.69169618940638,1.19839281085285,-1.69065929318241,.73248077421585];
 const HIGH_PASS=[1,-2,1,-1.99004745483398,.99007225036621];
 const phase0=[28,180,-322,544,-974,2250,15928,-1676,780,-436,244,-136];
 const phase1=[-478,480,-848,1460,-2728,7620,12776,-3282,1664,-954,542,-310];
 const phases=[phase0,phase1,phase1.slice().reverse(),phase0.slice().reverse()];
 const toLufs=power=>-.691+10*Math.log10(power);
 const absoluteGate=10**((-70+.691)/10);

 function filter([b0,b1,b2,a1,a2]){
  let z1=0,z2=0;
  return sample=>{
   const value=b0*sample+z1;
   z1=b1*sample-a1*value+z2;
   z2=b2*sample-a2*value;
   return value;
  };
 }

 function peak(samples){
  let maximum=0;
  const ring=new Float64Array(24);
  for(let i=0;i<samples.length+11;i++){
   const sample=i<samples.length?samples[i]:0;
   const slot=i%12;
   ring[slot]=ring[slot+12]=sample;
   let first=0,second=0,third=0,fourth=0;
   for(let tap=0;tap<12;tap++){
    const value=ring[slot+1+tap];
    first+=value*phases[0][tap];
    second+=value*phases[1][tap];
    third+=value*phases[2][tap];
    fourth+=value*phases[3][tap];
   }
   maximum=Math.max(maximum,Math.abs(sample),Math.abs(first)/16384,Math.abs(second)/16384,Math.abs(third)/16384,Math.abs(fourth)/16384);
  }
  return maximum;
 }

 function measure(channels){
  const frames=channels[0]?.length;
  if(![1,2].includes(channels.length)||frames<4*STEP||frames>MAX_SECONDS*RATE||
    channels.some(channel=>channel.length!==frames))return null;
  const steps=new Float64Array(Math.floor(frames/STEP));
  let truePeak=0;
  for(const channel of channels){
   const shelf=filter(SHELF),highPass=filter(HIGH_PASS);
   for(let block=0;block<steps.length;block++){
    let energy=0;
    for(let i=block*STEP,end=i+STEP;i<end;i++){
     const sample=highPass(shelf(channel[i]));
     energy+=sample*sample;
    }
    steps[block]+=energy/(4*STEP);
   }
   truePeak=Math.max(truePeak,peak(channel));
  }
  const gated=[];
  for(let block=3;block<steps.length;block++){
   const power=steps[block-3]+steps[block-2]+steps[block-1]+steps[block];
   if(power>absoluteGate)gated.push(power);
  }
  if(!gated.length||!Number.isFinite(truePeak))return null;
  const mean=values=>values.reduce((sum,value)=>sum+value,0)/values.length;
  const relativeGate=mean(gated)/10;
  const integrated=mean(gated.filter(block=>block>relativeGate));
  return {lufs:toLufs(integrated),dbtp:20*Math.log10(truePeak),channels:channels.length};
 }

 async function decode(url){
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok||Number(response.headers.get('content-length'))>MAX_BYTES)throw Error('Audio unavailable');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength>MAX_BYTES)throw Error('Audio too large');
  const audio=await new OfflineAudioContext(1,1,RATE).decodeAudioData(bytes);
  if(![1,2].includes(audio.numberOfChannels)||audio.duration>MAX_SECONDS)return null;
  return measure(Array.from({length:audio.numberOfChannels},(_,channel)=>audio.getChannelData(channel)));
 }

 return {measure,decode,MAX_BYTES,MAX_SECONDS};
});
