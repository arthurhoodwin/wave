'use strict';
(()=>{
 const panel=$('song-moments');
 if(!panel||!has('personal')){if(panel)panel.hidden=true;return;}
 const dialog=$('song-dialog'),list=$('moment-list'),form=$('moment-form'),label=$('moment-label');
 const begin=$('moment-add'),status=$('moment-status'),submit=$('moment-save');
 const scope=()=>state.current&&JSON.stringify([state.sessionRevision,state.current.id]);
 let current=null,rows=[],editor=null,busy=false,loaded=false,sequence=0;

 function controls(){
  const enabled=!!state.current&&!state.busy&&state.duration>0&&!$('seek').disabled;
  begin.disabled=busy||!loaded||!enabled;
  for(const button of list.querySelectorAll('.moment-jump'))button.disabled=!enabled;
 }

 function abandon(){
  editor=null;
  form.hidden=true;
 }

 function render(focusId){
  const children=rows.map(row=>{
   const item=el('li','moment-row');
   const jump=el('button','moment-jump secondary');
   jump.type='button';jump.dataset.moment=row.id;
   const title=el('span','moment-name',row.label||'Момент');
   title.title=row.label;
   jump.append(el('span','moment-time',format(row.time)),title);
   jump.setAttribute('aria-label','Перейти к '+format(row.time)+(row.label?' · '+row.label:''));
   jump.onclick=()=>{
    if(scope()===current)window.WaveSong?.jump(row.time);
   };
   const rename=el('button','icon');
   rename.type='button';rename.title='Переименовать момент';
   rename.setAttribute('aria-label',rename.title+' на '+format(row.time));
   window.WaveIcons.set(rename,'edit');
   rename.onclick=()=>openEditor(row,rename);
   const remove=el('button','icon');
   remove.type='button';remove.title='Удалить момент';
   remove.setAttribute('aria-label',remove.title+' на '+format(row.time));
   window.WaveIcons.set(remove,'trash');
   remove.onclick=()=>mutate({action:'moment-remove',momentId:row.id},null,remove);
   item.append(jump,rename,remove);
   return item;
  });
  list.replaceChildren(...children);
  controls();
  if(focusId)(list.querySelector('[data-moment="'+CSS.escape(focusId)+'"]')||begin).focus({preventScroll:true});
 }

 function reset(){
  sequence++;
  current=null;rows=[];busy=false;loaded=false;
  abandon();
  submit.disabled=false;
  list.removeAttribute('aria-busy');
  list.replaceChildren();
  setText(status,'');
  controls();
 }

 async function update(){
  if(!panel.open||!dialog.open||dialog.classList.contains('hidden'))return;
  const key=scope();
  if(key===current)return;
  reset();
  if(!key)return;
  const ticket=sequence,id=state.current.id;
  current=key;
  setText(status,'Загружаем моменты…');
  try{
   const result=await call('personal',{action:'moments',id});
   if(ticket!==sequence||scope()!==key)return;
   rows=result.moments;
   loaded=true;
   render();
   setText(status,rows.length?'':'Моментов пока нет.');
  }catch(error){
   if(ticket===sequence)setText(status,error.message);
  }
 }

 function openEditor(row,returnFocus){
  if(busy||scope()!==current)return;
  const time=row?.time??Math.floor(window.WaveSong.position());
  editor={row,time,returnFocus};
  setText($('moment-form-time'),format(time));
  label.value=row?.label||'';
  form.hidden=false;
  label.focus({preventScroll:true});
 }

 async function mutate(command,focusId,returnFocus){
  if(busy||!state.current||scope()!==current)return;
  const ticket=sequence,key=current,id=state.current.id;
  busy=true;submit.disabled=true;controls();
  list.setAttribute('aria-busy','true');
  try{
   const {moments}=await call('personal',{...command,id});
   if(ticket!==sequence||scope()!==key)return;
   rows=moments;
   const restoreFocus=form.contains(document.activeElement)||document.activeElement===returnFocus;
   abandon();
   setText(status,command.action==='moment-remove'?'Момент удалён.':'Момент сохранён.');
   busy=false;
   render(restoreFocus?(focusId||rows.find(row=>row.time===command.time)?.id||'add'):null);
  }catch(error){if(ticket===sequence)setText(status,error.message);}
  finally{
   if(ticket===sequence){busy=false;submit.disabled=false;list.removeAttribute('aria-busy');controls();}
  }
 }

 begin.onclick=()=>openEditor(null,begin);
 $('moment-cancel').onclick=()=>{
  const target=editor?.returnFocus;
  abandon();
  target?.focus({preventScroll:true});
 };
 form.onsubmit=event=>{
  event.preventDefault();
  if(!editor)return;
  const {row,time,returnFocus}=editor;
  mutate(row?{action:'moment-rename',momentId:row.id,label:label.value}:
   {action:'moment-save',time,label:label.value},row?.id,returnFocus);
 };
 panel.addEventListener('toggle',()=>{if(panel.open)update();else reset();});
 dialog.addEventListener('close',()=>{panel.open=false;reset();});
 window.WaveMoments={update,controls,reset};
})();
