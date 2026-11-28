'use strict';
(()=>{
 const body=document.body,shell=document.querySelector('.island-shell');
 const compact=document.getElementById('island-compact'),panel=document.getElementById('island-panel');
 const button=document.getElementById('island-shortcut'),hide=document.getElementById('hide');
 const track=document.getElementById('island-track'),art=document.getElementById('island-art');
 const hint=document.getElementById('island-key-hint'),hideHint=document.getElementById('island-hide-hint');
 const source=document.getElementById('art');
 const logo=art.firstElementChild;
 let wide,cover,coverUrl;

 function syncCover(){
  const image=source.querySelector('img');
  if(image===cover&&image?.src===coverUrl)return;
  cover=image;coverUrl=image?.src;
  const thumbnail=image?.cloneNode();
  if(thumbnail){
   thumbnail.alt='';
   thumbnail.onerror=()=>{if(cover===image)art.replaceChildren(logo);};
  }
  art.replaceChildren(thumbnail||logo);
 }

 function update(state){
  if(!state?.island)return;
  const {expanded,shortcut,shortcutActive,fold}=state.island;
  const initial=wide===undefined,wideChanged=wide!==!!fold;
  if(wideChanged)body.dataset.motion='false';
  wide=!!fold;
  for(const edge of ['top','right','bottom','left']){
   shell.style.setProperty('--fold-'+edge,((fold?.[edge]||0)*100)+'%');
  }
  if(wideChanged&&(!initial||fold))shell.getBoundingClientRect();
  const focus=document.activeElement;
  body.dataset.motion='true';
  body.dataset.expanded=String(expanded);
  body.dataset.playing=String(state.playing===true);
  panel.inert=!expanded;
  compact.inert=expanded;
  if(expanded&&focus===button)hide.focus({preventScroll:true});
  if(!expanded&&panel.contains(focus))button.focus({preventScroll:true});
  const key=shortcutActive?shortcut:'';
  if(hint.textContent!==key){hint.textContent=key;hideHint.textContent=key;}
  button.title=key?'Раскрыть мини-плеер · '+key:'Раскрыть мини-плеер';
  hide.title=key?'Свернуть мини-плеер · '+key:'Свернуть мини-плеер';
  button.setAttribute('aria-expanded',String(expanded));
  for(const control of [button,hide]){
   if(key)control.setAttribute('aria-keyshortcuts',key.replace('Ctrl+','Control+'));
   else control.removeAttribute('aria-keyshortcuts');
  }
  const name=state.current?.title||'Wave';
  if(track.textContent!==name){track.textContent=name;track.title=name;}
  syncCover();
 }
 button.onclick=()=>window.desktop.action('toggleIsland').catch(()=>{});
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&body.dataset.expanded==='true'){
   event.preventDefault();window.desktop.action('hideMini').catch(()=>{});
  }
 });
 new MutationObserver(syncCover).observe(source,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
 window.desktop.onState(update);
 window.desktop.status().then(update).catch(()=>{});
})();
