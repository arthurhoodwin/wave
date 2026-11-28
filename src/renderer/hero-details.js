'use strict';
(()=>{const hero=document.querySelector('.hero'),description=el('p','playlist-description');description.id='playlist-description';description.hidden=true;$('subtitle').after(description);const liked=new URL('liked-cover.svg',location.href).href;let key='',epoch=0,overrideSession=-1;const overrides=new Map();
 function plain(text){const box=document.createElement('textarea');box.innerHTML=String(text||'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').slice(0,2000);return box.value;}
 function paintTint(rgb){
  if(!Array.isArray(rgb)||rgb.length!==3||rgb.some(n=>!Number.isInteger(n)||n<0||n>255))return;
  hero.style.setProperty('--cover-tint',rgb.map(n=>Math.round(n*.24+16)).join(' '));
  hero.classList.add('cover-tinted');
 }
 function remember(id,value){
  if(overrideSession!==state.sessionRevision){overrideSession=state.sessionRevision;overrides.clear();}
  overrides.delete(id);overrides.set(id,value);
  while(overrides.size>16)overrides.delete(overrides.keys().next().value);
 }
 function render(){const route=state.route,list=['playlist','album'].includes(route.type),library=route.type==='library';document.body.classList.toggle('liked-page',library);const value=list?plain(state.listDescription):'';if(description.textContent!==value)description.textContent=value;description.hidden=!value;
  if(library){const img=$('hero-cover');img.classList.remove('hidden');if(img.src!==liked)img.src=liked;}
  const next=JSON.stringify([state.sessionRevision,route.type,route.id,route.cover,ownPlaylist()]);if(next===key)return;key=next;const ticket=++epoch;hero.style.removeProperty('--cover-tint');hero.classList.remove('cover-tinted');if(library){const img=$('hero-cover');img.classList.remove('hidden');img.src=liked;img.onerror=()=>img.classList.add('hidden');hero.style.setProperty('--cover-tint','63 52 98');hero.classList.add('cover-tinted');const nav=document.querySelector('#library-nav .tile');if(nav&&!nav.classList.contains('liked-cover')){nav.classList.add('liked-cover');nav.replaceChildren();const icon=document.createElement('img');icon.src=liked;icon.alt='';nav.append(icon);}return;}
  const remote=()=>{
   if(!list||!route.cover||!has('artworkPalette'))return;
   call('artworkPalette',route.id).then(rgb=>{if(ticket===epoch)paintTint(rgb);}).catch(()=>{});
  };
  if(route.type!=='playlist'||!ownPlaylist()||!has('personal')){remote();return;}
  if(overrideSession!==state.sessionRevision){overrideSession=state.sessionRevision;overrides.clear();}
  const currentId=route.id, session=state.sessionRevision;
  const apply=value=>{
   if(ticket!==epoch||session!==state.sessionRevision||state.route.id!==currentId)return;
   if(!value?.image){remote();return;}
   heroCover(route.cover);
   paintTint(value.tint);
  };
  if(overrides.has(currentId)){apply(overrides.get(currentId));return;}
  call('personal',{action:'playlist-cover',id:currentId}).then(value=>{
   if(ticket!==epoch||session!==state.sessionRevision)return;
   remember(currentId,value);apply(value);
  }).catch(()=>{if(ticket===epoch)remote();});
 }
 window.WaveHero={
  render,
  localCover(id){return overrideSession===state.sessionRevision?overrides.get(id)?.image:null;},
  setPlaylistCover(id,result){
   remember(id,result);
   if(state.route.type==='playlist'&&state.route.id===id){key='';heroCover(state.route.cover);render();}
  }
 };render();
})();
