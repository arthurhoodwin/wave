'use strict';

(()=>{
 if(!has('personal'))return;

 const dialog=el('dialog','modal-overlay hidden recap-dialog');
 dialog.setAttribute('aria-labelledby','recap-title');
 dialog.innerHTML=`
 <section class="modal-card recap-card">
  <div class="recap-top">
   <h2 id="recap-title">Итоги месяца</h2>
   <button type="button" class="icon" id="recap-close" title="Закрыть" aria-label="Закрыть">×</button>
  </div>
  <section class="recap-invite" id="recap-invite" hidden>
   <p class="recap-month-name" id="recap-invite-month"></p>
   <p>Посмотрите, сколько музыки прозвучало, какие песни возвращались на повтор и кто стал вашим исполнителем месяца.</p>
   <div class="recap-actions">
    <button type="button" id="recap-open-report" class="primary">Посмотреть итоги</button>
    <button type="button" id="recap-later" class="secondary">Не сейчас</button>
   </div>
  </section>
  <section id="recap-archive">
   <label class="recap-period">Месяц <select id="recap-period" aria-label="Месяц прослушивания"></select></label>
   <p class="muted" id="recap-status" role="status"></p>
   <div class="recap-cards" id="recap-cards"></div>
   <button type="button" class="secondary" id="recap-clear">Удалить статистику…</button>
   <div id="recap-clear-confirm" hidden>
    <p>Итоги всех месяцев будут удалены с этого устройства.</p>
    <div class="recap-actions">
     <button type="button" id="recap-clear-yes" class="danger-action">Удалить итоги</button>
     <button type="button" id="recap-clear-no" class="secondary">Отмена</button>
    </div>
   </div>
  </section>
 </section>`;
 document.body.append(dialog);

 const button=el('button','secondary','Итоги месяца');
 button.id='history-recap';button.type='button';button.hidden=true;
 $('history-categories')?.after(button);
 if(!button.isConnected)document.querySelector('.track-section')?.prepend(button);

 let requested=false,checking=false,version=0,visible=true,invited='';
 const close=()=>dialog.classList.add('hidden');
 const note=text=>setText($('recap-status'),text);
 const formatter=new Intl.DateTimeFormat('ru-RU',{year:'numeric',month:'long'});
 function dateOf(month){const [year,m]=month.split('-').map(Number);return new Date(year,m-1,1);}
 const monthName=month=>formatter.format(dateOf(month)).replace(/ г\.$/,'');
 function duration(ms){
  const minutes=Math.round(Math.abs(ms)/60000), h=Math.floor(minutes/60);
  if(h)return h+' ч '+minutes%60+' мин';
  return minutes?minutes+' мин':'меньше минуты';
 }
 function noun(n,forms){
  const rest=n%100;
  return n+' '+forms[rest>=11&&rest<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2];
 }
 const songs=n=>noun(n,['песня','песни','песен']);
 const days=n=>noun(n,['день','дня','дней']);
 const plays=n=>noun(n,['прослушивание','прослушивания','прослушиваний']);

 function show(mode){
  dialog.dataset.view=mode;
  $('recap-invite').hidden=mode!=='invite';
  $('recap-archive').hidden=mode==='invite';
  $('recap-clear-confirm').hidden=true;
  dialog.classList.remove('hidden');
 }
 function card(box,label,value,detail,entity){
  if(!value)return;
  const item=el('article','recap-stat');
  item.append(el('h3','',label));
  const known=entity?.trackKey&&[...state.loop,...state.allTracks].find(t=>t.key===entity.trackKey);
  if(known||/^https:\/\/vk\.ru\/artist\//.test(entity?.route||'')){
   const action=el('button','recap-link',String(value));
   action.type='button';
   action.onclick=()=>{
    close();
    if(known)playTrack(known).catch(fail);
    else window.WaveMusicLinks?.open(entity.route)?.catch(fail);
   };
   item.append(action);
  }else item.append(el('strong','',String(value)));
  if(detail)item.append(el('p','muted',detail));
  box.append(item);
 }
 function draw(result){
  const box=$('recap-cards');box.replaceChildren();
  const r=result.report;
  note(!r?(result.coverage==='missing'?'За этот месяц нет данных.':'В этом месяце прослушиваний не было.'):
   result.coverage==='partial'?'Итоги составлены за неполный месяц.':'');
  if(!r)return;
  const add=(title,value,detail,entity)=>card(box,title,value,detail,entity);
  const entity=(title,row,detail)=>add(title,row?.name,row?detail(row):'',row);
  add('Время с музыкой',duration(r.ms),days(r.days)+' с музыкой · '+duration(r.ms/r.days)+' в среднем');
  add('Прослушивания',String(r.plays),songs(r.tracks)+' · '+noun(r.artists,['исполнитель','исполнителя','исполнителей']));
  entity('Песня месяца',r.track,row=>row.artist+' · '+duration(row.ms));
  entity('На повторе',r.repeat,row=>plays(row.plays));
  entity('Исполнитель месяца',r.artist,row=>duration(row.ms));
  entity('Альбом месяца',r.album,row=>duration(row.ms));
  entity('Плейлист месяца',r.playlist,row=>duration(row.ms));
  entity('Открытие месяца',r.discovery,row=>duration(row.ms));
  entity('Возвращение месяца',r.comeback,row=>row.artist);
  add('Без пропусков',r.albumCompletion?.name,r.albumCompletion?r.albumCompletion.finished+' из '+r.albumCompletion.total+' песен дослушано до конца':'');
  add('Самый музыкальный день',r.day?new Date(r.day+'T12:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'}):'');
  add('Музыкальный марафон',r.longestMs&&duration(r.longestMs));
  add('Серия дней с музыкой',r.streak&&days(r.streak));
  add('Музыкальный час',r.hour===null?'':String(r.hour).padStart(2,'0')+':00');
  add('Разнообразие месяца',songs(r.tracks),Math.round(r.outside/r.ms*100)+'% времени за пределами топ-5 исполнителей');
  add('Месяц в Миксе',r.mixMs&&duration(r.mixMs),songs(r.mixTracks));
  add('Без сети',r.offlineMs&&duration(r.offlineMs));
  entity('Жанр месяца',r.genre,row=>duration(row.ms));
  if(r.comparison){
   const delta=r.comparison;
   add('К прошлому месяцу',delta.ms===0?'Столько же времени':(delta.ms>0?'+':'−')+duration(delta.ms), (delta.artists>0?'+':'')+delta.artists+' по числу уникальных исполнителей');
  }
 }
 async function selectMonth(month){
  const token=++version;
  $('recap-cards').replaceChildren();
  note('Открываем итоги…');
  try{
   const result=await call('personal',{action:'recap-report',month});
   if(token===version)draw(result);
  }catch(error){if(token===version)note(error.message);}
 }
 async function archive(month){
  show('archive');
  const token=++version,select=$('recap-period');
  select.replaceChildren();select.disabled=$('recap-clear').disabled=true;
  $('recap-cards').replaceChildren();note('Открываем архив…');
  try{
   const result=await call('personal',{action:'recap-archive'});
   if(token!==version)return;
   for(const item of result.months||[]){
    const option=el('option','',monthName(item.month));
    option.value=item.month;
    select.append(option);
   }
   if(month&&[...select.options].some(option=>option.value===month))select.value=month;
   select.disabled=!select.options.length;
   $('recap-clear').disabled=!(result.months||[]).some(item=>item.hasData);
   window.WaveSelect?.refresh();
   if(select.value)await selectMonth(select.value);
   else note('Первые итоги появятся после завершения месяца.');
  }catch(error){if(token===version)note(error.message);}
 }
 async function check(){
  if(!state.ready||!visible||document.hidden||document.querySelector('dialog[open]')||checking||requested)return;
  checking=true;
  const session=state.sessionRevision;
  try{
   const result=await call('personal',{action:'recap-invitation'});
   if(state.sessionRevision!==session)return;
   requested=true;
   if(!result?.month)return;
   invited=result.month;
   setText($('recap-invite-month'),monthName(invited));
   show('invite');
  }catch{}finally{checking=false;}
 }
 button.onclick=()=>archive();
 $('recap-period').onchange=()=>selectMonth($('recap-period').value);
 $('recap-close').onclick=$('recap-later').onclick=close;
 $('recap-open-report').onclick=()=>archive(invited);
 $('recap-clear').onclick=()=>{$('recap-clear-confirm').hidden=false;$('recap-clear-no').focus();};
 $('recap-clear-no').onclick=()=>{$('recap-clear-confirm').hidden=true;$('recap-clear').focus();};
 $('recap-clear-yes').onclick=async()=>{
  $('recap-clear-yes').disabled=true;
  try{await call('personal',{action:'recap-clear'});await archive();}
  catch(error){note(error.message);}
  finally{$('recap-clear-yes').disabled=false;}
 };
 dialog.addEventListener('close',()=>{version++;});
 window.WaveRecaps={sync(){
  button.hidden=state.route.type!=='listenHistory';
  check();
 },reset(){requested=false;version++;if(dialog.open)close();}};
 api.onDesktopState?.(result=>{visible=result.mainVisible!==false;if(visible)check();});
 document.addEventListener('visibilitychange',check);
 addEventListener('focus',check);
})();
