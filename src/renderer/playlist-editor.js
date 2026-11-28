'use strict';
(()=>{const dialog=document.createElement('dialog');dialog.id='playlist-editor';dialog.className='modal-overlay hidden';dialog.setAttribute('aria-labelledby','playlist-editor-title');dialog.innerHTML='<form class="modal-card" id="playlist-editor-form"><h2 id="playlist-editor-title">Редактировать плейлист</h2><label>Название<input id="playlist-editor-name" maxlength="100" required></label><label>Описание<textarea id="playlist-editor-description" maxlength="2000" rows="5"></textarea></label><p id="playlist-editor-error" role="alert"></p><div class="modal-buttons"><button type="button" class="secondary" id="playlist-editor-cancel">Отмена</button><button class="primary" id="playlist-editor-save">Сохранить</button></div></form>';document.body.append(dialog);
 const coverEditor=el('fieldset','playlist-cover-editor');
 coverEditor.innerHTML=`
  <legend>Обложка · только в Wave</legend>
  <div class="playlist-cover-body">
   <canvas id="playlist-cover-preview" width="384" height="384" aria-label="Предпросмотр обложки"></canvas>
   <div class="playlist-cover-options">
    <button id="playlist-cover-pick" type="button" class="secondary">Выбрать изображение…</button>
    <input id="playlist-cover-file" type="file" accept="image/jpeg,image/png,image/webp" hidden>
    <div id="playlist-cover-crop" hidden>
     <label>Масштаб <input id="playlist-cover-zoom" type="range" min="1" max="3" step=".05" value="1"></label>
     <label>По горизонтали <input id="playlist-cover-x" type="range" min="0" max="100" value="50"></label>
     <label>По вертикали <input id="playlist-cover-y" type="range" min="0" max="100" value="50"></label>
    </div>
    <div class="playlist-cover-buttons">
     <button id="playlist-cover-save" type="button" class="secondary" disabled>Применить обложку</button>
     <button id="playlist-cover-remove" type="button" class="secondary" hidden>Вернуть обложку VK</button>
    </div>
   </div>
  </div><p id="playlist-cover-status" class="muted" role="status"></p>`;
 $('playlist-editor-error').before(coverEditor);
 let current=null,ticket=0,bitmap=null,pictureTicket=0,saved=false,coverBusy=false;
 const canvas=$('playlist-cover-preview'),ctx=canvas.getContext('2d',{alpha:false});
 const resetCanvas=()=>{ctx.fillStyle='#25282a';ctx.fillRect(0,0,384,384);};
 const coverStatus=text=>setText($('playlist-cover-status'),text);
 function controls(){
  $('playlist-cover-crop').hidden=!bitmap;
  $('playlist-cover-pick').disabled=coverBusy;
  $('playlist-cover-save').disabled=!bitmap||coverBusy;
  $('playlist-cover-remove').hidden=!saved;
  $('playlist-cover-remove').disabled=coverBusy;
 }
 function draw(){
  if(!bitmap)return;
  const crop=Math.min(bitmap.width,bitmap.height)/Number($('playlist-cover-zoom').value);
  const left=(bitmap.width-crop)*Number($('playlist-cover-x').value)/100;
  const top=(bitmap.height-crop)*Number($('playlist-cover-y').value)/100;
  resetCanvas();ctx.drawImage(bitmap,left,top,crop,crop,0,0,384,384);
 }
 function clearBitmap(){
  pictureTicket++;
  bitmap?.close();bitmap=null;
 }
 async function showSaved(value,request){
  saved=!!value?.image;controls();
  if(!saved){resetCanvas();return;}
  const image=new Image();image.src=value.image;
  try{
   await image.decode();
   if(ticket===request&&!bitmap)ctx.drawImage(image,0,0,384,384);
  }catch{}
 }
 $('playlist-cover-pick').onclick=()=>$('playlist-cover-file').click();
 $('playlist-cover-file').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';
  if(!file)return;
  const request=ticket,revision=++pictureTicket;
  try{
   if(file.size>10*1024**2||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Выберите JPG, PNG или WebP размером до 10 МБ.');
   const image=await createImageBitmap(file);
   if(ticket!==request||pictureTicket!==revision){image.close();return;}
   if(image.width*image.height>20000000){image.close();throw Error('Уменьшите разрешение изображения.');}
   bitmap?.close();bitmap=image;
   $('playlist-cover-zoom').value='1';$('playlist-cover-x').value=$('playlist-cover-y').value='50';
   controls();window.WaveUI?.ranges(coverEditor);draw();coverStatus('');
  }catch(error){
   if(ticket===request&&pictureTicket===revision)coverStatus(error.message);
  }
 };
 for(const id of ['playlist-cover-zoom','playlist-cover-x','playlist-cover-y'])$(id).oninput=draw;
 async function apply(image){
  if(!current||coverBusy)return;
  const id=current,request=ticket,session=state.sessionRevision;
  coverBusy=true;controls();
  try{
   const result=await call('personal',{action:'save-playlist-cover',id,image});
   if(session===state.sessionRevision)window.WaveHero?.setPlaylistCover(id,result);
   if(ticket!==request)return;
   clearBitmap();await showSaved(result,request);
   if(ticket===request)coverStatus(image?'Обложка сохранена в Wave.':'Возвращена обложка VK.');
  }catch(error){
   if(ticket===request)coverStatus(error.message);
  }finally{if(ticket===request){coverBusy=false;controls();}}
 }
 $('playlist-cover-save').onclick=()=>{if(bitmap)apply(canvas.toDataURL('image/png'));};
 $('playlist-cover-remove').onclick=()=>apply(null);

 async function open(id,title){const request=++ticket;current=id;clearBitmap();saved=false;coverBusy=true;controls();resetCanvas();coverStatus('');
  if(has('personal')){
   coverEditor.hidden=false;
   call('personal',{action:'playlist-cover',id}).then(result=>{if(ticket===request)return showSaved(result,request);}).catch(error=>{if(ticket===request)coverStatus(error.message);}).finally(()=>{if(ticket===request){coverBusy=false;controls();}});
  }else coverEditor.hidden=true;$('playlist-editor-name').value=title||'';$('playlist-editor-description').value='';$('playlist-editor-description').disabled=true;$('playlist-editor-save').disabled=true;setText($('playlist-editor-error'),'Читаем описание VK…');dialog.classList.remove('hidden');try{const result=await call('playlistDetails',id);if(request!==ticket||current!==id)return;$('playlist-editor-name').value=result.title;$('playlist-editor-description').value=result.description;$('playlist-editor-description').disabled=false;$('playlist-editor-save').disabled=false;setText($('playlist-editor-error'),'');}catch(e){if(request===ticket)setText($('playlist-editor-error'),e.message);}}
 $('playlist-editor-cancel').onclick=()=>dialog.classList.add('hidden');dialog.addEventListener('close',()=>{ticket++;current=null;clearBitmap();});
 $('playlist-editor-form').onsubmit=async e=>{e.preventDefault();if(!current||$('playlist-editor-save').disabled)return;const id=current;$('playlist-editor-save').disabled=true;dialog.classList.add('hidden');await synchronise({action:'rename',playlistId:id,title:$('playlist-editor-name').value,description:$('playlist-editor-description').value});};
 window.WavePlaylistEditor={open};$('playlist-rename').onclick=()=>open(state.route.id,state.route.title);
})();
