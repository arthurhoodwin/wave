'use strict';
(()=>{
 if(!has('desktop')||!window.waveAudio?.setLoudnessEnabled)return;
 const settings=$('settings-dialog'),section=el('section','loudness-settings');
 section.innerHTML='<h3>Выравнивание громкости</h3><label><input id="track-loudness-enabled" type="checkbox"> Выравнивать громкость скачанных песен</label><p class="muted">Измерьте скачанные песни. Новые замеры учитываются при следующем запуске песни.</p><div class="settings-actions"><button id="track-loudness-start" type="button">Измерить скачанные песни</button><button id="track-loudness-cancel" type="button" hidden>Остановить</button></div><p id="track-loudness-status" role="status" class="muted"></p><p id="track-loudness-playing" class="muted"></p>';
 settings.querySelector('.modal-card').append(section);
 const checkbox=$('track-loudness-enabled'),start=$('track-loudness-start'),stop=$('track-loudness-cancel');
 const key='wave-track-loudness-v1';
 const request=method=>call('desktop','loudness-'+method);
 let timer;
 try{checkbox.checked=localStorage.getItem(key)==='1';}catch{}
 function paintCurrent(){
  const gain=window.WaveMediaDebug?.gainDb();
  setText($('track-loudness-playing'),!settings.open||!state.current||!checkbox.checked?'':Number.isFinite(gain)?
   'Текущая песня · поправка '+(gain>0?'+':'')+gain.toFixed(1)+' дБ':'Текущая песня · исходная громкость');
 }
 checkbox.onchange=()=>{
  try{localStorage.setItem(key,checkbox.checked?'1':'0');}catch{}
  waveAudio.setLoudnessEnabled(checkbox.checked);
  paintCurrent();
 };
 const status=text=>setText($('track-loudness-status'),text);
 const failed=error=>{start.disabled=false;status(error.message||'Не удалось измерить громкость.');};
 function render(job){
  clearTimeout(timer);
  if(typeof job?.available!=='boolean')return;
  section.hidden=!job.available&&job.phase==='idle';
  const active=['running','cancelling'].includes(job.phase);
  start.disabled=active||!job.available;stop.hidden=!active;stop.disabled=job.phase==='cancelling';
  const totals='Новых замеров: '+job.measured+' · Из кэша: '+job.cached+' · Пропущено: '+job.skipped;
  if(job.phase==='running')status(job.total?'Измеряем · '+job.done+' из '+job.total:'Проверяем скачанные песни…');
  else if(job.phase==='cancelling')status('Останавливаем измерение…');
  else if(job.phase==='ready')status(job.total?totals:'Нет скачанных песен.');
  else if(job.phase==='cancelled')status('Измерение остановлено. '+totals);
  else if(job.phase==='error')status('Не удалось сохранить замеры. Повторите измерение.');
  else status('');
  if(active&&settings.open)timer=setTimeout(refresh,450);
 }
 function refresh(){return request('status').then(render).catch(failed);}
 start.onclick=()=>{start.disabled=true;request('start').then(render).catch(failed);};
 stop.onclick=()=>{stop.disabled=true;request('cancel').then(render).catch(failed);};
 new MutationObserver(()=>{if(settings.open){refresh();paintCurrent();}else clearTimeout(timer);}).observe(settings,{attributes:true,attributeFilter:['open']});
 api.onSession?.(()=>{if(settings.open)refresh();});
 api.onPlayerState?.(()=>{if(settings.open)paintCurrent();});
 waveAudio.setLoudnessEnabled(checkbox.checked);
})();
