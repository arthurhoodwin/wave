'use strict';
(()=>{
 if(!has('desktop'))return;
 const section=el('section','island-settings');
 section.innerHTML='<h3>Мини-плеер</h3><label><input id="island-enabled" type="checkbox"> Показывать поверх окон</label><label>Экран <select id="island-display" aria-label="Экран мини-плеера"></select></label><div class="settings-actions"><label>Горячая клавиша <input id="island-key" type="text" maxlength="28" placeholder="Ctrl+Shift+F9" autocomplete="off"></label><button type="button" class="secondary" id="island-key-save">Сохранить</button><button type="button" class="secondary" id="island-reset">Сбросить положение</button></div><p class="muted" id="island-status" role="status"></p>';
 $('settings-dialog').querySelector('.modal-card').append(section);
 let displaySignature='';
 function paint(result){
  const {island,prefs}=result||{};
  if(!island||!prefs)return;
  const select=$('island-display'),signature=JSON.stringify(island.displays);
  if(signature!==displaySignature){
   displaySignature=signature;
   const primary=el('option','','Основной экран');primary.value='';
   select.replaceChildren(primary,...island.displays.map(display=>{
    const option=el('option','',display.label);option.value=display.id;
    return option;
   }));
  }
  select.value=island.displays.some(display=>display.id===prefs.islandDisplay)?prefs.islandDisplay:'';
  $('island-enabled').checked=prefs.islandEnabled;
  if(document.activeElement!==$('island-key'))$('island-key').value=island.shortcut;
  window.WaveSelect?.refresh();
  if(!island.shortcutActive)setText($('island-status'),'Горячая клавиша недоступна. Выберите другое сочетание.');
 }
 async function configure(value){
  try{
   const result=requireResult(await api.desktop('island-configure',value));
   setText($('island-status'),'');
   paint(result);
  }catch(error){setText($('island-status'),error.message);api.desktop('status').then(paint).catch(()=>{});}
 }
 $('island-enabled').onchange=event=>configure({enabled:event.target.checked});
 $('island-display').onchange=event=>configure({display:event.target.value});
 $('island-key-save').onclick=()=>configure({shortcut:$('island-key').value});
 $('island-reset').onclick=()=>configure({reset:true});
 api.onDesktopState?.(paint);
 api.desktop('status').then(paint).catch(()=>{});
})();
