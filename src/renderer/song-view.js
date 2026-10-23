'use strict';
(()=>{
 const dialog=$('song-dialog');let metadata='',lyricsId=null,request=0,controlSignature;
 const close=()=>dialog.classList.add('hidden');
 const heart=()=>{const t=state.current;if(!t||!state.online||state.collectionBusy)return;
  if(t.owned){collectionDialog('Удалить из «Мне нравится»?');setText($('collection-help'),'«'+t.title+'» исчезнет из вашей коллекции. Её можно добавить снова.');$('collection-confirm').classList.remove('hidden');$('collection-confirm').classList.add('danger-action');setText($('collection-confirm'),'Удалить песню');$('collection-confirm').onclick=()=>synchronise({action:'unlike',trackId:t.id});window.WaveDialogs?.focus($('collection-dialog'));}
  else synchronise({action:'like',trackId:t.id});
 };
 function controls(){const t=state.current,signature=JSON.stringify([t?.id,t?.owned,playable(t),state.online,state.collectionBusy,state.busy,state.playing,dialog.open,$('toggle').disabled,$('next').disabled,$('previous').disabled]);if(controlSignature===signature)return;controlSignature=signature;for(const id of ['now-heart','song-heart']){const b=$(id),owned=t?.owned===true,label=owned?'Удалить из «Мне нравится»':'Добавить в «Мне нравится»';b.disabled=!t||!state.online||state.collectionBusy||!has('mutate');b.classList.toggle('is-liked',owned);if(b.getAttribute('aria-pressed')!==String(owned))b.setAttribute('aria-pressed',String(owned));if(b.title!==label){b.title=label;b.setAttribute('aria-label',label);}b.setAttribute('aria-busy',String(!!state.collectionBusy));}
  if(!dialog.open)return;for(const id of ['previous','toggle','next']){const b=$('song-'+id),source=$(id);b.disabled=id==='toggle'?(!state.online&&!state.nativePlayback)||!playable(t):id==='next'?!state.online||!hasNextTrack():!state.online||!previousTrack();if(id==='toggle'){setIcon(b,state.playing||state.busy?'pause':'play');b.setAttribute('aria-label',state.playing||state.busy?'Пауза':'Воспроизвести');}}setText($('song-state'),state.busy?'Подключаем песню…':!playable(t)?'Недоступна в VK':state.playing?'Сейчас играет':'На паузе');
 }
 async function lyrics(force=false){const t=state.current;if(!t)return;if(!force&&lyricsId===t.id)return;lyricsId=t.id;const ticket=++request;setText($('song-lyrics'),'');setText($('lyrics-status'),'Загружаем текст из VK…');setText($('lyrics-credit'),'');$('lyrics-retry').classList.add('hidden');$('song-lyrics-panel').setAttribute('aria-busy','true');
  try{const result=await call('lyrics',t.id);if(ticket!==request||state.current?.id!==t.id)return;setText($('song-lyrics'),result.text||'');setText($('lyrics-status'),result.text?'Текст · VK':'Для этой записи в VK нет текста.');setText($('lyrics-credit'),result.credits||'');$('song-lyrics').scrollTop=0;}
  catch(e){if(ticket!==request||state.current?.id!==t.id)return;setText($('lyrics-status'),e.message||'Не удалось загрузить текст. Повторите попытку.');$('lyrics-retry').classList.remove('hidden');}
  finally{if(ticket===request)$('song-lyrics-panel').setAttribute('aria-busy','false');}
 }
 function update(){controls();if(!dialog.open)return;const t=state.current;if(!t){close();return;}const signature=JSON.stringify([t.id,t.title,t.artist,t.cover,t.artists]);if(signature!==metadata){metadata=signature;setText($('song-title'),t.title);$('song-cover').replaceChildren(coverNode(t.cover,'song-cover-image'));const authors=artistLinks(t,'song-artists artist-links');for(const [index,b] of [...authors.querySelectorAll('button')].entries())b.onclick=e=>{e.stopPropagation();close();openArtist(t,index);};$('song-artists').replaceChildren(authors);}
  lyrics();
 }
 function open(){if(!state.current)return;dialog.classList.remove('hidden');queueMicrotask(()=>{update();$('song-close').focus({preventScroll:true});});}
 for(const id of ['now-heart','song-heart'])$(id).onclick=heart;
 $('song-close').onclick=close;$('now-art').onclick=open;
 for(const id of ['previous','toggle','next'])$('song-'+id).onclick=()=>$(id).click();
 $('lyrics-retry').onclick=()=>lyrics(true);
 // Invalidate the old request on close without discarding the visible text cache.
 dialog.addEventListener('close',()=>{request++;lyricsId=null;});
 window.WaveSong={open,update,controls};controls();
})();
