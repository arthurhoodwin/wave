'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const volume=$('volume'),error=$('error'),heart=$('heart'),shuffle=$('shuffle'),art=$('art');
 const seek=$('seek'),toggle=$('toggle');
 let lastCover,volumeDragging=false,volumeBusy=false;
 let trackId,seekTrackId,pointerSeeking=false,seeking=false;

 function text(node,value){
  if(node.textContent!==value)node.textContent=value;
 }

 async function action(type,time){
  try{
   const result=await window.desktop.action(type,time);
   if(result?.ok===false)throw Error(result.error.message);
   text(error,'');
  }catch(e){text(error,e.message);}
 }

 function renderCover(cover){
  if(lastCover===cover)return;
  lastCover=cover;
  art.replaceChildren();
  art.removeAttribute('data-icon-state');
  if(cover){
   const image=document.createElement('img');
   image.alt='';
   image.referrerPolicy='no-referrer';
   if(window.WaveImages)WaveImages.watch(image,cover);
   else image.src=cover;
   art.append(image);
  }else window.WaveIcons.set(art,'music');
  window.WaveImages?.sweep();
 }

 function renderLevel(value){
  const percent=Math.round(value*100)+'%';
  volume.value=String(value);
  volume.setAttribute('aria-valuetext',percent);
  text($('volume-value'),percent);
  window.WaveUI?.range(volume);
 }

 function timeLabel(value){
  const seconds=Math.max(0,Math.floor(Number(value)||0));
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
 }

 function renderPosition(value){
  seek.value=String(value);
  seek.setAttribute('aria-valuetext',timeLabel(value)+' из '+timeLabel(seek.max));
  text($('position'),timeLabel(value));
  window.WaveUI?.range(seek);
 }

 function renderTransport(state){
  const track=state.current;
  trackId=track?.id;
  const playing=state.playing||state.busy;
  window.WaveIcons.set(toggle,playing?'pause':'play');
  toggle.setAttribute('aria-label',playing?'Пауза':'Воспроизвести');
  toggle.disabled=!track||track.available===false;
  $('previous').disabled=!state.canPrevious;
  $('next').disabled=!state.canNext;
  seek.disabled=!state.duration||state.busy;
  if(seeking&&(seek.disabled||seekTrackId!==trackId))seeking=false;
  seek.max=String(state.duration||0);
  text($('duration'),timeLabel(state.duration));
  if(!seeking)renderPosition(state.position||0);
 }

 function render(state){
  const track=state.current;
  const title=track?.title||'Выберите песню в Wave';
  const artist=track?.artist||'';
  text($('title'),title);
  text($('artist'),artist);
  $('title').title=title;
  $('artist').title=artist;

  renderTransport(state);
  shuffle.disabled=!track||state.busy;
  shuffle.setAttribute('aria-pressed',String(state.shuffle===true));
  const heartLabel=state.liked?'Удалить из «Мне нравится»':'Добавить в «Мне нравится»';
  heart.disabled=!state.canLike||state.likeBusy;
  heart.classList.toggle('is-liked',state.liked===true);
  heart.setAttribute('aria-pressed',String(state.liked===true));
  heart.setAttribute('aria-busy',String(state.likeBusy===true));
  heart.setAttribute('aria-label',heartLabel);
  heart.title=heartLabel;

  if(!volumeDragging&&!volumeBusy&&Number.isFinite(state.volume))renderLevel(state.volume);
  renderCover(track?.cover||null);
 }

 for(const id of ['previous','toggle','next','heart','shuffle'])$(id).onclick=()=>action(id);
 seek.addEventListener('pointerdown',()=>{pointerSeeking=true;seekTrackId=trackId;});
 window.addEventListener('pointerup',()=>pointerSeeking=false);
 window.addEventListener('pointercancel',()=>{pointerSeeking=false;seeking=false;seekTrackId=null;});
 seek.oninput=()=>{
  if(!pointerSeeking)seekTrackId=trackId;
  if(seekTrackId!==trackId)return;
  seeking=true;
  renderPosition(Number(seek.value));
 };
 seek.onchange=()=>{
  seeking=false;
  if(!seek.disabled&&seekTrackId===trackId)action('seek',Number(seek.value));
  seekTrackId=null;
 };
 $('hide').onclick=()=>action('hideMini');

 const volumeWriter=new window.VolumeWriter({
  send:async value=>{
   const result=await window.desktop.volume(value);
   if(result?.ok===false)throw Error(result.error.message);
   return result;
  },
  onUpdate:(value,busy)=>{volumeBusy=busy;renderLevel(value);},
  onError:e=>text(error,e.message)
 });
 const changeVolume=()=>{
  const value=Number(volume.value);
  window.desktop.rememberVolume?.(value).catch(()=>{});
  volumeWriter.set(value);
 };
 volume.oninput=changeVolume;
 volume.onchange=changeVolume;
 volume.addEventListener('pointerdown',()=>volumeDragging=true);
 for(const event of ['pointerup','pointercancel','blur'])window.addEventListener(event,()=>volumeDragging=false);
 volume.addEventListener('blur',()=>volumeDragging=false);

 const content=$('island-content');
 let fitFrame;
 function fit(){
  cancelAnimationFrame(fitFrame);
  fitFrame=requestAnimationFrame(()=>window.desktop.fit?.(Math.max(36,Math.min(600,content.offsetHeight+2))).catch?.(()=>{}));
 }
 new ResizeObserver(fit).observe(content);
 window.addEventListener('resize',fit);
 document.fonts.ready.then(fit);
 window.desktop.onState(render);
 window.desktop.status().then(render).catch(e=>text(error,e.message));
})();
