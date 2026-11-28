'use strict';
(()=>{
 if(!has('desktop'))return;
 const settings=$('settings-dialog');
 const section=el('section','karaoke-settings');
 section.innerHTML='<h3>Проба караоке</h3><p class="muted">Стерео WAV, PCM 16 бит, до 24 МиБ. Wave ослабляет голос в центре записи.</p><div><button type="button" data-action="start">Выбрать WAV…</button> <button type="button" data-action="cancel" hidden>Отменить</button> <button type="button" data-action="preview" hidden>Послушать</button> <button type="button" data-action="save" hidden>Сохранить WAV…</button></div><p role="status" class="muted"></p><progress aria-label="Подготовка инструментала" max="100" hidden></progress>';
 settings.querySelector('.modal-card').append(section);
 const button=name=>section.querySelector('[data-action="'+name+'"]');
 const start=button('start'),cancel=button('cancel'),preview=button('preview'),save=button('save');
 const status=section.querySelector('[role=status]'),progress=section.querySelector('progress');
 const request=method=>call('desktop','karaoke-'+method);
 const error=e=>setText(status,e?.message||'Не удалось подготовить запись');
 let timer,previewing;
 function stop(){
  const old=previewing;previewing=null;preview.textContent='Послушать';
  if(!old)return;
  old.audio?.pause();old.disconnect?.();
  if(old.url)URL.revokeObjectURL(old.url);
 }
 function render(job){
  clearTimeout(timer);
  const running=job.phase==='running',ready=job.phase==='ready';
  start.disabled=running||job.phase==='choosing';cancel.hidden=!running;
  preview.hidden=save.hidden=!ready;progress.hidden=!running;progress.value=job.progress||0;
  const titles={running:'Готовим инструментал…',ready:job.name+' · Готово',cancelled:'Подготовка отменена',error:job.error};
  setText(status,titles[job.phase]||'');
  if(running)timer=setTimeout(()=>request('status').then(render).catch(error),180);
 }
 start.onclick=async()=>{stop();start.disabled=true;try{render(await request('start'));}catch(e){start.disabled=false;error(e);}};
 cancel.onclick=()=>request('cancel').then(render).catch(error);
 save.onclick=()=>request('save').then(result=>{if(result.saved)setText(status,'Инструментал сохранён');}).catch(error);
 preview.onclick=async()=>{
  if(previewing){stop();return;}
  if(state.playing){try{await call('pause');}catch(e){error(e);return;}}
  if(previewing||!settings.open)return;
  const playing={};previewing=playing;preview.textContent='Остановить';
  try{
   const {bytes}=await request('preview');
   if(previewing!==playing)return;
   playing.url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'}));
   const audio=playing.audio=new Audio(playing.url);audio.volume=state.volume;audio.onended=stop;
   const disconnect=await waveAudio.attach(audio);
   if(previewing!==playing){disconnect();return;}
   playing.disconnect=disconnect;
   await audio.play();
  }catch(e){if(previewing===playing){stop();error(e);}}
 };
 api.onPlayerState?.(player=>{if(player.playing)stop();});
 settings.addEventListener('close',stop);
})();
