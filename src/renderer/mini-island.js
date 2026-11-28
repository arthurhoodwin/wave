'use strict';
(()=>{
 const button=document.getElementById('island-shortcut'),panel=document.getElementById('island-panel');
 function update(state){
  if(!state?.island)return;
  const {expanded,shortcut,shortcutActive}=state.island;
  document.body.dataset.expanded=String(expanded);
  panel.hidden=!expanded;
  if(!expanded)for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();
  button.textContent=shortcutActive?shortcut:'⌄';
  button.title=shortcutActive?'Раскрыть или свернуть · '+shortcut:'Раскрыть или свернуть';
  button.setAttribute('aria-expanded',String(expanded));
  button.setAttribute('aria-label',button.title);
  const t=state.current;
  const track=document.getElementById('island-track');
  const name=t?.title||'Wave';
  if(track.textContent!==name)track.textContent=name;
 }
 const action=()=>window.desktop.action('toggleIsland').catch(()=>{});
 button.onclick=action;
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.body.dataset.expanded==='true'&&!document.querySelector('dialog[open]')){
   event.preventDefault();action();
  }
 });
 window.desktop.onState(update);
 window.desktop.status().then(update).catch(()=>{});
})();
