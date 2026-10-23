'use strict';
(()=>{let active=null,generation=0,volume=.5,desiredPlaying=false,volumeRevision=0;
 const report=(audio,gen,requestId,type='state',buffering=false)=>{if(gen!==generation)return;window.music.mediaEvent({type,generation:gen,requestId,playing:!!audio&&!audio.paused&&!audio.ended,currentTime:Math.max(0,Number(audio?.currentTime)||0),duration:Number.isFinite(audio?.duration)?audio.duration:0,volume:audio?.volume??volume,volumeRevision,ended:!!audio?.ended,buffering});};
 const dispose=()=>{const old=active;active=null;if(old){old.hls?.destroy();old.audio.pause();old.audio.removeAttribute('src');old.audio.load();}};
 window.music.onPlaybackCommand(async command=>{const {id,generation:gen,type}=command;
  if(type==='reset'){if(gen<generation)return;generation=gen;desiredPlaying=false;dispose();report(null,gen,id);return;}
  if(gen!==generation)return;
  let instance;
  try{if(type==='load'){
    dispose();const audio=new Audio();audio.preload='auto';audio.volume=volume=command.volume;volumeRevision=Math.max(volumeRevision,Number(command.volumeRevision)||0);desiredPlaying=command.autoplay!==false;instance={audio,hls:null,generation:gen};active=instance;let acknowledged=false,failed=false;
    const valid=()=>active===instance&&generation===gen;
    const ack=()=>{if(!valid()||failed)return;if(!acknowledged){acknowledged=true;report(audio,gen,id);}else report(audio,gen);};
    for(const event of ['timeupdate','pause','volumechange','durationchange','ended','seeked'])audio.addEventListener(event,()=>{if(valid())report(audio,gen);});audio.addEventListener('waiting',()=>{if(valid())report(audio,gen,undefined,'state',true);});audio.addEventListener('playing',ack);
    audio.addEventListener('loadedmetadata',()=>{if(!valid())return;if(command.position>0)audio.currentTime=Math.min(command.position,Number.isFinite(audio.duration)?audio.duration:command.position);if(!desiredPlaying)ack();});
    const fail=()=>{if(valid()&&!failed){failed=true;report(audio,gen,acknowledged?undefined:id,'error');acknowledged=true;audio.pause();}};audio.addEventListener('error',fail);
    if(command.format==='audio')audio.src=command.url;else if(window.Hls?.isSupported()){const hls=new Hls({enableWorker:false,backBufferLength:20,maxBufferLength:30,maxMaxBufferLength:60,manifestLoadingMaxRetry:0,levelLoadingMaxRetry:0,fragLoadingMaxRetry:0});instance.hls=hls;hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)fail();});hls.loadSource(command.url);hls.attachMedia(audio);}else if(audio.canPlayType('application/vnd.apple.mpegurl'))audio.src=command.url;else{fail();return;}
    if(desiredPlaying){try{await audio.play();if(valid())ack();}catch{if(!desiredPlaying&&valid())ack();else fail();}}
   }else if(type==='volume'){if((Number(command.volumeRevision)||0)>=volumeRevision){volumeRevision=Number(command.volumeRevision)||0;volume=command.volume;if(active)active.audio.volume=volume;}report(active?.audio,gen,id);}
   else{const audio=active?.audio;if(!audio)throw Error('No media');if(type==='pause'){desiredPlaying=false;audio.pause();}else if(type==='resume'){desiredPlaying=true;await audio.play();}else if(type==='seek')audio.currentTime=command.time;else throw Error('Unknown command');report(audio,gen,id);}
  }catch{if(gen===generation&&(!instance||active===instance))report(active?.audio,gen,id,'error');}
 });
})();
