'use strict';
(()=>{
 const EQ=window.WaveEqualizer, engine=window.waveAudio;
 const presetsKey='wave-eq-presets-v1';
 const panel=el('section','library-popover eq-card');
 panel.id='equalizer-dialog';
 panel.setAttribute('popover','auto');
 panel.setAttribute('role','dialog');
 panel.setAttribute('aria-labelledby','equalizer-heading');
 panel.innerHTML=`
  <div class="section-head eq-heading">
   <h2 id="equalizer-heading">Эквалайзер</h2>
   <label class="eq-switch"><input id="eq-enabled" type="checkbox"> Включён</label>
   <button id="eq-close" class="icon" type="button" aria-label="Закрыть эквалайзер" title="Закрыть">×</button>
  </div>
  <label class="eq-preset">Пресет <select id="eq-preset" aria-label="Пресет эквалайзера"></select></label>
  <svg id="eq-response" class="eq-response" preserveAspectRatio="none" viewBox="0 0 640 100" role="img" aria-label="Частотная характеристика">
   <path class="eq-zero" d="M0 50H640"/><path id="eq-response-path"/>
  </svg>
  <div id="eq-bands" class="eq-bands"></div>
  <div class="eq-actions">
   <button id="eq-save-preset" class="secondary" type="button">Сохранить как…</button>
   <button id="eq-rename" class="secondary" type="button" hidden>Переименовать…</button>
   <button id="eq-remove" class="secondary" type="button" hidden>Удалить пресет</button>
   <button id="eq-reset" class="secondary" type="button">Сбросить</button>
  </div>
  <form id="eq-name-form" class="eq-actions" hidden>
   <label for="eq-name">Название пресета</label><input id="eq-name" maxlength="50" required>
   <button class="secondary" type="submit">Сохранить</button>
   <button class="secondary" id="eq-name-cancel" type="button">Отмена</button>
  </form>
  <details class="eq-transfer"><summary>Импорт и экспорт</summary>
   <div class="eq-actions"><button id="eq-import" class="secondary" type="button">Импортировать…</button>
   <input id="eq-import-file" type="file" accept=".json,application/json" hidden>
   <button id="eq-export" class="secondary" type="button">Экспортировать…</button></div>
  </details>
  <p id="eq-status" role="status" class="muted"></p>`;
 document.body.append(panel);

 const names={flat:'Ровный',bass:'Бас',vocal:'Вокал',soft:'Мягкий',warm:'Тёплый',bright:'Яркий',rock:'Рок',pop:'Поп',electronic:'Электроника',acoustic:'Акустика',jazz:'Джаз',classical:'Классика',speech:'Речь',night:'Ночной',bassSoft:'Лёгкий бас'};
 const validGains=gains=>Array.isArray(gains)&&gains.length===EQ.frequencies.length&&gains.every(g=>Number.isFinite(g)&&g>=-12&&g<=12&&Number.isInteger(g*4));
 const validName=name=>typeof name==='string'&&name.trim().length>0&&name.length<=50&&!/[\x00-\x1f]/.test(name);
 const validId=id=>typeof id==='string'&&/^user-[a-f0-9-]{36}$/.test(id);
 let profiles=[], selected='', editId=null;
 try{
  const stored=JSON.parse(localStorage.getItem(presetsKey)||'[]');
  if(Array.isArray(stored))profiles=stored.filter(p=>validId(p?.id)&&validName(p.name)&&validGains(p.gains)).slice(0,40);
 }catch{}
 const sliders=[],preset=$('eq-preset');
 const profile=()=>profiles.find(p=>p.id===selected);
 const option=(key,title)=>{const node=el('option','',title);node.value=key;return node;};
 const status=text=>setText($('eq-status'),text);
 function options(){
  const builtIns=el('optgroup');builtIns.label='Готовые';
  builtIns.append(...Object.keys(EQ.presets).map(key=>option(key,names[key])));
  const own=el('optgroup');own.label='Мои пресеты';
  own.append(...profiles.map(p=>option(p.id,p.name)));
  const manual=option('custom','Ручная настройка');manual.disabled=true;
  preset.replaceChildren(builtIns,...(profiles.length?[own]:[]),manual);
 }
 options();

 const button=el('button','icon');
 button.id='eq-open';button.type='button';button.title='Эквалайзер';
 button.setAttribute('aria-label','Эквалайзер');
 button.setAttribute('aria-haspopup','dialog');
 button.setAttribute('aria-controls',panel.id);
 button.setAttribute('aria-expanded','false');
 button.innerHTML='<svg class="wave-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 3v18M12 3v18M19 3v18M2 8h6m1 8h6m1-10h6"/></svg>';
 if($('sleep-open'))$('sleep-open').before(button);
 else document.querySelector('.player-right').prepend(button);

 function same(a,b){return a?.every((gain,i)=>gain===b[i]);}
 function render(){
  const current=engine.get(), gains=current.gains;
  const matched=Object.entries(EQ.presets).find(([,values])=>same(values,gains))?.[0];
  if(!same(profile()?.gains||EQ.presets[selected],gains))selected=matched||'custom';
  preset.value=selected;
  $('eq-enabled').checked=current.enabled;
  $('eq-rename').hidden=$('eq-remove').hidden=!profile();
  sliders.forEach((input,i)=>{
   input.value=gains[i];
   const label=(gains[i]>0?'+':'')+gains[i].toLocaleString('ru-RU')+' дБ';
   input.setAttribute('aria-valuetext',label);
   setText($('eq-value-'+i),label);
  });
  window.WaveUI?.ranges(panel);
  window.WaveSelect?.refresh();
  const curve=EQ.response(current,engine.info().sampleRate,128);
  $('eq-response-path').setAttribute('d',curve.map((p,i)=>(i?'L':'M')+(i*640/127).toFixed(1)+' '+(50-Math.max(-18,Math.min(18,p.db))*2.5).toFixed(1)).join(' '));
  button.classList.toggle('active',current.enabled);
 }
 function set(value){
  const current=engine.set(value);
  try{localStorage.setItem(EQ.storageKey,JSON.stringify(current));status('');}
  catch{status('Настройка действует до закрытия Wave.');}
  render();
 }
 EQ.frequencies.forEach((frequency,i)=>{
  const text=frequency<1000?frequency+' Гц':(frequency/1000).toLocaleString('ru-RU')+' кГц';
  const label=el('label','eq-band'),input=el('input'),value=el('output');
  value.id='eq-value-'+i;input.type='range';input.min=-12;input.max=12;input.step=.25;
  input.setAttribute('aria-label',text);
  input.oninput=()=>{
   const current=engine.get();
   current.gains[i]=Number(input.value);
   set({...current,enabled:true});
  };
  sliders.push(input);label.append(el('span','',text),input,value);$('eq-bands').append(label);
 });
 function place(){
  if(!panel.matches(':popover-open'))return;
  const a=button.getBoundingClientRect();
  panel.style.maxHeight=Math.max(100,a.top-16)+'px';
  const box=panel.getBoundingClientRect();
  panel.style.left=Math.max(8,Math.min(innerWidth-box.width-8,a.right-box.width))+'px';
  panel.style.top=Math.max(8,a.top-box.height-8)+'px';
 }
 const sizeObserver=new ResizeObserver(place);sizeObserver.observe(panel);
 addEventListener('resize',place);
 function closeForm(){
  $('eq-name-form').hidden=true;editId=null;
 }
 function close(){
  if(panel.matches(':popover-open'))panel.hidePopover();
  button.focus({preventScroll:true});
 }
 function open(){
  window.WaveMenus?.close();window.WaveSelect?.close();
  render();panel.showPopover({source:button});place();$('eq-enabled').focus({preventScroll:true});
 }
 button.onclick=()=>panel.matches(':popover-open')?close():open();
 const settingsButton=el('button','secondary','Эквалайзер');settingsButton.id='settings-equalizer';
 const preferences=$('settings-dialog');
 preferences.querySelector('.modal-card').append(settingsButton);
 settingsButton.onclick=()=>{
  preferences.addEventListener('close',()=>requestAnimationFrame(open),{once:true});
  preferences.classList.add('hidden');
 };
 panel.addEventListener('toggle',event=>{
  button.setAttribute('aria-expanded',String(event.newState==='open'));
  if(event.newState==='closed')closeForm();
 });
 panel.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
 });
 $('eq-close').onclick=close;
 $('eq-enabled').onchange=()=>set({...engine.get(),enabled:$('eq-enabled').checked});
 preset.onchange=()=>{
  selected=preset.value;const gains=profile()?.gains||EQ.presets[selected];
  if(gains)set({enabled:true,gains});
 };
 $('eq-reset').onclick=()=>{selected='flat';set({...engine.get(),gains:EQ.presets.flat});};
 function edit(item){
  editId=item?.id||null;
  $('eq-name').value=item?.name||'';
  $('eq-name-form').hidden=false;$('eq-name').focus();
 }
 function store(next){
  if(next.length>40)throw Error('Можно сохранить до 40 пресетов.');
  localStorage.setItem(presetsKey,JSON.stringify(next));
  profiles=next;options();
 }
 $('eq-save-preset').onclick=()=>edit(null);
 $('eq-rename').onclick=()=>edit(profile());
 $('eq-name-cancel').onclick=()=>{closeForm();$('eq-save-preset').focus();};
 $('eq-name-form').onsubmit=event=>{
  event.preventDefault();
  const name=$('eq-name').value.trim();
  if(!validName(name)){status('Введите название пресета.');return;}
  try{
   const existing=profiles.find(p=>p.id===editId);
   const item={id:existing?.id||'user-'+crypto.randomUUID(),name,gains:existing?.gains||engine.get().gains};
   store(existing?profiles.map(p=>p.id===existing.id?item:p):[...profiles,item]);
   selected=item.id;closeForm();render();$('eq-save-preset').focus();status('Пресет сохранён.');
  }catch(error){status(error.message);}
 };
 $('eq-remove').onclick=()=>{
  try{store(profiles.filter(p=>p.id!==selected));render();$('eq-save-preset').focus();status('Пресет удалён.');}
  catch(error){status(error.message);}
 };
 $('eq-import').onclick=()=>$('eq-import-file').click();
 $('eq-import-file').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';
  if(!file)return;
  try{
   if(file.size>16384)throw Error('Файл пресета слишком большой.');
   const value=JSON.parse(await file.text());
   if(value?.version!==1||JSON.stringify(value.frequencies)!==JSON.stringify(EQ.frequencies)||!validName(value.name)||!validGains(value.gains))throw Error('Этот файл не подходит для эквалайзера Wave.');
   const item={id:'user-'+crypto.randomUUID(),name:value.name.trim(),gains:value.gains};
   store([...profiles,item]);selected=item.id;
   set({enabled:true,gains:item.gains});status('Пресет импортирован.');
  }catch(error){status(error instanceof SyntaxError?'Не удалось прочитать JSON пресета.':error.message);}
 };
 $('eq-export').onclick=()=>{
  const value={version:1,name:profile()?.name||names[selected]||'Мой пресет',frequencies:EQ.frequencies,gains:engine.get().gains};
  const link=el('a'),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
  link.href=url;link.download='Wave-EQ.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
 };
 render();
 const exportButton=el('button','secondary','Сохранить диагностику');exportButton.id='diagnostics-export';const help=el('p','muted','Отчёт содержит версию, технические счётчики и категории ошибок. Без названий песен, данных аккаунта и ссылок. Никуда не отправляется автоматически.');help.id='diagnostics-help';exportButton.setAttribute('aria-describedby',help.id);exportButton.onclick=async()=>{exportButton.disabled=true;try{const result=requireResult(await api.diagnostics({enabled:engine.get().enabled}));setText(help,result.canceled?'Сохранение отменено.':'Отчёт сохранён. Вы можете проверить файл перед отправкой.');}catch(e){setText(help,e.message||'Не удалось сохранить отчёт. Повторите попытку.');}finally{exportButton.disabled=false;}};const diagnosticsSection=el('section','diagnostic-settings');diagnosticsSection.append(el('h3','','Диагностика'),help,exportButton);$('settings-dialog').querySelector('.modal-card').append(diagnosticsSection);
})();
