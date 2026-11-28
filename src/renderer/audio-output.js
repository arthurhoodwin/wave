'use strict';
(()=>{
 const engine=window.waveAudio,media=navigator.mediaDevices;
 if(!engine?.canSelectOutput()||!media?.enumerateDevices)return;
 const section=el('section','audio-output-settings');
 section.innerHTML='<h3>Аудиовыход</h3><label>Устройство вывода <select id="audio-output" aria-label="Устройство вывода"><option value="">Системное устройство</option></select></label><p id="audio-output-status" class="muted" role="status"></p>';
 const settings=$('settings-dialog');
 settings.querySelector('.modal-card').append(section);
 const select=$('audio-output'),key='wave-audio-output-v1';
 const status=text=>setText($('audio-output-status'),text);
 let chosen='';
 try{chosen=localStorage.getItem(key)||'';}catch{}
 function save(id){try{localStorage.setItem(key,id);}catch{}}
 function announceFallback(){
  chosen='';save('');select.value='';window.WaveSelect?.refresh();
  const text='Выбранное устройство недоступно. Wave использует системный аудиовыход.';
  status(text);window.WaveToast?.show(text);
 }
 engine.onOutputFallback(announceFallback);
 engine.selectOutput(chosen).catch(announceFallback);
 async function refresh(){
  const devices=(await media.enumerateDevices()).filter(device=>device.kind==='audiooutput'&&device.deviceId&&device.deviceId!=='default');
  const system=el('option','','Системное устройство');system.value='';
  select.replaceChildren(system,...devices.map((device,index)=>{
   const option=el('option','',device.label||'Устройство '+(index+1));option.value=device.deviceId;
   return option;
  }));
  if(chosen&&!devices.some(device=>device.deviceId===chosen)){
   try{await engine.selectOutput('');announceFallback();}catch(error){status(error.message);}
  }
  select.value=chosen;
  window.WaveSelect?.refresh();
 }
 select.onchange=async()=>{
  const id=select.value;select.disabled=true;window.WaveSelect?.refresh();
  try{await engine.selectOutput(id);chosen=id;save(id);status('');}
  catch{select.value=chosen;status('Не удалось переключить аудиовыход.');}
  finally{select.disabled=false;window.WaveSelect?.refresh();}
 };
 new MutationObserver(()=>{if(settings.open)refresh().catch(()=>status('Устройства вывода недоступны.'));}).observe(settings,{attributes:true,attributeFilter:['open']});
 media.addEventListener('devicechange',()=>{if(settings.open||chosen)refresh().catch(()=>{});});
})();
