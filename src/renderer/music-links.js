'use strict';
(()=>{
 let serial=0;
 const looksLikeLink=value=>/^(?:https?:\/\/|(?:www\.|m\.)?vk\.(?:com|ru)\/)/i.test(value)||value.includes('://');
 async function open(value){
  const ticket=++serial;$('search').value='';window.WaveSearch?.hideHistory();
  try{const result=await call('musicLinks',{action:'resolve',url:value});if(ticket!==serial)return;await navigate(result.route);}
  catch(e){if(ticket===serial)fail(e);}
 }
 async function copy(kind,id,button){
  if(!has('musicLinks'))return;
  try{await call('musicLinks',{action:'copy',kind,id});message('Ссылка скопирована');if(button?.isConnected){button.classList.add('link-copied');setTimeout(()=>button.classList.remove('link-copied'),300);}}
  catch(e){fail(e);}
 }
 const listButton=el('button','secondary hidden','Скопировать ссылку');listButton.id='copy-list-link';listButton.type='button';document.querySelector('.hero-bottom').append(listButton);
 const songButton=el('button','secondary song-album','Скопировать ссылку');songButton.id='copy-song-link';songButton.type='button';$('song-album').after(songButton);songButton.onclick=()=>copy('track',state.current?.id,songButton);
 const render=()=>{const valid=['album','playlist'].includes(state.route.type);listButton.classList.toggle('hidden',!valid);listButton.disabled=!state.ready||!has('musicLinks');songButton.disabled=!state.current||!has('musicLinks');};
 listButton.onclick=()=>copy(state.route.type,state.route.id,listButton);
 new MutationObserver(render).observe($('heading'),{childList:true,characterData:true,subtree:true});
 new MutationObserver(render).observe($('song-title'),{childList:true,characterData:true,subtree:true});
 window.WaveMusicLinks={looksLikeLink,open,copy,render,cancel:()=>serial++};render();
})();
