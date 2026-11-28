'use strict';
(()=>{
 const body=document.body,shell=document.querySelector('.island-shell');
 const compact=document.getElementById('island-compact'),panel=document.getElementById('island-panel');
 const button=document.getElementById('island-shortcut'),hide=document.getElementById('hide');
 const track=document.getElementById('island-track'),art=document.getElementById('island-art');
 const hint=document.getElementById('island-key-hint'),hideHint=document.getElementById('island-hide-hint');
 const source=document.getElementById('art'),logo=art.firstElementChild;
 let cover,coverUrl,armed,desired=false,revision=0,settling=null,anchorKey;

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

 function anchor(fold){
  if(!fold)return;
  const x=fold.left/(fold.left+fold.right)||0;
  const y=fold.top/(fold.top+fold.bottom)||0;
  const key=x+','+y;
  if(key===anchorKey)return;
  anchorKey=key;
  shell.style.setProperty('--anchor-x',String(x));
  shell.style.setProperty('--anchor-y',String(y));
 }

 function reflect(expanded,animate){
  const focus=document.activeElement;
  body.dataset.motion=String(animate);
  body.dataset.expanded=String(expanded);
  panel.inert=!expanded;
  compact.inert=expanded;
  if(expanded&&focus===button)hide.focus({preventScroll:true});
  if(!expanded&&panel.contains(focus))button.focus({preventScroll:true});
  button.setAttribute('aria-expanded',String(expanded));
 }

 function reset(){
  revision++;
  desired=false;
  settling=null;
  armed=null;
  reflect(false,false);
  shell.getBoundingClientRect();
 }

 window.WaveIslandMotion={reset,prepare(fold){
  reset();
  armed={width:innerWidth,height:innerHeight};
  shell.style.setProperty('--compact-width',armed.width+'px');
  shell.style.setProperty('--compact-height',armed.height+'px');
  anchor(fold);
  shell.getBoundingClientRect();
 }};

 function move(expanded){
  if(desired===expanded)return;
  desired=expanded;
  const version=++revision;
  if(!expanded||!armed){
   armed=null;
   reflect(expanded,true);
   return;
  }
  const {width,height}=armed,start=performance.now();
  armed=null;
  const afterResize=()=>{
   if(version!==revision)return;
   if(innerWidth===width&&innerHeight===height&&performance.now()-start<120){
    requestAnimationFrame(afterResize);
    return;
   }
   // Commit the still-folded shape with the new viewport before starting the morph.
   shell.getBoundingClientRect();
   requestAnimationFrame(()=>{if(version===revision)reflect(true,true);});
  };
  requestAnimationFrame(afterResize);
 }

 function acknowledge(motion){
  if(!Number.isSafeInteger(motion)||motion===settling)return;
  settling=motion;
  const finishes=[shell,compact,panel].flatMap(node=>node.getAnimations()
   .filter(animation=>['clip-path','opacity'].includes(animation.transitionProperty))
   .map(animation=>animation.finished));
  Promise.allSettled(finishes).then(()=>{
   if(settling===motion&&!desired)window.desktop.settleMotion?.(motion);
  });
 }

 function update(state){
  if(!state?.island)return;
  const {expanded,shortcut,shortcutActive,fold,settling:motion}=state.island;
  anchor(fold);
  move(expanded===true);
  if(!expanded)acknowledge(motion);
  body.dataset.playing=String(state.playing===true);
  const key=shortcutActive?shortcut:'';
  if(hint.textContent!==key){hint.textContent=key;hideHint.textContent=key;}
  button.title=key?'Раскрыть мини-плеер · '+key:'Раскрыть мини-плеер';
  hide.title=key?'Свернуть мини-плеер · '+key:'Свернуть мини-плеер';
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
  if(event.key==='Escape'&&desired){
   event.preventDefault();window.desktop.action('hideMini').catch(()=>{});
  }
 });
 new MutationObserver(syncCover).observe(source,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
 window.desktop.onState(update);
 window.desktop.status().then(update).catch(()=>{});
})();
